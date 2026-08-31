/**
 * Phase 4 — Loans unit checks.
 *
 * These exercise the pure balance derivation (lib/balances.ts) that the loan
 * list and loan detail pages rely on, against the canonical frozen demo
 * dataset (pg 0002 seed) and against the definitive Issue-3 accounting rule:
 *   loan_balance = principal − SUM(loan_repayment) − SUM(Balance Write-offs)
 * interest_income / interest_expense are P&L only and never touch principal;
 * a loan's own principal settlement (family pair / external transfer) is a
 * ledger trace, never part of the balance math.
 *
 * Run with: npm run db:test-loans
 */
import {
  isInstitutionName,
  loanBalanceOf,
  loanBalances,
  loanPartyName,
  round2,
} from "../lib/balances";
import type { Transaction } from "../lib/types";

const LOAN_AMIT = "ffffffff-ffff-4fff-8fff-fffffffffff1";
const LOAN_RAVI = "ffffffff-ffff-4fff-8fff-fffffffffff2";
const LOAN_HDFC = "ffffffff-ffff-4fff-8fff-fffffffffff3";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

let failures = 0;

function assert(cond: boolean, name: string, detail?: string): void {
  if (cond) {
    console.log(`  ok — ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL — ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function txn(partial: Partial<Transaction> & Pick<Transaction, "id" | "amount" | "type">): Transaction {
  return {
    id: partial.id,
    kind: partial.kind ?? "pl",
    type: partial.type,
    scope_type: partial.scope_type ?? "personal",
    scope_id: partial.scope_id ?? USER_A,
    amount: partial.amount,
    category_id: partial.category_id ?? null,
    spent_through: partial.spent_through ?? null,
    card_id: partial.card_id ?? null,
    date: partial.date ?? "2026-08-01",
    note: partial.note ?? null,
    created_by: partial.created_by ?? USER_A,
    counterparty_user_id: partial.counterparty_user_id ?? null,
    linked_loan_id: partial.linked_loan_id ?? null,
    transfer_group_id: partial.transfer_group_id ?? null,
    created_at: partial.created_at ?? "2026-08-01T00:00:00Z",
  };
}

const WOF = "cccccccc-cccc-4ccc-8ccc-ccccccccccc9";

// ---------------------------------------------------------------------------
// Canonical frozen dataset (pg 0002 seed — loans + their transaction rows):
//   Amit  given 20,000  repaid 5,000  (+₹300 interest received, P&L only)
//   Ravi  given 17,500  repaid 0
//   HDFC  taken 50,000  repaid 36,000 (8% interest)
//   Net lending = (15,000 + 17,500) − 14,000 = +18,500
// ---------------------------------------------------------------------------
const seedTxns: Transaction[] = [
  // Loan-linked rows in the seed.
  txn({ id: "s01", kind: "pl", type: "interest_income", amount: 300, linked_loan_id: LOAN_AMIT, date: "2026-08-15" }),
  txn({ id: "s02", kind: "settlement", type: "loan_repayment", amount: 5000, linked_loan_id: LOAN_AMIT, date: "2026-08-20" }),
  txn({ id: "s03", kind: "settlement", type: "loan_repayment", amount: 36000, linked_loan_id: LOAN_HDFC, date: "2026-08-25" }),
  // Unrelated movements that must NOT touch loan balances.
  txn({ id: "s04", kind: "settlement", type: "card_payment", amount: 38000, date: "2026-08-25" }),
  txn({ id: "s05", kind: "settlement", type: "transfer", amount: 4000, date: "2026-08-10" }),
  txn({ id: "s06", type: "revenue", amount: 58000, date: "2026-08-01" }),
  txn({ id: "s07", type: "expense", amount: 640, date: "2026-08-24" }),
];

console.log("loanBalanceOf — canonical frozen dataset");
{
  const amit = loanBalanceOf({ id: LOAN_AMIT, principal_amount: 20000 }, seedTxns);
  assert(amit.balance === 15000, `Amit balance = ₹15,000 (got ${amit.balance})`);
  assert(amit.repaid === 5000, `Amit repaid = ₹5,000 (got ${amit.repaid})`);

  const ravi = loanBalanceOf({ id: LOAN_RAVI, principal_amount: 17500 }, seedTxns);
  assert(ravi.balance === 17500, `Ravi balance = ₹17,500 (got ${ravi.balance})`);

  const hdfc = loanBalanceOf({ id: LOAN_HDFC, principal_amount: 50000 }, seedTxns);
  assert(hdfc.balance === 14000, `HDFC balance = ₹14,000 (got ${hdfc.balance})`);
}

console.log("\nloanBalances — list rollup (net lending position)");
{
  const map = loanBalances(
    [
      { id: LOAN_AMIT, principal_amount: 20000 },
      { id: LOAN_RAVI, principal_amount: 17500 },
      { id: LOAN_HDFC, principal_amount: 50000 },
    ],
    seedTxns,
  );
  const givenTotal = round2(
    map.get(LOAN_AMIT)!.balance + map.get(LOAN_RAVI)!.balance,
  );
  const takenTotal = round2(map.get(LOAN_HDFC)!.balance);
  assert(givenTotal === 32500, `You're owed ₹32,500 (got ${givenTotal})`);
  assert(takenTotal === 14000, `You owe ₹14,000 (got ${takenTotal})`);
  assert(
    round2(givenTotal - takenTotal) === 18500,
    `Net lending position = +₹18,500 (got ${givenTotal - takenTotal})`,
  );
}

console.log("\nIssue 3 — interest is P&L only, never principal");
{
  const withExpense = [
    ...seedTxns,
    txn({ id: "s08", kind: "pl", type: "interest_expense", amount: 4800, linked_loan_id: LOAN_HDFC, date: "2026-08-31" }),
  ];
  const hdfc = loanBalanceOf({ id: LOAN_HDFC, principal_amount: 50000 }, withExpense);
  assert(
    hdfc.balance === 14000,
    `interest_expense doesn't reduce principal — HDFC stays ₹14,000 (got ${hdfc.balance})`,
  );

  const amit = loanBalanceOf({ id: LOAN_AMIT, principal_amount: 20000 }, withExpense);
  assert(
    amit.balance === 15000,
    `interest_income doesn't inflate the principal repayment (got ${amit.balance})`,
  );
}

console.log("\nRepayments — stack exactly once, overpayment becomes a credit");
{
  const twoRepayments = [
    ...seedTxns,
    txn({ id: "s09", kind: "settlement", type: "loan_repayment", amount: 2000, linked_loan_id: LOAN_AMIT, date: "2026-08-27" }),
    txn({ id: "s10", kind: "settlement", type: "loan_repayment", amount: 4000, linked_loan_id: LOAN_AMIT, date: "2026-08-28" }),
  ];
  const amit = loanBalanceOf({ id: LOAN_AMIT, principal_amount: 20000 }, twoRepayments);
  assert(
    amit.balance === 9000,
    `stacked repayments reduce once each: ₹20,000 − 11,000 = ₹9,000 (got ${amit.balance})`,
  );

  const overpaid = [
    ...seedTxns,
    txn({ id: "s11", kind: "settlement", type: "loan_repayment", amount: 16000, linked_loan_id: LOAN_AMIT, date: "2026-08-28" }),
  ];
  const credit = loanBalanceOf({ id: LOAN_AMIT, principal_amount: 20000 }, overpaid);
  assert(
    credit.balance === -1000,
    `overpayment carries a negative (credit) balance of −₹1,000 (got ${credit.balance})`,
  );
}

console.log("\nWrite-offs — pg 0004 semantics, cleared to ₹0, never a repayment");
{
  const amitBefore = loanBalanceOf({ id: LOAN_AMIT, principal_amount: 20000 }, seedTxns);
  const offAmit = [
    ...seedTxns,
    txn({ id: "s12", kind: "pl", type: "expense", amount: 15000, spent_through: "manual", linked_loan_id: LOAN_AMIT, category_id: WOF, date: "2026-08-29", note: "Friend won't pay it back" }),
  ];
  const amitAfter = loanBalanceOf({ id: LOAN_AMIT, principal_amount: 20000 }, offAmit);
  assert(amitAfter.balance === 0, `given loan write-off (expense) clears to ₹0 (got ${amitAfter.balance})`);
  assert(
    amitAfter.repaid === amitBefore.repaid,
    `a write-off is never counted as a repayment (${amitBefore.repaid} -> ${amitAfter.repaid})`,
  );

  const hdfcBefore = loanBalanceOf({ id: LOAN_HDFC, principal_amount: 50000 }, seedTxns);
  const offHdfc = [
    ...seedTxns,
    txn({ id: "s13", kind: "pl", type: "revenue", amount: 14000, linked_loan_id: LOAN_HDFC, category_id: WOF, date: "2026-08-29", note: "Lender forgave the debt" }),
  ];
  const hdfcAfter = loanBalanceOf({ id: LOAN_HDFC, principal_amount: 50000 }, offHdfc);
  assert(hdfcAfter.balance === 0, `taken loan write-off (revenue) clears to ₹0 (got ${hdfcAfter.balance})`);
  assert(
    hdfcAfter.repaid === hdfcBefore.repaid,
    `taken write-off never counts as a repayment (${hdfcBefore.repaid} -> ${hdfcAfter.repaid})`,
  );
}

console.log("\nPrincipal settlement rows are ledger traces, not balance math");
{
  // An external loan principal is a single settlement/transfer row linked to
  // the loan (0005 fp_create_loan writes it). It must NOT reduce the balance
  // the way a repayment does — the loan row itself is authoritative.
  const externalPrincipal = [
    ...seedTxns,
    txn({ id: "s14", kind: "settlement", type: "transfer", amount: 20000, linked_loan_id: LOAN_AMIT, date: "2026-08-01", note: "Loan to Amit" }),
  ];
  const amit = loanBalanceOf({ id: LOAN_AMIT, principal_amount: 20000 }, externalPrincipal);
  assert(
    amit.balance === 15000,
    `linked principal transfer doesn't change the balance (got ${amit.balance})`,
  );

  // Family loans pair an unlinked transfer — no effect either.
  const familyPrincipal = [
    ...seedTxns,
    txn({ id: "s15", kind: "settlement", type: "transfer", amount: 20000, date: "2026-08-01" }),
  ];
  const amit2 = loanBalanceOf({ id: LOAN_AMIT, principal_amount: 20000 }, familyPrincipal);
  assert(amit2.balance === 15000, `family transfer doesn't change the balance (got ${amit2.balance})`);
}

console.log("\nIsolation — unrelated movements never touch loan balances");
{
  const isolated = [
    ...seedTxns,
    txn({ id: "s16", kind: "settlement", type: "card_payment", amount: 9999, date: "2026-08-29" }),
    txn({ id: "s17", type: "expense", amount: 1234, date: "2026-08-29" }),
    txn({ id: "s18", type: "revenue", amount: 4321, date: "2026-08-29" }),
  ];
  const amit = loanBalanceOf({ id: LOAN_AMIT, principal_amount: 20000 }, isolated);
  const hdfc = loanBalanceOf({ id: LOAN_HDFC, principal_amount: 50000 }, isolated);
  assert(amit.balance === 15000, `Amit untouched by card/expense/revenue rows (got ${amit.balance})`);
  assert(hdfc.balance === 14000, `HDFC untouched by card/expense/revenue rows (got ${hdfc.balance})`);
}

console.log("\nParty naming & institution avatar heuristic");
{
  const member = { id: USER_A, name: "Aravind" };
  const memberName = (id: string) => (id === member.id ? member.name : null);
  assert(
    loanPartyName({ counterparty_user_id: USER_A, counterparty_name: null }, memberName) === "Aravind",
    "family-member loans resolve to the member name",
  );
  assert(
    loanPartyName({ counterparty_user_id: null, counterparty_name: "HDFC Personal Loan" }, memberName) === "HDFC Personal Loan",
    "external loans keep their store name (trimmed)",
  );
  assert(
    loanPartyName({ counterparty_user_id: "unknown", counterparty_name: null }, memberName) === "Family member",
    "unknown member resolves to 'Family member'",
  );
  assert(
    loanPartyName({ counterparty_user_id: null, counterparty_name: "  " }, memberName) === "Unknown",
    "blank external name falls back to 'Unknown'",
  );

  assert(isInstitutionName("HDFC Personal Loan"), "HDFC Personal Loan -> institution avatar");
  assert(isInstitutionName("ICICI Bank"), "ICICI Bank -> institution avatar");
  assert(isInstitutionName("SBI"), "SBI -> institution avatar");
  assert(!isInstitutionName("Amit"), "Amit -> person initials avatar");
  assert(!isInstitutionName("Ravi"), "Ravi -> person initials avatar");
  assert(!isInstitutionName(null), "null name -> person avatar");
  assert(!isInstitutionName("Amit Banker"), "person named 'Amit Banker' is treated as a person");
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll loan checks passed.");