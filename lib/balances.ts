import type { Card, Loan, Transaction } from "@/lib/types";

/**
 * Phase 2 — balance derivations. Every figure is computed from the frozen
 * transaction seed (Database transactions are the single source of truth).
 * No totals are hard-coded from mockups.
 */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * System category reserved for balance write-offs (pg 0004). A write-off is a
 * P&L row carrying this category; the balance formulas below treat EXACTLY
 * those rows as reductions. Normal manual spends never use it, so it is a
 * reliable discriminator against the engine's generic expense/revenue rows.
 */
export const WRITE_OFF_CATEGORY_ID = "cccccccc-cccc-4ccc-8ccc-ccccccccccc9";

/**
 * Definitive card balance formula (contract Issue 5):
 *   outstanding(card) = SUM(pl expenses on the card)
 *                     − SUM(settlement card_payments on the card)
 *                     − SUM(write-off P&L adjustments on the card)
 * Only kind = 'settlement' AND type = 'card_payment' rows subtract as
 * payments. A write-off (pg 0004) is a P&L expense in the Balance Write-off
 * category recorded on the card as spent_through = 'manual' with the exact
 * balance amount; the formula treats exactly those rows as reductions
 * (never a payment, never a normal card spend — normal card spending is
 * 'credit_card', and manual spends never pair card_id with that category).
 * A negative result is a credit balance (guard rail 6).
 */
export function cardOutstanding(
  cards: Pick<Card, "id">[],
  txns: Transaction[],
): Map<string, number> {
  const map = new Map<string, number>(cards.map((c) => [c.id, 0]));
  for (const t of txns) {
    if (t.card_id === null) continue;
    if (t.kind === "pl" && (t.type === "expense" || t.type === "interest_expense")) {
      if (
        t.type === "expense" &&
        t.spent_through === "manual" &&
        t.category_id === WRITE_OFF_CATEGORY_ID
      ) {
        map.set(t.card_id, (map.get(t.card_id) ?? 0) - t.amount);
      } else {
        map.set(t.card_id, (map.get(t.card_id) ?? 0) + t.amount);
      }
    } else if (t.kind === "settlement" && t.type === "card_payment") {
      map.set(t.card_id, (map.get(t.card_id) ?? 0) - t.amount);
    }
  }
  for (const [k, v] of map) map.set(k, round2(v));
  return map;
}

export type LoanBalance = { balance: number; repaid: number };

/**
 * Definitive loan balance formula (contract Issue 3 — single rule):
 *   loan_balance = principal_amount
 *                − SUM(principal loan repayments)
 *                − SUM(write-off P&L adjustments on the loan)
 * Only kind = 'settlement' AND type = 'loan_repayment' rows reduce the
 * balance as repayments. A write-off (pg 0004) is a P&L row on the loan in
 * the Balance Write-off category instead (expense for a 'given' loan — the
 * loss; revenue for a 'taken' loan — the forgiven debt); such rows reduce
 * the balance but are never repayments. The category discriminator is
 * required because a loan's own disbursement / generic loan expenses are
 * plain P&L rows on the same loan. interest_income / interest_expense are
 * P&L only and never touch principal. We read repayment_total from the
 * loans row (kept in sync by the engine trigger) but also recompute from
 * rows defensively.
 */
export function loanBalanceOf(
  loan: Pick<Loan, "id" | "principal_amount">,
  txns: Transaction[],
): LoanBalance {
  let repaid = 0;
  let writtenOff = 0;
  for (const t of txns) {
    if (t.linked_loan_id !== loan.id) continue;
    if (t.kind === "settlement" && t.type === "loan_repayment") {
      repaid += t.amount;
    } else if (
      t.kind === "pl" &&
      (t.type === "expense" || t.type === "revenue") &&
      t.category_id === WRITE_OFF_CATEGORY_ID
    ) {
      writtenOff += t.amount;
    }
  }
  repaid = round2(repaid);
  writtenOff = round2(writtenOff);
  return { repaid, balance: round2(loan.principal_amount - repaid - writtenOff) };
}

export function loanBalances(
  loans: Pick<Loan, "id" | "principal_amount">[],
  txns: Transaction[],
): Map<string, LoanBalance> {
  const map = new Map<string, LoanBalance>();
  for (const l of loans) map.set(l.id, loanBalanceOf(l, txns));
  return map;
}

/** Person display name for a loan (member name, external name, or fallback). */
export function loanPartyName(
  loan: Pick<Loan, "counterparty_user_id" | "counterparty_name">,
  memberName: (userId: string) => string | null,
): string {
  if (loan.counterparty_user_id) {
    return memberName(loan.counterparty_user_id) ?? "Family member";
  }
  return loan.counterparty_name?.trim() || "Unknown";
}

/**
 * Heuristic for drawing the "bank / institution" avatar (dashed + building
 * icon) instead of a person's initials — mirrors the loans mockups, where
 * people (Amit, Ravi) get initials and lenders like "HDFC Personal Loan"
 * get a building icon.
 */
export function isInstitutionName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return /\b(loan|bank|finance|credit|capital|lending|nbfc|hdfc|sbi|icici|axis|bob|kotak|hsbc)\b/.test(n);
}

/**
 * Settlements that are neutral to net worth (transfers between family
 * members, incl. the mirror side of a family transfer).
 */
export function netNeutralSettlementTxns(txns: Transaction[]): Transaction[] {
  return txns.filter(
    (t) =>
      t.kind === "settlement" &&
      t.type === "transfer" &&
      t.counterparty_user_id !== null,
  );
}

/** Money actually moving into/out of the family (card payments + loan repayments). */
export function settlementOutflows(txns: Transaction[]): Transaction[] {
  return txns.filter(
    (t) => t.kind === "settlement" && (t.type === "card_payment" || t.type === "loan_repayment"),
  );
}