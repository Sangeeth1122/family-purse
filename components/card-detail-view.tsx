"use client";

import { useState } from "react";
import { useEsc } from "@/components/use-esc";
import { useGoBack } from "@/components/use-go-back";
import { useRouter } from "next/navigation";
import {
  IconCreditCard,
  IconDots,
  IconLock,
  IconPencil,
  IconScale,
  IconTrash,
} from "@tabler/icons-react";
import type { Card } from "@/lib/types";
import { formatINRExact } from "@/lib/format";
import { round2 } from "@/lib/balances";
import AddTransactionSheet from "@/components/add-transaction-sheet";
import AddCardSheet from "@/components/add-card-sheet";
import TransactionRow, { type TxnRowDatum } from "@/components/transaction-row";

export default function CardDetailView({
  card,
  ownerName,
  outstanding,
  isOwner,
  isAdmin,
  rows,
}: {
  card: Card;
  ownerName: string;
  outstanding: number;
  isOwner: boolean;
  isAdmin: boolean;
  rows: TxnRowDatum[];
}) {
  const router = useRouter();
  const goBack = useGoBack("/app/cards");
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [writeoffOpen, setWriteoffOpen] = useState(false);
  useEsc(confirmDelete, () => setConfirmDelete(false));
  useEsc(writeoffOpen, () => setWriteoffOpen(false));
  const [writeoffRemark, setWriteoffRemark] = useState("");
  const [busy, setBusy] = useState(false);
  const [writeoffBusy, setWriteoffBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [writeoffError, setWriteoffError] = useState<string | null>(null);

  const canManage = isOwner || isAdmin;
  const balance = round2(outstanding);
  const credit = balance < 0;
  const canWriteOff = isAdmin && balance > 0;

  async function onDelete() {
    setBusy(true);
    setError(null);
    const { createClient } = await import("@/lib/supabase/client");
    const { error: err } = await createClient()
      .from("credit_cards")
      .delete()
      .eq("id", card.id);
    setBusy(false);
    if (err) {
      setError(err.message);
      setConfirmDelete(false);
      return;
    }
    router.push("/app/cards");
    router.refresh();
  }

  async function onWriteOff() {
    setWriteoffBusy(true);
    setWriteoffError(null);
    const { createClient } = await import("@/lib/supabase/client");
    const { error: err } = await createClient().rpc("fp_write_off_card", {
      p_card_id: card.id,
      p_remark: writeoffRemark.trim(),
    });
    setWriteoffBusy(false);
    if (err) {
      setWriteoffError(err.message);
      return;
    }
    setWriteoffOpen(false);
    setWriteoffRemark("");
    router.refresh();
  }

  return (
    <div className="min-h-screen pb-24">
      {/* ---------- Top bar ---------- */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <button
          type="button"
          className="icon-btn"
          aria-label="Back"
          onClick={goBack}
        >
          <span className="text-[16px] leading-none">‹</span>
        </button>
        <h1 className="text-[17px] font-bold truncate px-2">{card.name}</h1>
        <div className="relative">
          {canManage && (
            <button
              type="button"
              className="icon-btn"
              aria-label="More options"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <IconDots size={20} />
            </button>
          )}
          {menuOpen && (
            <div className="absolute right-0 top-10 z-40 w-44 card p-1 shadow-lg">
              <button
                type="button"
                className="w-full text-left px-3.5 py-2.5 text-[13px] font-bold rounded-md hover:bg-[rgba(0,0,0,0.04)] flex items-center gap-2"
                onClick={() => {
                  setMenuOpen(false);
                  setEditing(true);
                }}
              >
                <IconPencil size={15} /> Edit card
              </button>
              {canWriteOff && (
                <button
                  type="button"
                  className="w-full text-left px-3.5 py-2.5 text-[13px] font-bold rounded-md hover:bg-[rgba(0,0,0,0.04)] flex items-center gap-2"
                  onClick={() => {
                    setMenuOpen(false);
                    setWriteoffOpen(true);
                    setWriteoffRemark("");
                    setWriteoffError(null);
                  }}
                >
                  <IconScale size={15} /> Write off to zero
                </button>
              )}
              <button
                type="button"
                className="w-full text-left px-3.5 py-2.5 text-[13px] font-bold t-red rounded-md hover:bg-[rgba(0,0,0,0.04)] flex items-center gap-2"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmDelete(true);
                }}
              >
                <IconTrash size={15} /> Delete card
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ---------- Card visual ---------- */}
      <div
        className="mx-5 mt-3 rounded-2xl px-5 py-5 text-[#F7F4EE] relative overflow-hidden"
        style={{ background: "linear-gradient(135deg,#1A1A18,#2E2A24)" }}
      >
        <div className="flex items-center justify-between text-[12px] font-bold opacity-85">
          <span>{ownerName}</span>
          {card.status === "closed" && <span>Closed</span>}
        </div>
        <div className="text-[17px] font-bold mt-5 mr-6">{card.name}</div>
        <div className="flex items-center justify-between mt-6 text-[10.5px] font-semibold opacity-70 tracking-wide">
          <span className="flex items-center gap-1.5">
            <IconCreditCard size={13} /> FAMILY PURSE
          </span>
          <span>CREDIT CARD</span>
        </div>
      </div>

      {/* ---------- Balance summary ---------- */}
      <div className="card mx-5 mt-3 p-5 flex items-center justify-between">
        <div>
          <div className="text-[11.5px] font-bold uppercase tracking-wide t-secondary">
            {credit ? "Credit balance" : "Outstanding"}
          </div>
          <div
            className="text-[26px] font-bold num mt-1"
            style={{ color: credit ? "var(--green)" : balance > 0 ? "var(--red)" : "var(--text)" }}
          >
            {formatINRExact(Math.abs(balance))}
          </div>
          <div className="text-[12px] font-semibold t-tertiary mt-1">
            {credit
              ? "You've paid more than you owe"
              : balance > 0
                ? "Derived from transactions on this card"
                : "All settled"}
          </div>
        </div>
      </div>

      {/* ---------- Actions ---------- */}
      {!card.status || card.status === "active" ? (
        <div className="flex gap-3 mx-5 mt-4">
          <button
            type="button"
            className="btn btn-primary flex-1"
            onClick={() => setPaying(true)}
          >
            <IconCreditCard size={16} /> Make a payment
          </button>
        </div>
      ) : null}

      {!isAdmin && (
        <p className="text-center text-[11.5px] font-semibold t-tertiary mt-3">
          Card payments are settled by the family admin.
        </p>
      )}

      {/* ---------- Recent activity ---------- */}
      <div className="section-label">Recent activity</div>

      {rows.length === 0 ? (
        <div className="card mx-5 p-6 text-center">
          <p className="text-[13.5px] font-bold mb-1">No activity yet</p>
          <p className="text-[12.5px] font-semibold t-secondary">
            Spends on this card and its payments will show up here.
          </p>
        </div>
      ) : (
        <div className="px-5 flex flex-col gap-2.5">
          {rows.map((r) => (
            <TransactionRow
              key={r.id}
              t={r}
              sign={r.reduceBalance ? "in" : "auto"}
            />
          ))}
        </div>
      )}

      {error && <p className="text-[12.5px] font-semibold t-red mx-5 mt-3">{error}</p>}

      {/* ---------- Sheets / dialogs ---------- */}
      {editing && (
        <AddCardSheet open onClose={() => setEditing(false)} card={card} />
      )}

      {paying && (
        <AddTransactionSheet
          prefill={{ cardId: card.id, cardName: card.name, outstanding: balance }}
          onClose={() => setPaying(false)}
        />
      )}

      {confirmDelete && (
        <div
          className="dialog-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-card-title"
        >
          <div className="dialog">
            <div className="w-12 h-12 rounded-full bg-[rgba(176,86,47,0.12)] flex items-center justify-center mx-auto mb-3.5">
              <IconTrash size={22} className="t-red" />
            </div>
            <h2 id="delete-card-title" className="text-[16px] font-bold mb-2">Delete card?</h2>
            <p className="text-[13.5px] font-medium t-secondary leading-relaxed mb-5">
              {balance > 0
                ? `${card.name} still has ${formatINRExact(balance)} outstanding. Deleting it removes the card but keeps its transactions in the family records.`
                : `This removes ${card.name} from your cards. Its transactions stay in the family records.`}
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                className="btn btn-secondary flex-1"
                onClick={() => setConfirmDelete(false)}
              >
                Keep
              </button>
              <button
                type="button"
                className="btn btn-red flex-1"
                disabled={busy}
                onClick={onDelete}
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {writeoffOpen && (
        <div
          className="dialog-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="writeoff-title"
        >
          <div className="dialog">
            <div className="w-11 h-11 rounded-full bg-[rgba(176,86,47,0.12)] flex items-center justify-center mx-auto mb-3.5">
              <IconScale size={19} className="t-red" />
            </div>
            <h2 id="writeoff-title" className="text-[16px] font-bold mb-1.5">
              Write off {formatINRExact(balance)} to zero?
            </h2>
            <p className="text-[13px] font-medium t-secondary leading-relaxed mb-4">
              This closes {card.name}&apos;s outstanding to <b className="font-bold t-primary">₹0</b>. No payment is
              created — it is logged as a family <b className="font-bold t-primary">Balance Write-off</b> you can
              audit later, and its transactions stay untouched.
            </p>
            <label className="text-[11.5px] font-bold uppercase tracking-wide t-secondary block mb-1.5">
              Remarks <span className="t-red">*</span>
            </label>
            <textarea
              className="input w-full min-h-[70px] resize-none"
              placeholder="Why is this balance being written off?"
              value={writeoffRemark}
              onChange={(e) => setWriteoffRemark(e.target.value)}
              required
            />
            <p className="text-[11px] font-semibold t-tertiary mt-1.5 mb-4">
              Required — this becomes the permanent record of the write-off.
            </p>
            {writeoffError && (
              <p className="text-[12.5px] font-semibold t-red mb-3">{writeoffError}</p>
            )}
            <div className="flex gap-2.5">
              <button
                type="button"
                className="btn btn-secondary flex-1"
                disabled={writeoffBusy}
                onClick={() => setWriteoffOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-red flex-1"
                disabled={writeoffBusy || writeoffRemark.trim().length === 0}
                onClick={onWriteOff}
              >
                {writeoffBusy ? "Writing off…" : "Write off"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-1.5 text-center text-[10.5px] font-semibold t-tertiary pt-6">
        <IconLock size={11} /> Outstanding is always computed from transactions
      </div>
    </div>
  );
}