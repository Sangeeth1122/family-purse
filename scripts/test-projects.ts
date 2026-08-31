/**
 * Phase 5 — Projects unit checks.
 *
 * Exercises the pure project derivations in lib/projects.ts (the list card
 * uses projectProgress, the detail page build on top of projectTransactions
 * + projectSpend/projectRevenue) against the canonical frozen demo dataset
 * (pg 0002 seed — projects + their scoped P&L rows):
 *   Goa Trip       budget 30,000  spent = 3,200 (meals) + 6,000 (travel) = 9,200
 *   Diwali Shopping budget 20,000  spent = 5,340 (shopping)
 * Spend = P&L expense-like rows scoped to the project only; revenue and
 * interest rows are excluded from spend; personal rows never leak in.
 *
 * Run with: npm run db:test-projects
 */
import {
  memberRoleMap,
  projectProgress,
  projectRevenue,
  projectSpend,
  projectTransactions,
} from "../lib/projects";
import type { ProjectMember, Transaction } from "../lib/types";

const GOA = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const DIWALI = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const FOOD = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const TRAVEL = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const SHOPPING = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";

let failures = 0;

function assert(cond: boolean, name: string, detail?: string): void {
  if (cond) {
    console.log(`  ok — ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL — ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function txn(
  partial: Partial<Transaction> & Pick<Transaction, "id" | "amount" | "type">,
): Transaction {
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

// Canonical frozen project rows + decoy rows that must never be counted.
const txns: Transaction[] = [
  txn({ id: "t01", type: "expense", scope_type: "project", scope_id: GOA, amount: 3200, category_id: FOOD, date: "2026-08-20" }),
  txn({ id: "t02", type: "expense", scope_type: "project", scope_id: GOA, amount: 6000, category_id: TRAVEL, date: "2026-08-20" }),
  txn({ id: "t03", type: "expense", scope_type: "project", scope_id: DIWALI, amount: 5340, category_id: SHOPPING, date: "2026-08-10" }),
  // Decoys — same categories, personal scope: must not leak into projects.
  txn({ id: "t04", type: "expense", scope_type: "personal", amount: 9999, category_id: FOOD }),
  txn({ id: "t05", type: "revenue", scope_type: "project", scope_id: GOA, amount: 1500, category_id: FOOD, date: "2026-08-21" }),
  txn({ id: "t06", type: "interest_expense", scope_type: "project", scope_id: GOA, amount: 100, category_id: FOOD, date: "2026-08-22" }),
];

console.log("projectTransactions — scope filtering");
{
  const goa = projectTransactions(txns, GOA);
  assert(goa.length === 4, "Goa scoped rows = 4 (excludes personal decoy)", String(goa.length));
  assert(goa.every((t) => t.scope_id === GOA), "all returned rows belong to Goa");
  const diwali = projectTransactions(txns, DIWALI);
  assert(diwali.length === 1, "Diwali scoped rows = 1");
}

console.log("projectSpend / projectRevenue — expense-like P&L only");
{
  const spend = projectSpend(txns, GOA);
  assert(spend === 9300, "Goa spend = ₹9,300 (3,200 + 6,000 + 100 interest)", String(spend));
  const revenue = projectRevenue(txns, GOA);
  assert(revenue === 1500, "Goa revenue = ₹1,500 (interest + revenue never in spend)", String(revenue));
}

console.log("projectProgress — budget usage");
{
  const goa = projectProgress(txns, GOA, 30000);
  assert(goa.spent === 9300, "Goa spent tracked", String(goa.spent));
  assert(goa.net === 7800, "Goa net = spend − revenue", String(goa.net));
  assert(goa.pctUsed === 31, "Goa budget used = 31% (9300/30000)", String(goa.pctUsed));
  assert(goa.over === false, "Goa not over budget");

  const diwali = projectProgress(txns, DIWALI, 20000);
  assert(diwali.pctUsed === 27, "Diwali budget used = 27% (5340/20000)", String(diwali.pctUsed));
  assert(diwali.over === false, "Diwali not over budget");

  const noBudget = projectProgress(txns, DIWALI, null);
  assert(noBudget.pctUsed === null, "No budget → no percentage", String(noBudget.pctUsed));
  assert(noBudget.over === false, "No budget → never 'over'");

  const over = projectProgress(txns, GOA, 5000);
  assert(over.over === true, "Spend > budget is flagged over", String(over.spent));
  assert(over.pctUsed === 186, "Over-budget percentage reported (9300/5000)", String(over.pctUsed));

  const empty = projectProgress(txns, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9", 10000);
  assert(empty.spent === 0 && empty.pctUsed === 0, "Unknown/empty project → ₹0 spent, 0% used");
}

console.log("memberRoleMap — role lookup");
{
  const members: ProjectMember[] = [
    { project_id: GOA, user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", role: "owner" },
    { project_id: GOA, user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", role: "contributor" },
    { project_id: GOA, user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", role: "contributor" },
  ];
  const map = memberRoleMap(members);
  assert(map.get("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1") === "owner", "creator is owner");
  assert(map.get("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2") === "contributor", "second member is contributor");
  assert(map.size === 3, "all three members mapped");
  assert(map.get("nope") === undefined, "unknown member → undefined");
}

console.log(`\n${failures === 0 ? "All project checks passed" : `${failures} FAILURES`}`);
process.exit(failures === 0 ? 0 : 1);