"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoBack } from "@/components/use-go-back";
import {
  IconArrowDownLeft,
  IconArrowDownRight,
  IconArrowUpRight,
  IconBell,
  IconDots,
  IconFlag,
  IconLock,
  IconPencil,
  IconPercentage,
  IconScale,
  IconTransfer,
  IconTrash,
} from "@tabler/icons-react";
import type { Loan } from "@/lib/types";
import { formatDayMonth, formatINRExact } from "@/lib/format";
import { round2 } from "@/lib/balances";
import AddTransactionSheet from "@/components/add-transaction-sheet";
import AddLoanSheet from "@/components/add-loan-sheet";

export type LoanHistoryRow = {
  key: string;
  date: string;
  title: string;
  subtitle: string | null;
  /** Signed display amount — colour and sign are driven by `tone`. */
  display: string;
  /** green-sign "+", red-sign "−", neutral secondary, or muted flat. */
  tone: "income" | "expense" | "interest" | "neutral";
};

function ToneIcon({ tone }: { tone: LoanHistoryRow["tone"] }) {
  switch (tone) {
    case "expense":
      return <IconArrowDownRight size={17} />;
    case "interest":
      return <IconPercentage size={17} />;
    case "neutral":
      return <IconFlag size={17} />;
    default:
      return <IconArrowUpRight size={17} />;
  }
}

function toneStyle(tone: LoanHistoryRow["tone"]): React.CSSProperties {
  switch (tone) {
    case "income":
      return { color: "var(--green)", background: "rgba(36,168,65,0.1)" };
    case "expense":
      return { color: "var(--red)", background: "rgba(176,86,47,0.1)" };
    case "interest":
      return { color: "var(--text-secondary)", background: "rgba(0,0,0,0.05)" };
    default:
      return { color: "var(--text-tertiary)", background: "rgba(0,0,0,0.05)" };
  }
}

function toneTextStyle(tone: LoanHistoryRow["tone"]): string {
  switch (tone) {
    case "income":
      return "t-green";
    case "expense":
      return "t-red";
    default:
      return "t-secondary";
  }
}

