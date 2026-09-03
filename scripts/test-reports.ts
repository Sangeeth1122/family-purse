/**
 * Phase 7 — Reports tests.
 *
 * Covers the accounting rules the three report screens share (Donut /
 * Heatmap / Waterfall — mockups 20/20b/20c) against the canonical frozen
 * seed (August 2026) plus synthetic edge cases:
 *
 *   C. Where Money Went category aggregation
 *   D. Donut total
 *   E. Category colour mapping
 *   F–I. Settlements (card payments / loan repayments / transfers) excluded
 *   J. Interest income/expense included in P&L
 *   K. Write-off treatment
 *   L–M. Heatmap daily aggregation + date boundaries
 *   N. Waterfall income/expense/net calculation
 *   O. Period filter changes actual data
 *   P. Empty-state behaviour
 *   Q. Family authorization/isolation (pure side: helpers only see what RLS
 *      returns; the RLS layer itself is verified in validate-migrations)
 *
 * Run with: npm run db:test-reports
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  reportMonthRange,
  reportTransactions,
  summarizeMonth,
  categoryMeta,
  dailySpend,
  waterfallSteps,
  waterfallLayout,
} from "../lib/report";
import { csvString } from "../lib/csv";
import type { Category, Transaction } from "../lib/types";

const APP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const CAT_FOOD = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const CAT_TRAVEL = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const CAT_SHOPPING = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
const CAT_GROCERY = "cccccccc-cccc-4ccc-8ccc-ccccccccccc4";
const CAT_UTILS = "cccccccc-cccc-4ccc-8ccc-ccccccccccc5";
const CAT_OTHER = "cccccccc-cccc-4ccc-8ccc-ccccccccccc6";
const CAT_INT_PAID = "cccccccc-cccc-4ccc-8ccc-ccccccccccc7";
const CAT_INT_RECV = "cccccccc-cccc-4ccc-8ccc-ccccccccccc8";
const CAT_WRITE_OFF = "cccccccc-cccc-4ccc-8ccc-ccccccccccc9";
const CARD_HDFC = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const CARD_AMEX = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";

const canonicalCategories: Category[] = [
  { id: CAT_FOOD, family_id: "11111111-1111-4111-8111-111111111111", name: "Food & Dining", color: "#B0562F", system: false, sort_order: 0, active: true },
  { id: CAT_TRAVEL, family_id: "11111111-1111-4111-8111-111111111111", name: "Travel", color: "#7A6FA8", system: false, sort_order: 1, active: true },
  { id: CAT_SHOPPING, family_id: "11111111-1111-4111-8111-111111111111", name: "Shopping", color: "#C79A3A", system: false, sort_order: 2, active: true },
  { id: CAT_GROCERY, family_id: "11111111-1111-4111-8111-111111111111", name: "Groceries", color: "#4A7A5E", system: false, sort_order: 3, active: true },
  { id: CAT_UTILS, family_id: "11111111-1111-4111-8111-111111111111", name: "Utilities", color: "#3E7CA6", system: false, sort_order: 4, active: true },
  { id: CAT_OTHER, family_id: "11111111-1111-4111-8111-111111111111", name: "Others", color: "#8A867C", system: false, sort_order: 5, active: true },
  { id: CAT_INT_PAID, family_id: "11111111-1111-4111-8111-111111111111", name: "Interest Paid", color: "#B0562F", system: true, sort_order: 6, active: true },
  { id: CAT_INT_RECV, family_id: "11111111-1111-4111-8111-111111111111", name: "Interest Received", color: "#4A7A5E", system: true, sort_order: 7, active: true },
  { id: CAT_WRITE_OFF, family_id: "11111111-1111-4111-8111-111111111111", name: "Balance Write-off", color: "#8A867C", system: true, sort_order: 8, active: true },
];

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
    scope_id: partial.scope_id ?? APP,
    amount: partial.amount,
    category_id: partial.category_id ?? null,
    spent_through: partial.spent_through ?? null,
    card_id: partial.card_id ?? null,
    date: partial.date ?? "2026-08-01",
    note: partial.note ?? null,
    created_by: partial.created_by ?? APP,
    counterparty_user_id: partial.counterparty_user_id ?? null,
    linked_loan_id: partial.linked_loan_id ?? null,
    transfer_group_id: partial.transfer_group_id ?? null,
    created_at: partial.created_at ?? "2026-08-01T00:00:00Z",
  };
}

// ---------------------------------------------------------------------------
// Canonical frozen August 2026 dataset — mirrors 0002_seed.sql exactly.
// P&L within August (card opening balances excluded):
//   expense  640+380 (Food) + 3200+7020 (Food incl. Goa) + 6000+2900 (Travel)
//          + 5340 (Shopping) + 6120 (Groceries) + 4500 (Utilities)
//          + 4500 (Others)                                             = ₹40,600
//   revenue 58000 (08-01) + interest_income 300 (08-15)                = ₹58,300
//   net                                                                   ₹17,700
// ---------------------------------------------------------------------------
const seed: Transaction[] = [
  txn({ id: "t201", type: "expense", amount: 640, category_id: CAT_FOOD, spent_through: "credit_card", card_id: CARD_HDFC, date: "2026-08-24", note: "Dinner" }),
  txn({ id: "t202", type: "expense", amount: 380, category_id: CAT_FOOD, spent_through: "credit_card", card_id: CARD_HDFC, date: "2026-08-23", note: "Lunch" }),
  txn({ id: "t203", type: "expense", amount: 3200, category_id: CAT_FOOD, scope_type: "project", scope_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1", date: "2026-08-20", note: "Goa meals" }),
  txn({ id: "t204", type: "expense", amount: 7020, category_id: CAT_FOOD, date: "2026-08-18", note: "Food & dining" }),
  txn({ id: "t205", type: "expense", amount: 6000, category_id: CAT_TRAVEL, scope_type: "project", scope_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1", date: "2026-08-20", note: "Goa travel" }),
  txn({ id: "t206", type: "expense", amount: 2900, category_id: CAT_TRAVEL, date: "2026-08-12", note: "Travel" }),
  txn({ id: "t207", type: "expense", amount: 5340, category_id: CAT_SHOPPING, scope_type: "project", scope_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2", date: "2026-08-10", note: "Shopping" }),
  txn({ id: "t208", type: "expense", amount: 6120, category_id: CAT_GROCERY, date: "2026-08-14", note: "Groceries" }),
  txn({ id: "t209", type: "expense", amount: 4500, category_id: CAT_UTILS, date: "2026-08-08", note: "Utilities" }),
  txn({ id: "t210", type: "expense", amount: 4500, category_id: CAT_OTHER, date: "2026-08-06", note: "Other household expense" }),
  txn({ id: "t211", type: "interest_income", amount: 300, category_id: CAT_INT_RECV, date: "2026-08-15", linked_loan_id: "ffffffff-ffff-4fff-8fff-fffffffffff1", note: "Interest received from Amit" }),
  txn({ id: "t212", type: "revenue", amount: 58000, date: "2026-08-01", note: "Monthly income" }),
  // Settlements — must never count toward P&L.
  txn({ id: "t213", kind: "settlement", type: "card_payment", amount: 38000, card_id: CARD_HDFC, date: "2026-08-25", note: "HDFC card payment" }),
  txn({ id: "t214", kind: "settlement", type: "loan_repayment", amount: 5000, date: "2026-08-20", linked_loan_id: "ffffffff-ffff-4fff-8fff-fffffffffff1", note: "Amit repayment" }),
  txn({ id: "t215", kind: "settlement", type: "loan_repayment", amount: 36000, date: "2026-08-25", linked_loan_id: "ffffffff-ffff-4fff-8fff-fffffffffff3", note: "HDFC loan repayment" }),
  txn({ id: "t216", kind: "settlement", type: "transfer", amount: 4000, date: "2026-08-10", counterparty_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", transfer_group_id: "12121212-1212-4121-8121-aaaaaaaac004", note: "Family transfer" }),
  txn({ id: "t217", kind: "settlement", type: "transfer", amount: 4000, date: "2026-08-10", counterparty_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", transfer_group_id: "12121212-1212-4121-8121-aaaaaaaac004", note: "Family transfer mirror" }),
  // Card opening balances — not household spend.
  txn({ id: "12121212-1212-4121-8121-121212121218", type: "expense", amount: 75460, category_id: CAT_OTHER, spent_through: "credit_card", card_id: CARD_HDFC, date: "2026-07-31", note: "Prior HDFC card spend" }),
  txn({ id: "12121212-1212-4121-8121-121212121219", type: "expense", amount: 3650, category_id: CAT_SHOPPING, spent_through: "credit_card", card_id: CARD_AMEX, date: "2026-08-22", note: "Amex spend" }),
];

const AUG = { from: "2026-08-01", to: "2026-08-31" };
const catName = categoryMeta(canonicalCategories);

// ---- C. Where Money Went category aggregation ---------------------------
console.log("\nC. Where Money Went category aggregation");
const aug = summarizeMonth(reportTransactions(seed, AUG.from, AUG.to), catName);
const agg = new Map(aug.byCategory.map((c) => [c.name, c.amount]));
assert(aug.expense === 40600, "expense total is ₹40,600", String(aug.expense));
assert(agg.get("Food & Dining") === 11240, "Food & Dining = ₹11,240", String(agg.get("Food & Dining")));
assert(agg.get("Travel") === 8900, "Travel = ₹8,900", String(agg.get("Travel")));
assert(agg.get("Shopping") === 5340, "Shopping = ₹5,340", String(agg.get("Shopping")));
assert(agg.get("Groceries") === 6120, "Groceries = ₹6,120", String(agg.get("Groceries")));
assert(agg.get("Utilities") === 4500, "Utilities = ₹4,500", String(agg.get("Utilities")));
assert(agg.get("Others") === 4500, "Others = ₹4,500", String(agg.get("Others")));
assert(aug.byCategory.length === 6, "six expense categories (no settlements/openings)");
assert(aug.byCategory[0].name === "Food & Dining", "categories sort by amount desc");

// ---- D. Donut total ------------------------------------------------------
console.log("\nD. Donut total");
const donutTotal = aug.byCategory.reduce((s, c) => s + c.amount, 0);
assert(donutTotal === aug.expense, "donut centre shows total spend (₹40,600)", `${donutTotal} vs ${aug.expense}`);

// ---- E. Category colour mapping -------------------------------------------
console.log("\nE. Category colour mapping");
const colorById = new Map(canonicalCategories.map((c) => [c.id, c.color]));
for (const c of aug.byCategory) {
  assert(c.color === colorById.get(c.categoryId!), `${c.name} uses its canonical colour (${c.color})`);
}

// ---- F–I. Settlements excluded -------------------------------------------
console.log("\nF–I. Settlements excluded from spending");
assert(reportTransactions(seed, AUG.from, AUG.to).every((t) => t.kind === "pl"), "reportTransactions keeps only P&L rows");
const settlementTotal = seed.filter((t) => t.kind === "settlement").reduce((s, t) => s + t.amount, 0);
assert(settlementTotal === 87000, "fixture really contains ₹87,000 of settlements (38k card + 41k loan + 8k transfers)", String(settlementTotal));
assert(aug.expense === 40600, "card payment, loan repayments and transfers do not add to spending (₹40,600)");
// Loan repayments must not even appear as a category.
assert(!aug.byCategory.some((c) => c.name.includes("Loan") || c.name.includes("Repay")), "no 'loan repayment' category appears");

// ---- J. Interest income/expense included ----------------------------------
console.log("\nJ. Interest income/expense included");
assert(aug.income === 58300, "income includes interest_income ₹300 (58,000 + 300)", String(aug.income));
const intExp = summarizeMonth(
  reportTransactions([...seed, txn({ id: "jx", type: "interest_expense", amount: 250, category_id: CAT_INT_PAID, date: "2026-08-09" })], AUG.from, AUG.to),
  catName,
);
assert(intExp.expense === 40850, "interest_expense ₹250 counts toward expense", String(intExp.expense));
assert(intExp.byCategory.some((c) => c.categoryId === CAT_INT_PAID && c.amount === 250), "Interest Paid appears as its own category");

// ---- K. Write-off treatment ----------------------------------------------
console.log("\nK. Write-off treatment");
assert(intExp.byCategory.find((c) => c.categoryId === CAT_INT_PAID)!.color === "#B0562F", "Interest Paid uses its canonical system colour");
const offExp = summarizeMonth(
  reportTransactions([...seed, txn({ id: "kx", type: "expense", amount: 5500, category_id: CAT_WRITE_OFF, date: "2026-08-29", note: "Forgiven by friend" })], AUG.from, AUG.to),
  catName,
);
assert(offExp.expense === 46100, "expense-side write-off is P&L expense (40,600 + 5,500)", String(offExp.expense));
const offRev = summarizeMonth(
  reportTransactions([...seed, txn({ id: "ky", type: "revenue", amount: 16000, category_id: CAT_WRITE_OFF, date: "2026-08-29", note: "Written off" })], AUG.from, AUG.to),
  catName,
);
assert(offRev.income === 74300, "revenue-side write-off is P&L income (58,300 + 16,000)", String(offRev.income));

// ---- L. Heatmap daily aggregation ----------------------------------------
console.log("\nL. Heatmap daily aggregation");
const days = dailySpend(seed, AUG.from, AUG.to, catName);
const dayMap = new Map(days.map((d) => [d.date, d]));
assert(days.reduce((s, d) => s + d.total, 0) === 40600, "sum of daily buckets equals ₹40,600", String(days.reduce((s, d) => s + d.total, 0)));
assert(dayMap.get("2026-08-20")?.total === 9200, "08-20 aggregates Goa meals + travel (6,000 + 3,200)", String(dayMap.get("2026-08-20")?.total));
assert(dayMap.get("2026-08-20")?.categories.length === 2, "08-20 keeps its per-category breakdown (Food + Travel)");
assert(!dayMap.has("2026-08-22"), "08-22 has no spend (Amex opening balance excluded)");
assert(dayMap.get("2026-08-24")?.total === 640, "credit-card dinner (₹640) still lands on its date");

// ---- M. Heatmap date boundaries ------------------------------------------
console.log("\nM. Heatmap date boundaries");
const early = summarizeMonth(reportTransactions(seed, AUG.from, "2026-08-14"), catName);
assert(early.expense === 23360, "8/1–8/14 slice = ₹23,360 (2.9k+5.34k+6.12k+4.5k+4.5k)", String(early.expense));
const earlyOpt = summarizeMonth(reportTransactions(seed, "2026-08-13", "2026-08-15"), catName);
assert(earlyOpt.expense === 6120, "8/13–8/15 inclusive = ₹6,120 (Groceries on 8/14)", String(earlyOpt.expense));
const oneDay = dailySpend(seed, "2026-08-24", "2026-08-24", catName);
assert(oneDay.length === 1 && oneDay[0].total === 640, "single-day boundary: exactly one bucket");
const jul = summarizeMonth(reportTransactions(seed, "2026-07-01", "2026-07-31"), catName);
assert(jul.expense === 0, "July = ₹0 (HDFC opening balance excluded)", String(jul.expense));

// ---- N. Waterfall income/expense/net -------------------------------------
console.log("\nN. Waterfall income/expense/net");
const steps = waterfallSteps(aug);
assert(steps.length === 8, "8 steps: Income + 6 categories + Net");
assert(steps[0].kind === "income" && steps[0].amount === 58300, "income bookend ₹58,300");
const netStep = steps[steps.length - 1];
assert(netStep.kind === "net" && netStep.amount === 17700, "net bookend ₹17,700 (58,300 − 40,600)", String(netStep.amount));
const mid = steps.filter((s) => s.kind === "expense");
assert(mid.reduce((s, c) => s + c.amount, 0) === 40600, "expense steps sum to ₹40,600");
const layout = waterfallLayout(steps);
assert(layout.bars.length === 8 && layout.connectors.length === 7, "layout draws 8 bars and 7 connectors");
assert(layout.bars[0].height > 0 && layout.bars[layout.bars.length - 1].height > 0, "income and net bars have positive heights");
const xs = layout.bars.map((b) => b.x);
assert(new Set(xs).size === xs.length, "bars are laid out at distinct x positions");
assert(layout.baselineY >= layout.bars[0].y, "income top sits above the zero baseline");
assert(layout.connectors.every((c) => c.y >= layout.bars[0].y && c.y <= layout.baselineY), "connectors ride the running level between income top and baseline");

// ---- O. Period filter changes actual data --------------------------------
console.log("\nO. Period filter changes actual data");
const lastMonth = reportMonthRange(-1, new Date(2026, 7, 15));
assert(lastMonth.from === "2026-07-01" && lastMonth.to === "2026-07-31", "last-month bounds computed");
const late = summarizeMonth(reportTransactions(seed, "2026-08-15", AUG.to), catName);
assert(late.expense === 17240, "second fortnight ₹17,240", String(late.expense));
assert(early.expense === aug.expense - late.expense, "first fortnight differs from whole month (23360 = 40600 − 17240)");
assert(early.expense + late.expense === 40600, "slices partition the month");
const dayO = dailySpend(seed, "2026-08-10", "2026-08-10", catName);
assert(dayO.length === 1 && dayO[0].total === 5340, "single-day filter returns just that day");

// ---- P. Empty-state behaviour --------------------------------------------
console.log("\nP. Empty-state behaviour");
const empty = summarizeMonth(reportTransactions(seed, "2026-09-01", "2026-09-30"), catName);
assert(empty.expense === 0 && empty.income === 0 && empty.byCategory.length === 0, "empty period → zero summary");
assert(dailySpend(seed, "2026-09-01", "2026-09-30", catName).length === 0, "empty period → no daily buckets");
const inverted = summarizeMonth(reportTransactions(seed, "2026-08-31", "2026-08-01"), catName);
assert(inverted.expense === 0, "inverted range → empty (invalid range guard)");

// ---- Q. Family authorization/isolation (pure side) -----------------------
console.log("\nQ. Family authorization/isolation");
const qBase = summarizeMonth(reportTransactions(seed, AUG.from, AUG.to), catName).expense;
const outsider = txn({ id: "qout", type: "expense", amount: 999999, date: "2026-08-15", scope_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4" });
const qWith = summarizeMonth(reportTransactions([...seed, outsider], AUG.from, AUG.to), catName).expense;
assert(qBase === 40600, "helpers report only the rows RLS hands to them");
assert(qWith !== qBase, "a foreign row (never handed over by RLS) would change output — RLS is the gatekeeper");
const detailPages = [
  "app/app/reports/where-money-went/page.tsx",
  "app/app/reports/budget-pace/page.tsx",
  "app/app/reports/vs-last-period/page.tsx",
  "app/app/reports/spend-calendar/page.tsx",
  "app/app/reports/income-vs-expense/page.tsx",
  "app/app/reports/savings-waterfall/page.tsx",
  "app/app/reports/who-contributes/page.tsx",
];
assert(
  detailPages.every((p) => readFileSync(join(__dirname, "..", p), "utf8").includes("createClient")),
  "report pages query through the RLS-scoped client (no service role)",
);

// ---- A/B. Reports home + navigation (structural) -------------------------
console.log("\nA/B. Reports home + navigation");
const home = readFileSync(join(__dirname, "..", "app/app/reports/page.tsx"), "utf8");
assert(home.includes("<ReportsHome"), "reports home page renders the home component");
const homeView = readFileSync(join(__dirname, "..", "components/reports/reports-home.tsx"), "utf8");
const hrefs = [...new Set((homeView.match(/\/app\/reports\/[a-z-]+/g) ?? []).filter((h) => h !== "/app/reports"))];
assert(hrefs.length === 7, "seven report cards navigate to seven detail routes");
let routesOk = true;
for (const h of hrefs) {
  try {
    readFileSync(join(__dirname, "..", "app", h, "page.tsx"), "utf8");
  } catch {
    routesOk = false;
  }
}
assert(routesOk, "all seven detail route files exist");

// ---- R. Export stays small (pure builder) --------------------------------
console.log("\nR. Export");
const csv = csvString(["Category", "Amount"], [["Food & Dining", 11240]]);
assert(csv.includes("Category,Amount") && csv.includes("Food & Dining,11240"), "CSV builds header + row");

if (failures > 0) {
  console.error(`\n${failures} report check(s) failed.`);
  process.exit(1);
}
console.log("\nAll report checks passed.");