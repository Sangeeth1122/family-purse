/**
 * Phase 3 — Credit Cards unit checks.
 *
 * These exercise the pure balance derivation (lib/balances.ts) that the UI
 * pages rely on, against the canonical frozen demo dataset and against the
 * Issue-4 settlement semantics (a card payment is a SINGLE settlement row and
 * must never register as a P&L expense).
 *
 * Run with: npm run db:test-cards
 */
import { cardOutstanding, loanBalanceOf, round2 } from "../lib/balances";
import type { Transaction } from "../lib/types";

const CARD_HDFC = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const CARD_AMEX = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
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

// ---------------------------------------------------------------------------
// Canonical frozen dataset (seeded values are the source of truth):
//   HDFC Millennia: 75,460 (prior) + 640 + 380 − 38,000 payment = ₹38,480
//   Amex Gold:       3,650                                                        = ₹3,650
//   Total:                                                                      ₹42,130
// ---------------------------------------------------------------------------
const seedTxns: Transaction[] = [
  txn({ id: "t01", type: "expense", amount: 75460, card_id: CARD_HDFC, date: "2026-07-31", spent_through: "credit_card" }),
  txn({ id: "t02", type: "expense", amount: 640, card_id: CARD_HDFC, date: "2026-08-24", spent_through: "credit_card" }),
  txn({ id: "t03", type: "expense", amount: 380, card_id: CARD_HDFC, date: "2026-08-23", spent_through: "credit_card" }),
  txn({ id: "t04", kind: "settlement", type: "card_payment", amount: 38000, card_id: CARD_HDFC, date: "2026-08-25" }),
  txn({ id: "t05", type: "expense", amount: 3650, card_id: CARD_AMEX, date: "2026-08-22", spent_through: "credit_card" }),
  // Unrelated movements that must NOT affect card balances.
  txn({ id: "t06", kind: "settlement", type: "loan_repayment", amount: 5000, date: "2026-08-20" }),
  txn({ id: "t07", kind: "settlement", type: "transfer", amount: 4000, date: "2026-08-10" }),
  txn({ id: "t08", type: "revenue", amount: 58000, date: "2026-08-01" }),
];

console.log("cardOutstanding — canonical frozen dataset");
{
  const map = cardOutstanding(
    [{ id: CARD_HDFC }, { id: CARD_AMEX }],
    seedTxns,
  );
  assert(map.get(CARD_HDFC) === 38480, `HDFC outstanding = ₹38,480 (got ${map.get(CARD_HDFC)})`);
  assert(map.get(CARD_AMEX) === 3650, `Amex outstanding = ₹3,650 (got ${map.get(CARD_AMEX)})`);
  const total = round2([...(map.values() as IterableIterator<number>)].reduce((s, v) => s + v, 0));
  assert(total === 42130, `Total outstanding = ₹42,130 (got ${total})`);
}

console.log("\nIssue 4 — a payment is exactly one settlement row, never a P&L expense");
{
  const plCount = (txns: Transaction[]) =>
    txns.filter((t) => t.kind === "pl").reduce((s) => s + 1, 0);
  const plSpend = (txns: Transaction[]) =>
    txns.filter((t) => t.kind === "pl" && (t.type === "expense" || t.type === "interest_expense"))
      .reduce((s, t) => s + t.amount, 0);

  const before = seedTxns;
  const beforeCount = plCount(before);
  const beforeSpend = plSpend(before);

  // A ₹12,000 settlement against HDFC.
  const after: Transaction[] = [
    ...before,
    txn({ id: "t09", kind: "settlement", type: "card_payment", amount: 12000, card_id: CARD_HDFC, date: "2026-08-28" }),
  ];

  assert(
    plCount(after) === beforeCount,
    "a card payment adds NO extra P&L row (records stay single) " +
      `(${beforeCount} -> ${plCount(after)})`,
  );
  const diff = plSpend(after) - beforeSpend;
  assert(diff === 0, `a card payment adds ₹0 to P&L spend (diff was ${diff})`);

  const map = cardOutstanding([{ id: CARD_HDFC }], after);
  assert(
    map.get(CARD_HDFC) === 26480,
    `payment reduces outstanding exactly once: ₹38,480 -> ₹26,480 (got ${map.get(CARD_HDFC)})`,
  );
}

console.log("\nPayment behaviour");
{
  const withPayment = [
    ...seedTxns,
    txn({ id: "t10", kind: "settlement", type: "card_payment", amount: 38000, card_id: CARD_HDFC, date: "2026-08-29" }),
  ];
  const map = cardOutstanding([{ id: CARD_HDFC }], withPayment);
  assert(
    map.get(CARD_HDFC) === 480,
    `payments stack: ₹38,480 - 38,000 = ₹480 (got ${map.get(CARD_HDFC)})`,
  );

  const overpaid = [
    ...withPayment,
    txn({ id: "t11", kind: "settlement", type: "card_payment", amount: 2000, card_id: CARD_HDFC, date: "2026-08-30" }),
  ];
  const credit = cardOutstanding([{ id: CARD_HDFC }], overpaid);
  assert(
    credit.get(CARD_HDFC) === -1520,
    `overpayment carries a negative (credit) balance of ₹1,520 (got ${credit.get(CARD_HDFC)})`,
  );
}

