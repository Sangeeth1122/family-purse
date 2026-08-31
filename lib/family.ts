import type { Loan, Transaction } from "@/lib/types";
import { reportTransactions } from "@/lib/report";
import { round2 } from "@/lib/balances";

export function monthBounds(d = new Date()) {
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const to = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return {
    from,
    to,
    label: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
  };
}

export type FamilySpend = {
  personal: number;
  projects: number;
  loansPaid: number;
  total: number;
  txnCount: number;
};

/** Family-wide P&L spend for the family dashboard: personal + projects + loans paid. */
export function familySpend(all: Transaction[], from: string, to: string): FamilySpend {
  let personal = 0;
  let projects = 0;
  let txnCount = 0;

  for (const t of reportTransactions(all, from, to)) {
    if (t.type !== "expense" && t.type !== "interest_expense") continue;
    txnCount++;
    if (t.scope_type === "personal") personal += t.amount;
    else if (t.scope_type === "project") projects += t.amount;
  }

  let loansPaid = 0;
  for (const t of all) {
    if (
      t.kind === "settlement" &&
      t.type === "loan_repayment" &&
      t.date >= from &&
      t.date <= to
    ) {
      loansPaid += t.amount;
    }
  }

  personal = round2(personal);
  projects = round2(projects);
  loansPaid = round2(loansPaid);
  return {
    personal,
    projects,
    loansPaid,
    total: round2(personal + projects + loansPaid),
    txnCount,
  };
}

export type OpenBalance = {
  amount: number;
  count: number;
};

/**
 * Outstanding balances between this member and the family (family-member
 * loans only — transactions between the family and outsiders are external
 * counterparties, not family members). Drives the settle-first guard rail
 * before a member can be removed.
 */
export function memberOpenBalance(loans: Loan[], memberId: string): OpenBalance {
  let amount = 0;
  let count = 0;
  for (const l of loans) {
    if (l.counterparty_user_id !== memberId) continue;
    const outstanding = round2(l.principal_amount - l.repayment_total);
    if (outstanding > 0) {
      amount += outstanding;
      count++;
    }
  }
  return { amount: round2(amount), count };
}