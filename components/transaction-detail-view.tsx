"use client";

import { createElement, useState } from "react";
import { useRouter } from "next/navigation";
import { useGoBack } from "@/components/use-go-back";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import type { Category, Transaction } from "@/lib/types";
import { formatFullDate, formatTime } from "@/lib/format";
import { categoryIcon } from "@/lib/category-icons";
import AddTransactionSheet from "@/components/add-transaction-sheet";

export type DetailTxn = Transaction & { amount_formatted: string };

const TYPE_LABEL: Record<string, string> = {
  expense: "Expense",
  revenue: "Revenue",
  interest_income: "Interest received",
  interest_expense: "Interest paid",
  card_payment: "Card payment",
  loan_repayment: "Loan repayment",
  transfer: "Transfer",
};

export default function TransactionDetailView({
  txn,
  category,
  cardName,
  loanName,
  counterpartyName,
  creatorName,
  isYou,
  isAdmin,
  cancellable,
  initialAvatar,
}: {
  txn: DetailTxn;
  category: Category | null;
  cardName: string | null;
  loanName: string | null;
  counterpartyName: string | null;
  creatorName: string;
  isYou: boolean;
  isAdmin: boolean;
  cancellable: boolean;
  initialAvatar: string;
}) {
  const router = useRouter();
  const goBack = useGoBack("/app/dashboard");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOut =
    txn.type === "expense" ||
    txn.type === "interest_expense" ||
    txn.type === "card_payment" ||
    txn.type === "loan_repayment" ||
    (txn.type === "transfer" && txn.counterparty_user_id === null);
  const isIn = txn.type === "revenue" || txn.type === "interest_income";
  const isPairedTransfer =
    txn.kind === "settlement" && txn.type === "transfer" && txn.counterparty_user_id !== null;

  async function onDelete() {
    setBusy(true);
    setError(null);
    const { createClient } = await import("@/lib/supabase/client");
    const { error: err } = await createClient().rpc("fp_delete_transaction", {
      p_id: txn.id,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push("/app/dashboard");
    router.refresh();
  }

  if (editing) {
    return (
      <AddTransactionSheet
        initial={txn as Transaction}
        onClose={() => {
          setEditing(false);
          router.refresh();
        }}
      />
    );
  }

  // Contract Issue 5 / app-role rules mirrored client-side for menus; the
  // engine (RPCs) re-enforces them server-side.
  const ownerEdit =
    txn.kind === "pl" && txn.scope_type === "personal" && isYou;
  const canEdit = txn.kind === "pl" ? ownerEdit || isAdmin : isAdmin;

  return (
    <div className="min-h-screen pb-8">
      <div className="flex items-center justify-between px-5 pt-5 pb-1">
        <button
          type="button"
          className="icon-btn"
          style={{ width: 36, height: 36 }}
          onClick={goBack}
          aria-label="Back"
        >
          <span className="text-[17px] leading-none">‹</span>
        </button>
        <span className="text-[16px] font-bold">Transaction</span>
        <button
          type="button"
          className="icon-btn"
          style={{ width: 36, height: 36 }}
          aria-label="Edit"
          onClick={() => setEditing(true)}
          disabled={!canEdit}
        >
          <IconPencil size={18} />
        </button>
      </div>

      <div className="card mx-5 mt-5 flex flex-col items-center text-center px-5 py-6">
        <span
          className="h-[52px] w-[52px] rounded-full bg-[rgba(0,0,0,0.04)] flex items-center justify-center mb-3.5 t-secondary"
        >
          {createElement(categoryIcon(category?.name ?? null, txn.type), { size: 24, stroke: 1.8 })}
        </span>
        <span
          className="text-[30px] font-semibold num"
          style={{ color: isOut ? "var(--red)" : isIn ? "var(--green)" : "var(--text)" }}
        >
          {isOut ? "−" : isIn ? "+" : ""} {txn.amount_formatted}
        </span>
        <span className="text-[15px] font-semibold t-secondary mt-1.5">
          {txn.note || TYPE_LABEL[txn.type] || txn.type}
        </span>
      </div>

      <div className="card mx-5 mt-3.5 overflow-hidden">
        {txn.kind === "pl" && (
          <Row
            k="Category"
            v={category ? category.name : "Uncategorised"}
            dot={category?.color ?? null}
          />
        )}
        <Row
          k="Date"
          v={`${formatFullDate(txn.date)}, ${formatTime(txn.created_at)}`}
        />
        {txn.kind === "pl" ? (
          <div className="flex items-center justify-between px-4 py-3.5 border-t" style={{ borderColor: "var(--border)" }}>
            <span className="text-[13.5px] font-semibold t-secondary">Spent through</span>
            <span className="badge neutral">
              {txn.spent_through === "credit_card"
                ? "Credit Card"
                : txn.spent_through === "manual"
                  ? "Manual"
                  : "—"}
            </span>
          </div>
        ) : (
          <Row k="Type" v={TYPE_LABEL[txn.type] ?? txn.type} />
        )}
        {cardName && <Row k="Card" v={cardName} />}
        {loanName && (
          <Row
            k={txn.type === "transfer" ? "Loan (principal)" : "Loan"}
            v={loanName}
          />
        )}
        {isPairedTransfer && counterpartyName && (
          <Row
            k="Counterparty"
            v={counterpartyName}
            avatar={!isYou ? initialAvatar : null}
          />
        )}
        <Row k="Added by" v={isYou ? "You" : creatorName} avatar={!isYou ? initialAvatar : null} />
      </div>

      {isPairedTransfer && (
        <div className="card mx-5 mt-3 p-4">
          <div className="text-[12px] font-semibold t-secondary leading-relaxed">
            This transfer has a matching entry on {counterpartyName}&apos;s account. Editing or
            deleting this entry also updates the matching one.
          </div>
        </div>
      )}

      {txn.note && (
        <div className="card mx-5 mt-3.5 px-4 py-3.5">
          <div className="text-[12px] font-bold uppercase tracking-wide t-secondary mb-1.5">
            Note
          </div>
          <div className="text-[14px] font-medium leading-relaxed">{txn.note}</div>
        </div>
      )}

      {error && <p className="text-[12.5px] font-semibold t-red mx-5 mt-3">{error}</p>}

      <div className="flex gap-2.5 mx-5 mt-6">
        <button
          type="button"
          className="btn btn-danger flex-1"
          onClick={() => setConfirmDelete(true)}
          disabled={!cancellable}
        >
          <IconTrash size={16} /> Delete
        </button>
        {canEdit && (
          <button type="button" className="btn btn-primary flex-1" onClick={() => setEditing(true)}>
            <IconPencil size={16} /> Edit
          </button>
        )}
      </div>

      {txn.kind === "settlement" && !isAdmin && (
        <p className="text-center text-[11.5px] font-semibold t-tertiary mt-3">
          Settlement entries (card payments, loan repayments, transfers) are managed by the family
          admin.
        </p>
      )}

      {confirmDelete && (
        <div className="dialog-overlay">
          <div className="dialog">
            <div className="w-11 h-11 rounded-full bg-[rgba(176,86,47,0.12)] flex items-center justify-center mx-auto mb-3">
              <span className="text-[18px] t-red">!</span>
            </div>
            <h2 className="text-[16px] font-bold mb-1">Delete transaction?</h2>
            <p className="text-[12.5px] font-semibold t-secondary leading-relaxed mb-5">
              {isPairedTransfer
                ? "This removes the transfer and its matching entry from the family records. This can't be undone."
                : "This removes it from the family records. This can't be undone."}
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                className="btn btn-secondary flex-1"
                onClick={() => setConfirmDelete(false)}
              >
                Keep
              </button>
              <button type="button" className="btn btn-red flex-1" disabled={busy} onClick={onDelete}>
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  k,
  v,
  dot,
  avatar,
}: {
  k: string;
  v: string;
  dot?: string | null;
  avatar?: string | null;
}) {
  return (
    <div
      className="flex items-center justify-between px-4 py-3.5 border-t"
      style={{ borderColor: "var(--border)" }}
    >
      <span className="text-[13.5px] font-semibold t-secondary">{k}</span>
      <span className="flex items-center gap-2 text-[14px] font-semibold">
        {dot && <span className="dot" style={{ background: dot }} />}
        {avatar && (
          <span className="avatar" style={{ width: 22, height: 22, fontSize: 9 }}>
            {avatar}
          </span>
        )}
        {v}
      </span>
    </div>
  );
}