console.log("\nEdge semantics");
{
  // An expense with no card and a manual paid-via must not move any card.
  const manual = [...seedTxns, txn({ id: "t12", type: "expense", amount: 900, spent_through: "manual" })];
  const map = cardOutstanding([{ id: CARD_HDFC }, { id: CARD_AMEX }], manual);
  assert(map.get(CARD_HDFC) === 38480 && map.get(CARD_AMEX) === 3650,
    "manual spends don't touch card balances");

  // A settlement with card_id null never touches a card.
  const stray = [...seedTxns, txn({ id: "t13", kind: "settlement", type: "card_payment", amount: 999 })];
  const map2 = cardOutstanding([{ id: CARD_HDFC }], stray);
  assert(map2.get(CARD_HDFC) === 38480, "card payments without a card are ignored by balance math");
}

console.log("\nWrite-off — card (pg 0004 semantics)");
{
  // A write-off is ONE P&L expense row on the card, spent_through 'manual',
  // carrying the Balance Write-off category. It is never a settlement/payment.
  const weekOff: Transaction[] = [
    ...seedTxns,
    txn({
      id: "t14", kind: "pl", type: "expense", amount: 38480,
      card_id: CARD_HDFC, spent_through: "manual",
      category_id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc9",
      date: "2026-08-29", note: "Bank waived the balance",
    }),
  ];
  const map = cardOutstanding([{ id: CARD_HDFC }, { id: CARD_AMEX }], weekOff);
  assert(
    map.get(CARD_HDFC) === 0,
    `card write-off clears outstanding to ₹0 (got ${map.get(CARD_HDFC)})`,
  );
  assert(map.get(CARD_AMEX) === 3650, "write-off on one card never touches another card");

  const writeoffRows = weekOff.filter(
    (t) => t.id === "t14" && t.kind === "pl" && t.type === "expense",
  );
  assert(
    writeoffRows.length === 1 &&
      weekOff.filter((t) => t.kind === "settlement").length === seedTxns.filter((t) => t.kind === "settlement").length,
    "a write-off adds exactly one P&L row and NO settlement/payment",
  );

  // A manual P&L row without card_id must not reduce any card (overpay nudge
  // write-offs can't be confused with entity write-offs).
  const manualNoCard = [...weekOff, txn({ id: "t15", type: "expense", amount: 1500, spent_through: "manual" })];
  const map2 = cardOutstanding([{ id: CARD_HDFC }], manualNoCard);
  assert(map2.get(CARD_HDFC) === 0, "manual spends still don't touch card balances after a write-off");
}

console.log("\nWrite-off — loans (pg 0004 semantics)");
const LOAN_GIVEN = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const LOAN_TAKEN = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
{
  // Loan given ₹10,000, ₹4,500 repaid -> balance ₹5,500.
  const givenBase: Transaction[] = [
    txn({
      id: "g01", kind: "pl", type: "expense", amount: 10000,
      spent_through: "manual", linked_loan_id: LOAN_GIVEN, date: "2026-08-01",
      category_id: "11111111-1111-4111-8111-111111111111",
    }),
    txn({ id: "g02", kind: "settlement", type: "loan_repayment", amount: 4500, linked_loan_id: LOAN_GIVEN, date: "2026-08-20" }),
  ];
  // Loan taken ₹20,000, ₹4,000 repaid, ₹120 interest accrued -> balance ₹16,000.
  const takenBase: Transaction[] = [
    txn({ id: "k01", type: "revenue", amount: 20000, linked_loan_id: LOAN_TAKEN, date: "2026-08-02", spent_through: null }),
    txn({ id: "k02", kind: "settlement", type: "loan_repayment", amount: 4000, linked_loan_id: LOAN_TAKEN, date: "2026-08-21" }),
    txn({ id: "k03", kind: "pl", type: "interest_expense", amount: 120, linked_loan_id: LOAN_TAKEN, date: "2026-08-31" }),
  ];

  const bof = loanBalanceOf({ id: LOAN_GIVEN, principal_amount: 10000 }, givenBase);
  assert(bof.balance === 5500, `given loan balance ₹5,500 before write-off (got ${bof.balance})`);

  const bot = loanBalanceOf({ id: LOAN_TAKEN, principal_amount: 20000 }, takenBase);
  assert(
    bot.balance === 16000,
    `taken loan balance ₹16,000 (interest is P&L only: got ${bot.balance})`,
  );

  const offGiven = loanBalanceOf(
    { id: LOAN_GIVEN, principal_amount: 10000 },
    [...givenBase, txn({ id: "g03", kind: "pl", type: "expense", amount: 5500, spent_through: "manual", linked_loan_id: LOAN_GIVEN, category_id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc9", date: "2026-08-29", note: "Friend won't pay it back" })],
  );
  assert(offGiven.balance === 0, `given loan write-off (expense) clears to ₹0 (got ${offGiven.balance})`);

  const offTaken = loanBalanceOf(
    { id: LOAN_TAKEN, principal_amount: 20000 },
    [...takenBase, txn({ id: "k04", kind: "pl", type: "revenue", amount: 16000, linked_loan_id: LOAN_TAKEN, category_id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc9", date: "2026-08-29", note: "Lender forgave the debt" })],
  );
  assert(offTaken.balance === 0, `taken loan write-off (revenue) clears to ₹0 (got ${offTaken.balance})`);

  const repaid = loanBalanceOf({ id: LOAN_GIVEN, principal_amount: 10000 }, givenBase).repaid;
  const repaidAfterWriteOff = loanBalanceOf(
    { id: LOAN_GIVEN, principal_amount: 10000 },
    [...givenBase, txn({ id: "g03", kind: "pl", type: "expense", amount: 5500, spent_through: "manual", linked_loan_id: LOAN_GIVEN })],
  ).repaid;
  assert(
    repaidAfterWriteOff === repaid,
    `a write-off is never counted as a repayment (${repaid} -> ${repaidAfterWriteOff})`,
  );
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll card checks passed.");