function dateLabel(date: string): string | null {
  if (!date) return null;
  const d = new Date(date);
  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((dayStart.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function LoanDetailView({
  loan,
  partyName,
  balance,
  isAdmin,
  rows,
  hasActivity,
  reminder,
}: {
  loan: Loan;
  partyName: string;
  balance: number;
  isAdmin: boolean;
  rows: LoanHistoryRow[];
  hasActivity: number;
  reminder: { caption: string; value: string } | null;
}) {
  const router = useRouter();
  const goBack = useGoBack("/app/loans");
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [writeoffOpen, setWriteoffOpen] = useState(false);
  const [writeoffRemark, setWriteoffRemark] = useState("");
  const [busy, setBusy] = useState(false);
  const [writeoffBusy, setWriteoffBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [writeoffError, setWriteoffError] = useState<string | null>(null);

  const b = round2(balance);
  const isGiven = loan.direction === "given";
  const credit = b < 0;
  const extra = Math.abs(b);
  const canWriteOff = isAdmin && b > 0;

  async function onDelete() {
    setBusy(true);
    setError(null);
    const { createClient } = await import("@/lib/supabase/client");
    const { error: err } = await createClient().rpc("fp_delete_loan", { p_id: loan.id });
    setBusy(false);
    if (err) {
      setError(err.message);
      setConfirmDelete(false);
      return;
    }
    router.push("/app/loans");
    router.refresh();
  }

  async function onWriteOff() {
    setWriteoffBusy(true);
    setWriteoffError(null);
    const { createClient } = await import("@/lib/supabase/client");
    const { error: err } = await createClient().rpc("fp_write_off_loan", {
      p_loan_id: loan.id,
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

  const accent =
    credit ? "#3E7CA6" : isGiven ? "var(--green)" : "var(--red)";
  const heroLabel = credit
    ? "Credit balance"
    : b === 0
      ? "All settled"
      : "Outstanding";

  const heroAmount = credit ? extra : b;
  const heroSign = credit ? "+" : "";
  const heroSub = credit
    ? `${isGiven ? partyName : "You"} paid ${formatINRExact(extra)} more than owed`
    : b === 0
      ? "Fully repaid"
      : `of ${formatINRExact(loan.principal_amount)} principal`;

  const rateMeta =
    loan.interest_rate != null
      ? `${loan.interest_rate}% / yr`
      : "Interest-free";
  const dueMeta = loan.due_date ? formatDayMonth(loan.due_date) : "—";

  return (
    <div className="min-h-screen pb-24">
      {/* ---------- Top bar ---------- */}
      <div className="flex items-center justify-between px-5 pt-6 pb-2">
        <button
          type="button"
          className="icon-btn"
          aria-label="Back"
          onClick={goBack}
        >
          <span className="text-[16px] leading-none">‹</span>
        </button>
        <h1 className="text-[17px] font-bold">Loans</h1>
        <div className="relative">
          {isAdmin && (
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
                <IconPencil size={15} /> Edit loan
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
                <IconTrash size={15} /> Delete loan
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ---------- Hero ---------- */}
      <div className="card mx-5 mt-3 p-5">
        <div className="flex items-center justify-between">
          <div>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
              style={{
                background: isGiven ? "rgba(36,168,65,0.12)" : "rgba(176,86,47,0.12)",
                color: isGiven ? "var(--green)" : "var(--red)",
              }}
            >
              {isGiven ? <IconArrowUpRight size={12} /> : <IconArrowDownLeft size={12} />}
              {isGiven ? "Given" : "Taken"}
            </span>
            <div className="text-[22px] font-bold mt-2 tracking-tight">{partyName}</div>
          </div>
          <div style={{ color: accent }}>
            {isGiven ? <IconArrowUpRight size={26} /> : <IconArrowDownLeft size={26} />}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-[11.5px] font-bold uppercase tracking-wide t-secondary">{heroLabel}</div>
          <div className="text-[30px] font-bold num mt-1" style={{ color: accent }}>
            {heroSign}
            {formatINRExact(heroAmount)}
          </div>
          <div className="text-[12px] font-semibold t-tertiary mt-1">{heroSub}</div>
        </div>

        <div className="flex items-stretch gap-4 mt-5 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="flex-1">
            <div className="text-[10.5px] font-bold uppercase tracking-wide t-tertiary mb-1">Interest</div>
            <div className="text-[13.5px] font-bold">{rateMeta}</div>
          </div>
          <div className="w-px bg-[var(--border)]" />
          <div className="flex-1">
            <div className="text-[10.5px] font-bold uppercase tracking-wide t-tertiary mb-1">Started</div>
            <div className="text-[13.5px] font-bold">{formatDayMonth(loan.start_date)}</div>
          </div>
          <div className="w-px bg-[var(--border)]" />
          <div className="flex-1">
            <div className="text-[10.5px] font-bold uppercase tracking-wide t-tertiary mb-1">Due</div>
            <div className="text-[13.5px] font-bold">{dueMeta}</div>
          </div>
        </div>
      </div>

      {/* ---------- Actions ---------- */}
      <div className="flex gap-3 mx-5 mt-4">
        <button
          type="button"
          className="btn btn-primary flex-1"
          onClick={() => setPaying(true)}
        >
          <IconTransfer size={16} /> Log repayment or interest
        </button>
      </div>

      {!isAdmin && (
        <p className="text-center text-[11.5px] font-semibold t-tertiary mt-3">
          Repayments are settled by the family admin — interest can be logged by anyone.
        </p>
      )}

      {/* ---------- Reminder ---------- */}
      {reminder && (
        <div className="card mx-5 mt-4 p-4 flex items-center gap-3">
          <div className="txn-icon">
            <IconBell size={17} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold t-secondary">{reminder.caption}</div>
            <div className="text-[13.5px] font-bold mt-0.5">{reminder.value}</div>
          </div>
        </div>
      )}

      {/* ---------- History ---------- */}
      <div className="section-label">History</div>

      {rows.length === 0 ? (
        <div className="card mx-5 p-6 text-center">
          <p className="text-[13.5px] font-bold mb-1">No activity yet</p>
          <p className="text-[12.5px] font-semibold t-secondary">
            Repayments and interest on this loan will show up here.
          </p>
        </div>
      ) : (
        <div className="mx-5 rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          {rows.map((r, i) => (
            <div
              key={r.key}
              className={`flex items-center gap-3 px-4 py-3.5 ${i > 0 ? "border-t" : ""}`}
              style={{ borderColor: "var(--border)" }}
            >
              <div className="txn-icon" style={toneStyle(r.tone)}>
                <ToneIcon tone={r.tone} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="txn-title truncate">{r.title}</div>
                <div className="txn-sub">
                  {dateLabel(r.date)}
                  {r.subtitle ? ` · ${r.subtitle}` : ""}
                </div>
              </div>
              <span className={`text-[13.5px] font-bold num ${toneTextStyle(r.tone)}`}>
                {r.display}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-center text-[10.5px] font-semibold t-tertiary px-8 mt-4 leading-relaxed">
        Repayments and interest are recorded from Add Transaction — this screen
        shows history only.
      </p>

      {error && <p className="text-[12.5px] font-semibold t-red mx-5 mt-3">{error}</p>}

      {/* ---------- Sheets / dialogs ---------- */}
      {editing && (
        <AddLoanSheet open onClose={() => setEditing(false)} loan={loan} hasActivity={hasActivity > 0} />
      )}

      {paying && (
        <AddTransactionSheet
          prefill={{
            loanId: loan.id,
            loanName: partyName,
            loanBalance: balance,
            loanDirection: loan.direction,
          }}
          onClose={() => setPaying(false)}
        />
      )}

      {confirmDelete &&
        (hasActivity === 0 ? (
          <div className="dialog-overlay">
            <div className="dialog">
              <div className="w-11 h-11 rounded-full bg-[rgba(176,86,47,0.12)] flex items-center justify-center mx-auto mb-3">
                <span className="text-[18px] t-red">!</span>
              </div>
              <h2 className="text-[16px] font-bold mb-1">Delete loan?</h2>
              <p className="text-[12.5px] font-semibold t-secondary leading-relaxed mb-5">
                {b > 0
                  ? `This removes the loan and its one-time principal transfer, so the ${formatINRExact(b)} it tracked disappears. External loans drop their principal transfer too; family-member loans keep their transfer records.`
                  : `This removes the loan. Its ${loan.counterparty_user_id ? "transfer" : "one-time principal transfer"} records stay in the family ledger.`}
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
        ) : (
          <div className="dialog-overlay">
            <div className="dialog">
              <div className="w-11 h-11 rounded-full bg-[rgba(176,86,47,0.12)] flex items-center justify-center mx-auto mb-3">
                <span className="text-[18px] t-red">!</span>
              </div>
              <h2 className="text-[16px] font-bold mb-1">Can&apos;t delete this loan</h2>
              <p className="text-[12.5px] font-semibold t-secondary leading-relaxed mb-5">
                {hasActivity} recorded repayment, interest, or write-off{" "}
                {hasActivity === 1 ? "row references" : "rows reference"} it, so
                it can&apos;t be deleted. Write off any balance to zero instead if
                you&apos;re done with it — the history stays as the audit trail.
              </p>
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={() => setConfirmDelete(false)}
              >
                Got it
              </button>
            </div>
          </div>
        ))}

      {writeoffOpen && (
        <div className="dialog-overlay">
          <div className="dialog">
            <div className="w-11 h-11 rounded-full bg-[rgba(176,86,47,0.12)] flex items-center justify-center mx-auto mb-3">
              <IconScale size={20} className="t-red" />
            </div>
            <h2 className="text-[16px] font-bold mb-1">
              Write off {formatINRExact(b)} to zero?
            </h2>
            <p className="text-[12.5px] font-semibold t-secondary leading-relaxed mb-4">
              {isGiven
                ? `Closing ${partyName}'s loan to ₹0 — recorded as a family Balance Write-off (a loss for you). No payment is created.`
                : `Closing your ${partyName} loan to ₹0 — recorded as a family Balance Write-off (forgiven debt). No payment is created.`}
            </p>
            <label className="text-[11.5px] font-bold uppercase tracking-wide t-secondary block mb-1.5">
              Remarks <span className="t-red">*</span>
            </label>
            <textarea
              className="input w-full min-h-[96px] resize-none"
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
        <IconLock size={11} /> Balance is always computed from transactions
      </div>
    </div>
  );
}