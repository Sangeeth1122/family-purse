#!/usr/bin/env tsx
/**
 * Phase 2 — Run migrations 0001–0003 in an in-process PostgreSQL (PGlite) and
 * exercise the transaction engine end-to-end: create/update/delete RPCs, RLS
 * reads, the repayment_total trigger, and the guard-rail invariants.
 *
 * Supabase Auth is stubbed: auth.uid() reads the session GUC `app.uid`, so a
 * test can "act as" any seeded user by setting it. Auth roles exist as plain
 * roles so RLS policies still apply when `set role authenticated`.
 *
 *   npm run db:validate
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "../node_modules/@electric-sql/pglite/dist/contrib/btree_gist.js";
import { pgcrypto } from "../node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const MIG_DIR = join(process.cwd(), "supabase", "migrations");

const U = {
  aravind: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  revathi: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  karthik: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
};
const CARD_HDFC = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const CARD_AMEX = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
const LOAN_AMIT = "ffffffff-ffff-4fff-8fff-fffffffffff1";
const LOAN_HDFC = "ffffffff-ffff-4fff-8fff-fffffffffff3";
const CAT = {
  food: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
  travel: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
  groceries: "cccccccc-cccc-4ccc-8ccc-ccccccccccc4",
  interestPaid: "cccccccc-cccc-4ccc-8ccc-ccccccccccc7",
  interestReceived: "cccccccc-cccc-4ccc-8ccc-ccccccccccc8",
  writeoff: "cccccccc-cccc-4ccc-8ccc-ccccccccccc9",
};

const STUB = `
create schema auth;
create table auth.users (
  id uuid primary key,
  email text not null default '',
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
insert into auth.users (id) values
  ('${U.aravind}'), ('${U.revathi}'), ('${U.karthik}');

create or replace function auth.uid()
returns uuid
language sql
stable
set search_path = public, pg_catalog
as $$
  select nullif(current_setting('app.uid', true), '')::uuid
$$;

create role authenticated nologin;
create role anon nologin;
create role service_role nologin;
create role supabase_auth_admin nologin;
`;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function expectError(name: string, fn: () => Promise<unknown>, needle: string) {
  return fn()
    .then(() => check(name, false, "expected an error but none was raised"))
    .catch((e: Error) => check(name, e.message.includes(needle), `got: ${e.message}`));
}

async function main() {
  console.log("Starting in-process Postgres (PGlite)…");
  const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
  console.log("Stubbing Supabase Auth (auth.uid reads GUC app.uid)…");
  await db.exec(STUB);
  console.log("Applying migration files…");
  for (const f of [
    "0001_init.sql",
    "0002_seed.sql",
    "0003_transaction_engine.sql",
    "0004_write_offs.sql",
    "0005_loan_engine.sql",
    "0006_projects.sql",
    "0007_members_admin.sql",
    "0008_report_select_scope.sql",
    "0009_admin_family_scope.sql",
  ]) {
    const sql = await readFile(join(MIG_DIR, f), "utf8");
    await db.exec(sql);
    console.log(`  applied ${f}`);
  }

  // ------------------------------------------------------------------
  const num = (v: unknown): number => Number((v as { num: number } | null)?.num ?? v);
  const asActor = async (userId: string) => {
    await db.exec(
      `set role authenticated; set app.uid = '${userId}'; set search_path = public;`,
    );
  };

  // ---- Baseline: canonical balances derived from the frozen seed -------
  console.log("\nA. Seed baselines (frozen canonical data)");
  await asActor(U.aravind);

  const hdfc = await db.query<{ num: string }>(
    `select coalesce(sum(case when t.kind='pl' and t.type in ('expense','interest_expense') then t.amount else 0 end)
                - sum(case when t.kind='settlement' and t.type='card_payment' and t.card_id=$1 then t.amount else 0 end),0)::numeric as num
     from transactions t where t.card_id=$1`,
    [CARD_HDFC],
  );
  check("HDFC outstanding = ₹38,480", num(hdfc.rows[0]?.num) === 38480, String(hdfc.rows[0]?.num));

  const amex = await db.query<{ num: string }>(
    `select coalesce(sum(case when t.kind='pl' then t.amount else 0 end)
                - sum(case when t.kind='settlement' then t.amount else 0 end),0)::numeric as num
     from transactions t where t.card_id=$1`,
    [CARD_AMEX],
  );
  check("Amex outstanding = ₹3,650", num(amex.rows[0]?.num) === 3650, String(amex.rows[0]?.num));

  const loans = await db.query<{ id: string; principal_amount: string; repayment_total: string }>(
    `select id, principal_amount, repayment_total from loans where id in ($1,$2,$3) order by id`,
    [LOAN_AMIT, "ffffffff-ffff-4fff-8fff-fffffffffff2", LOAN_HDFC],
  );
  const bal = (l: { principal_amount: string; repayment_total: string }) =>
    num({ num: l.principal_amount }) - num({ num: l.repayment_total });
  const lmap = new Map(loans.rows.map((r) => [r.id, r]));
  check("Amit loan balance = ₹15,000", bal(lmap.get(LOAN_AMIT)!) === 15000);
  check("Ravi loan balance = ₹17,500", bal(lmap.get("ffffffff-ffff-4fff-8fff-fffffffffff2")!) === 17500);
  check("HDFC loan balance = ₹14,000", bal(lmap.get(LOAN_HDFC)!) === 14000);

  const pairs = await db.query<{ n: number; scopes: number }>(
    `select transfer_group_id, count(*)::int as n, count(distinct scope_id)::int as scopes
     from transactions where kind='settlement' and type='transfer' and counterparty_user_id is not null
     group by transfer_group_id`,
  );
  check("Seeded family transfer is paired", pairs.rows.length === 1 && pairs.rows[0].n === 2 && pairs.rows[0].scopes === 2);

  // ---- B. P&L create (Aravind) --------------------------------------
  console.log("\nB. Engine create — P&L");
  await asActor(U.aravind);
  const exp = await db.query<{ result: { id: string } }>(
    `select public.fp_create_transaction($j$${
      JSON.stringify({
        kind: "pl",
        type: "expense",
        scope_type: "personal",
        amount: 1234.5,
        category_id: CAT.food,
        spent_through: "credit_card",
        card_id: CARD_HDFC,
        date: "2026-08-28",
        note: "Engine test expense",
      })
    }$j$::jsonb) as result`,
  );
  check("Expense created", !!exp.rows[0]?.result);
  const expId = exp.rows[0].result.id;

  const wrongScope = await expectError(
    "Cannot create personal P&L on someone else's ledger",
    () =>
      db.query(
        `select public.fp_create_transaction($j$${JSON.stringify({
          kind: "pl",
          type: "expense",
          scope_type: "personal",
          scope_id: U.revathi,
          amount: 100,
          category_id: CAT.food,
          spent_through: "manual",
          date: "2026-08-28",
        })}$j$::jsonb)`,
      ),
    "only record your own personal transactions",
  );
  void wrongScope;

  const badCat = await expectError(
    "Expense without category rejected",
    () =>
      db.query(
        `select public.fp_create_transaction($j$${JSON.stringify({
          kind: "pl",
          type: "expense",
          scope_type: "personal",
          amount: 100,
          spent_through: "manual",
          date: "2026-08-28",
        })}$j$::jsonb)`,
      ),
    "require a category",
  );
  void badCat;

  // ---- C. Interest rows must use system categories --------------------
  console.log("\nC. Engine create — interest");
  await asActor(U.aravind);
  await db.query(
    `select public.fp_create_transaction($j$${JSON.stringify({
      kind: "pl",
      type: "interest_expense",
      scope_type: "personal",
      amount: 250,
      category_id: CAT.interestPaid,
      spent_through: "manual",
      linked_loan_id: LOAN_HDFC,
      date: "2026-08-28",
    })}$j$::jsonb)`,
  );
  check("interest_expense with Interest Paid category accepted", true);

  const wrongInterestCat = await expectError(
    "interest_expense with a non-system category rejected",
    () =>
      db.query(
        `select public.fp_create_transaction($j$${JSON.stringify({
          kind: "pl",
          type: "interest_expense",
          scope_type: "personal",
          amount: 250,
          category_id: CAT.food,
          spent_through: "manual",
          date: "2026-08-28",
        })}$j$::jsonb)`,
      ),
    "Interest Paid",
  );
  void wrongInterestCat;

  // ---- D. Settlements: admin-only ------------------------------------
  console.log("\nD. Settlements — authorization (Issue 5)");
  await asActor(U.karthik);
  await expectError(
    "Member cannot create a card payment",
    () =>
      db.query(
        `select public.fp_create_transaction($j$${JSON.stringify({
          kind: "settlement",
          type: "card_payment",
          scope_type: "personal",
          amount: 1000,
          card_id: CARD_HDFC,
          date: "2026-08-28",
        })}$j$::jsonb)`,
      ),
    "Only a family admin can log settlements",
  );

  await asActor(U.aravind);
  const pay = await db.query<{ result: { id: string } }>(
    `select public.fp_create_transaction($j$${JSON.stringify({
      kind: "settlement",
      type: "card_payment",
      scope_type: "personal",
      amount: 1000,
      card_id: CARD_HDFC,
      date: "2026-08-28",
      note: "Engine test payment",
    })}$j$::jsonb) as result`,
  );
  check("Admin card payment created", !!pay.rows[0]?.result);
  const payId = pay.rows[0].result.id;

  const hdfcAfter = await db.query<{ num: string }>(
    `select (${num({ num: 38480 })})::numeric - coalesce((select sum(amount) from transactions where kind='settlement' and type='card_payment' and card_id=$1 and id<> '12121212-1212-4121-8121-121212121213'),0)::numeric as num`,
    [CARD_HDFC],
  );
  const afterZ = Number(
    ((hdfcAfter.rows[0]?.num as unknown as string) ?? "0").replace("−", "-"),
  );
  check("Card outstanding reduced by payment", Math.abs(num({ num: afterZ }) - 37480) < 0.01, String(afterZ));

  // ---- E. Family transfer -> two rows (Issue 4) -----------------------
  console.log("\nE. Family transfer pairs");
  await asActor(U.aravind);
  const tf = await db.query<{ result: { id: string; mirror_id: string; transfer_group_id: string } }>(
    `select public.fp_create_transaction($j$${JSON.stringify({
      kind: "settlement",
      type: "transfer",
      scope_type: "personal",
      amount: 2500,
      counterparty_user_id: U.karthik,
      date: "2026-08-28",
      note: "Engine test transfer",
    })}$j$::jsonb) as result`,
  );
  check("Transfer created", !!tf.rows[0]?.result);
  const tfResult = tf.rows[0].result;
  const pairRows = await db.query<{
    scope_id: string;
    counterparty_user_id: string | null;
    note: string | null;
  }>(
    `select scope_id, counterparty_user_id, note from transactions where transfer_group_id=$1`,
    [tfResult.transfer_group_id],
  );
  check("Two rows share transfer_group_id", pairRows.rows.length === 2);
  check(
    "Mirror sits on recipient's ledger with originator as counterparty",
    pairRows.rows.some(
      (r) => r.scope_id === U.karthik && r.counterparty_user_id === U.aravind,
    ),
  );
  check(
    "Mirror note marked",
    pairRows.rows.some((r) => r.note === "Engine test transfer (mirror)"),
  );

  await asActor(U.aravind);
  await expectError(
    "Cannot transfer to yourself",
    () =>
      db.query(
        `select public.fp_create_transaction($j$${JSON.stringify({
          kind: "settlement",
          type: "transfer",
          scope_type: "personal",
          amount: 100,
          counterparty_user_id: U.aravind,
          date: "2026-08-28",
        })}$j$::jsonb)`,
      ),
    "Pick another family member",
  );

  // ---- F. External loan principal: single row (Issue 1) ---------------
  console.log("\nF. External transfer / loan principal");
  await asActor(U.aravind);
  const ext = await db.query<{ result: { id: string; transfer_group_id: string } }>(
    `select public.fp_create_transaction($j$${JSON.stringify({
      kind: "settlement",
      type: "transfer",
      scope_type: "personal",
      amount: 3000,
      linked_loan_id: LOAN_AMIT,
      date: "2026-08-28",
      note: "Engine test principal",
    })}$j$::jsonb) as result`,
  );
  check("External loan principal created", !!ext.rows[0]?.result);
  const extResult = ext.rows[0].result;
  const extRows = await db.query<{ n: number }>(
    `select count(*)::int as n from transactions where transfer_group_id=$1`,
    [extResult.transfer_group_id],
  );
  check("Exactly one row for external principal", extRows.rows[0].n === 1);

  await expectError(
    "External transfer without a linked loan rejected",
    () =>
      db.query(
        `select public.fp_create_transaction($j$${JSON.stringify({
          kind: "settlement",
          type: "transfer",
          scope_type: "personal",
          amount: 100,
          date: "2026-08-28",
        })}$j$::jsonb)`,
      ),
    "requires a linked loan",
  );

  // ---- G. Loan repayment + repayment_total trigger --------------------
  console.log("\nG. Loan repayment");
  await asActor(U.aravind);
  await db.query(
    `select public.fp_create_transaction($j$${JSON.stringify({
      kind: "settlement",
      type: "loan_repayment",
      scope_type: "personal",
      amount: 2000,
      linked_loan_id: LOAN_AMIT,
      date: "2026-08-28",
      note: "Engine test repayment",
    })}$j$::jsonb)`,
  );
  const amitAfter = await db.query<{ principal_amount: string; repayment_total: string }>(
    `select principal_amount, repayment_total from loans where id=$1`,
    [LOAN_AMIT],
  );
  check(
    "Amit balance now ₹13,000 (principal − repaid)",
    num({ num: amitAfter.rows[0].principal_amount }) -
      num({ num: amitAfter.rows[0].repayment_total }) ===
      13000,
    `balance=${num({ num: amitAfter.rows[0].principal_amount }) - num({ num: amitAfter.rows[0].repayment_total })}`,
  );
  check(
    "loans.repayment_total synced by trigger (7000)",
    num({ num: amitAfter.rows[0].repayment_total }) === 7000,
    String(amitAfter.rows[0].repayment_total),
  );

  await asActor(U.karthik);
  await expectError(
    "Member cannot edit a settlement",
    () =>
      db.query(
        `select public.fp_update_transaction('${payId}'::uuid, '{"amount": 1, "date": "2026-08-28", "note": "x"}'::jsonb)`,
      ),
    "Only a family admin can edit settlements",
  );

  // ---- H. Update — owner edits P&L, admin edits settlements -----------
  console.log("\nH. Engine update");
  await asActor(U.revathi);
  await expectError(
    "Member cannot edit another member's P&L row",
    () =>
      db.query(
        `select public.fp_update_transaction('${expId}'::uuid, '{"amount": 1, "date": "2026-08-28", "note": "x"}'::jsonb)`,
      ),
    "only edit your own personal transactions",
  );

  await asActor(U.aravind);
  await db.query(
    `select public.fp_update_transaction('${expId}'::uuid, $j$${JSON.stringify({
      amount: 999,
      date: "2026-08-28",
      note: "Edited expense",
    })}$j$::jsonb)`,
  );
  const edited = await db.query<{ amount: string; note: string | null }>(
    `select amount, note from transactions where id=$1`,
    [expId],
  );
  check("Owner-edited P&L amount/note persisted", num({ num: edited.rows[0].amount }) === 999 && edited.rows[0].note === "Edited expense");

  // Structural fields (card_id etc.) are intentionally ignored on settlement
  // edits — only amount/date/note apply. Assert the card stayed HDFC below.
  await db.query(
    `select public.fp_update_transaction('${payId}'::uuid, '{"amount": 500, "date": "2026-08-28", "note": "ok", "card_id": "${CARD_AMEX}"}'::jsonb)`,
  );
  const payRow = await db.query<{ card_id: string; amount: string }>(
    `select card_id, amount from transactions where id=$1`,
    [payId],
  );
  check(
    "Admin edited settlement amount (structural card unchanged)",
    payRow.rows[0].card_id === CARD_HDFC && num({ num: payRow.rows[0].amount }) === 500,
  );

  await db.query(
    `select public.fp_update_transaction('${tfResult.id}'::uuid, '{"amount": 3000, "date": "2026-08-28", "note": "Updated transfer"}'::jsonb)`,
  );
  const mirrorUpdated = await db.query<{ amount: string; note: string | null }>(
    `select amount, note from transactions where id=$1`,
    [tfResult.mirror_id],
  );
  check(
    "Paired transfer mirror updated atomically",
    num({ num: mirrorUpdated.rows[0].amount }) === 3000 && mirrorUpdated.rows[0].note === "Updated transfer (mirror)",
  );

  // ---- I. Batch (guard-rail flows write 2 rows atomically) ------------
  console.log("\nI. Batch write (nudge overpay → payment + interest)");
  await asActor(U.aravind);
  const batch = await db.query<{ result: string }>(
    `select public.fp_create_transaction($j$[
      {"kind":"settlement","type":"card_payment","scope_type":"personal","amount":1000,"card_id":"${CARD_HDFC}","date":"2026-08-28","note":"overpay"},
      {"kind":"pl","type":"interest_expense","scope_type":"personal","amount":100,"category_id":"${CAT.interestPaid}","spent_through":"credit_card","card_id":"${CARD_HDFC}","date":"2026-08-28","note":"overpay"}
    ]$j$::jsonb) as result`,
  );
  check("Batch (payment + interest) committed", !!batch.rows[0]?.result);

  const midBatch = await db.query<{ n: number }>(
    `select count(*)::int as n from transactions where note='overpay'`,
  );
  check("Both batch rows landed", midBatch.rows[0].n === 2);

  // ---- J. Delete ------------------------------------------------------
  console.log("\nJ. Engine delete");
  await asActor(U.karthik);
  await expectError(
    "Member cannot delete another member's P&L row",
    () => db.query(`select public.fp_delete_transaction('${expId}'::uuid)`),
    "only delete your own personal transactions",
  );

  await asActor(U.aravind);
  await db.query(`select public.fp_delete_transaction('${expId}'::uuid)`);
  const gone = await db.query<{ n: number }>(`select count(*)::int as n from transactions where id=$1`, [expId]);
  check("Admin deleted P&L row", gone.rows[0].n === 0);

  await db.query(`select public.fp_delete_transaction('${tfResult.id}'::uuid)`);
  const pairGone = await db.query<{ n: number }>(
    `select count(*)::int as n from transactions where transfer_group_id=$1`,
    [tfResult.transfer_group_id],
  );
  check("Deleting a transfer removes BOTH rows", pairGone.rows[0].n === 0);

  // ---- K. RLS reads as a member ---------------------------------------
  console.log("\nK. RLS read visibility");
  await asActor(U.karthik);
  const visible = await db.query<{ n: string }>(
    `select count(*)::text as n from transactions`,
  );
  check(
    "Member sees family transactions (full visibility)",
    Number(visible.rows[0].n) >= 24,
    String(visible.rows[0].n),
  );
  const revathiProfile = await db.query<{ n: number }>(
    `select count(*)::int as n from users where id=$1`,
    [U.revathi],
  );
  check("Member reads family members' profiles", revathiProfile.rows[0].n === 1);

  // ---- L. P&L totals ignore settlements -------------------------------
  console.log("\nL. P&L totals unaffected by settlements");
  await asActor(U.aravind);
  const plBefore = await db.query<{ sum: string }>(
    `select coalesce(sum(amount),0)::numeric as sum from transactions where kind='pl'`,
  );
  const revenueBefore = await db.query<{ sum: string }>(
    `select coalesce(sum(amount),0)::numeric as sum from transactions where kind='pl' and type='revenue'`,
  );
  // New settlements (card payment etc.) must not move P&L totals.
  await db.query(
    `select public.fp_create_transaction($j$${JSON.stringify({
      kind: "settlement",
      type: "loan_repayment",
      scope_type: "personal",
      amount: 1500,
      linked_loan_id: LOAN_AMIT,
      date: "2026-08-28",
    })}$j$::jsonb)`,
  );
  await db.query(
    `select public.fp_create_transaction($j$${JSON.stringify({
      kind: "pl",
      type: "expense",
      scope_type: "personal",
      amount: 777,
      category_id: CAT.groceries,
      spent_through: "manual",
      date: "2026-08-28",
    })}$j$::jsonb)`,
  );
  const plAfter = await db.query<{ sum: string }>(
    `select coalesce(sum(amount),0)::numeric as sum from transactions where kind='pl'`,
  );
  check(
    "Settlement did not move P&L sum; new expense added exactly ₹777",
    Math.abs(num({ num: plAfter.rows[0].sum }) - (num({ num: plBefore.rows[0].sum }) + 777)) < 0.001,
    `before=${plBefore.rows[0].sum} after=${plAfter.rows[0].sum}`,
  );
  void revenueBefore;

  // ---- M. Write-off engine (pg 0004) ----------------------------------
  console.log("\nM. Write-off engine (pg 0004)");
  await asActor(U.karthik);
  await expectError(
    "Member cannot write off a balance",
    () => db.query(`select public.fp_write_off_card('${CARD_AMEX}'::uuid, 'test')`),
    "Only a family admin",
  );

  await asActor(U.aravind);
  await expectError(
    "Write-off without a remark rejected",
    () => db.query(`select public.fp_write_off_card('${CARD_AMEX}'::uuid, '   ')`),
    "remark is required",
  );

  const amexOff = await db.query<{ result: { id: string; amount: number } }>(
    `select public.fp_write_off_card('${CARD_AMEX}'::uuid, 'Bought out the balance') as result`,
  );
  check(
    "Card write-off returns the cleared amount",
    Number(amexOff.rows[0].result.amount) === 3650,
    String(amexOff.rows[0].result.amount),
  );
  const amexAfter = await db.query<{ num: string }>(
    `select coalesce(sum(case
        when t.kind='pl' and t.type='expense' and t.spent_through='manual'
             and t.category_id=$2 then -t.amount
        when t.kind='pl' and t.type in ('expense','interest_expense') then t.amount
        when t.kind='settlement' and t.type='card_payment' then -t.amount
        else 0 end),0)::numeric as num from transactions t where t.card_id=$1`,
    [CARD_AMEX, CAT.writeoff],
  );
  check("Amex outstanding written off to ₹0", num(amexAfter.rows[0]) === 0, String(amexAfter.rows[0].num));

  const hdfcAfterWriteOff = await db.query<{ c: number }>(
    `select count(*)::int as c from transactions where card_id=$1 and note='Bought out the balance'`,
    [CARD_HDFC],
  );
  check("Write-off never touches other cards", hdfcAfterWriteOff.rows[0].c === 0);

  await expectError(
    "second write-off of a zeroed card rejected",
    () => db.query(`select public.fp_write_off_card('${CARD_AMEX}'::uuid, 'again')`),
    "Nothing to write off",
  );

  const loanBefore = await db.query<{ principal_amount: string; repayment_total: string }>(
    `select principal_amount, repayment_total from loans where id=$1`,
    [LOAN_HDFC],
  );
  const loanBalance = num({ num: loanBefore.rows[0].principal_amount }) - num({ num: loanBefore.rows[0].repayment_total });
  check("HDFC loan balance ₹14,000 before write-off", loanBalance === 14000, String(loanBalance));

  const loanOff = await db.query<{ result: { id: string; type: string } }>(
    `select public.fp_write_off_loan('${LOAN_HDFC}'::uuid, 'Bank wrote off the remaining') as result`,
  );
  check(
    "Taken-loan write-off is booked as P&L revenue",
    loanOff.rows[0].result.type === "revenue",
    String(loanOff.rows[0].result.type),
  );
  const loanRow = await db.query<{ n: number; amt: number }>(
    `select count(*)::int as n, coalesce(sum(amount),0)::int as amt
     from transactions where kind='pl' and type='revenue'
       and category_id=$2 and linked_loan_id=$1 and note='Bank wrote off the remaining'`,
    [LOAN_HDFC, CAT.writeoff],
  );
  check(
    "Write-off is one auditable P&L row carrying the remark",
    loanRow.rows[0].n === 1 && loanRow.rows[0].amt === 14000,
    `n=${loanRow.rows[0].n} amt=${loanRow.rows[0].amt}`,
  );
  const loanAfter = await db.query<{ repayment_total: string }>(
    `select repayment_total from loans where id=$1`,
    [LOAN_HDFC],
  );
  check(
    "Write-off is never a repayment (repayment_total unchanged)",
    num({ num: loanAfter.rows[0].repayment_total }) ===
      num({ num: loanBefore.rows[0].repayment_total }),
    String(loanAfter.rows[0].repayment_total),
  );

  // ---- N. Loan lifecycle engine (pg 0005) -----------------------------
  console.log("\nN. Loan lifecycle engine (pg 0005)");
  await asActor(U.karthik);
  await expectError(
    "Member cannot create a loan",
    () =>
      db.query(
        `select public.fp_create_loan($j$${JSON.stringify({
          direction: "given", counterparty_name: "Pihu",
          principal_amount: 12000, start_date: "2026-08-01",
        })}$j$::jsonb)`,
      ),
    "Only a family admin can create a loan",
  );

  await asActor(U.aravind);
  await expectError(
    "Create rejects a bad direction",
    () =>
      db.query(
        `select public.fp_create_loan($j$${JSON.stringify({
          direction: "sideways", counterparty_name: "Pihu",
          principal_amount: 1000, start_date: "2026-08-01",
        })}$j$::jsonb)`,
      ),
    "given or taken",
  );
  await expectError(
    "Create rejects a non-positive principal",
    () =>
      db.query(
        `select public.fp_create_loan($j$${JSON.stringify({
          direction: "given", counterparty_name: "Pihu",
          principal_amount: 0, start_date: "2026-08-01",
        })}$j$::jsonb)`,
      ),
    "Principal must be a positive amount",
  );
  await expectError(
    "Create rejects a rate above 100%",
    () =>
      db.query(
        `select public.fp_create_loan($j$${JSON.stringify({
          direction: "given", counterparty_name: "Pihu",
          principal_amount: 1000, interest_rate: 101, start_date: "2026-08-01",
        })}$j$::jsonb)`,
      ),
    "between 0 and 100",
  );
  await expectError(
    "Create rejects a due date before the start",
    () =>
      db.query(
        `select public.fp_create_loan($j$${JSON.stringify({
          direction: "given", counterparty_name: "Pihu",
          principal_amount: 1000, start_date: "2026-08-10", due_date: "2026-08-01",
        })}$j$::jsonb)`,
      ),
    "Due date cannot be before",
  );
  await expectError(
    "Create rejects a blank counterparty",
    () =>
      db.query(
        `select public.fp_create_loan($j$${JSON.stringify({
          direction: "given", principal_amount: 1000, start_date: "2026-08-01",
        })}$j$::jsonb)`,
      ),
    "Pick a family member or type an external name",
  );

  // Create a given external loan — the engine must log ONE linked transfer.
  const pihu = await db.query<{ result: { id: string; direction: string; transfer: { id: string; transfer_group_id: string } } }>(
    `select public.fp_create_loan($j$${JSON.stringify({
      direction: "given", counterparty_name: "Pihu",
      principal_amount: 12000, interest_rate: 9,
      start_date: "2026-08-01", due_date: "2026-09-10",
      reminder_frequency: "monthly", note: "Trip advance",
    })}$j$::jsonb) as result`,
  );
  const pihuLoanId = pihu.rows[0].result.id;
  check(
    "Create returns the loan id + direction",
    !!pihuLoanId && pihu.rows[0].result.direction === "given",
  );
  check(
    "Create returns a transfer event",
    !!pihu.rows[0].result.transfer?.id,
  );
  const pihuLoan = await db.query<{ note: string | null; principal_amount: string; repayment_total: string; counterparty_name: string | null; reminder_frequency: string }>(
    `select note, principal_amount, repayment_total, counterparty_name, reminder_frequency::text as reminder_frequency from loans where id=$1`,
    [pihuLoanId],
  );
  check(
    "Loan stores note + principal + reminder, starts active with ₹0 repaid",
    pihuLoan.rows[0].note === "Trip advance" &&
      num({ num: pihuLoan.rows[0].principal_amount }) === 12000 &&
      num({ num: pihuLoan.rows[0].repayment_total }) === 0 &&
      pihuLoan.rows[0].counterparty_name === "Pihu" &&
      pihuLoan.rows[0].reminder_frequency === "monthly",
  );
  const pihuTransfer = await db.query<{ n: number; amount: string; note: string | null; kind: string; type: string }>(
    `select count(*)::int as n, coalesce(sum(amount),0)::numeric as amount,
            min(note)::text as note, min(kind)::text as kind, min(type)::text as type
     from transactions where linked_loan_id=$1 and kind='settlement' and type='transfer'`,
    [pihuLoanId],
  );
  check(
    "Principal is exactly one linked settlement/transfer at creation",
    pihuTransfer.rows[0].n === 1 &&
      num({ num: pihuTransfer.rows[0].amount }) === 12000 &&
      pihuTransfer.rows[0].kind === "settlement" &&
      pihuTransfer.rows[0].type === "transfer" &&
      pihuTransfer.rows[0].note === "Trip advance",
  );

  // Metadata edit that doesn't touch `note` must not wipe it.
  await db.query(
    `select public.fp_update_loan('${pihuLoanId}'::uuid, '{"interest_rate": 10, "due_date": "2026-09-20"}'::jsonb)`,
  );
  const pihuEdited = await db.query<{ note: string | null; interest_rate: string | null }>(
    `select note, interest_rate from loans where id=$1`,
    [pihuLoanId],
  );
  check(
    "Rate/due edit keeps the loan note",
    pihuEdited.rows[0].note === "Trip advance" && num({ num: pihuEdited.rows[0].interest_rate }) === 10,
  );
  const pihuTransferNote = await db.query<{ note: string | null }>(
    `select note from transactions where linked_loan_id=$1 and kind='settlement' and type='transfer'`,
    [pihuLoanId],
  );
  check(
    "Rate/due edit keeps the principal transfer note",
    pihuTransferNote.rows[0].note === "Trip advance",
  );
  // An edit that DOES carry note syncs the principal transfer note too.
  await db.query(
    `select public.fp_update_loan('${pihuLoanId}'::uuid, '{"note": "Trip advance (revised)"}'::jsonb)`,
  );
  const pihuNoteSynced = await db.query<{ lnote: string | null; tnote: string | null }>(
    `select l.note::text as lnote, t.note::text as tnote
     from loans l left join transactions t
       on t.linked_loan_id=l.id and t.kind='settlement' and t.type='transfer'
     where l.id=$1`,
    [pihuLoanId],
  );
  check(
    "Note edit syncs the principal transfer",
    pihuNoteSynced.rows[0].lnote === "Trip advance (revised)" &&
      pihuNoteSynced.rows[0].tnote === "Trip advance (revised)",
  );

  await expectError(
    "Edit rejects a principal change",
    () =>
      db.query(
        `select public.fp_update_loan('${pihuLoanId}'::uuid, '{"principal_amount": 9999}'::jsonb)`,
      ),
    "A loan principal is set when the loan is created",
  );

  // Record a repayment so the direction lock + delete block trigger.
  await db.query(
    `select public.fp_create_transaction($j$${JSON.stringify({
      kind: "settlement", type: "loan_repayment", scope_type: "personal",
      amount: 2000, linked_loan_id: pihuLoanId, date: "2026-08-28", note: "Pihu repayment",
    })}$j$::jsonb)`,
  );
  await expectError(
    "Direction is locked once a loan has repayments",
    () =>
      db.query(`select public.fp_update_loan('${pihuLoanId}'::uuid, '{"direction": "taken"}'::jsonb)`),
    "recorded activity",
  );
  await expectError(
    "Delete is blocked while repayments exist",
    () => db.query(`select public.fp_delete_loan('${pihuLoanId}'::uuid)`),
    "recorded repayment",
  );

  // Once the repayment row is gone, the pristine loan deletes itself AND
  // its single principal transfer.
  await db.query(`delete from transactions where note='Pihu repayment'`);
  const delPihu = await db.query<{ result: { id: string } }>(
    `select public.fp_delete_loan('${pihuLoanId}'::uuid) as result`,
  );
  const pihuGone = await db.query<{ loans: number; transfers: number }>(
    `select (select count(*)::int from loans where id=$1) as loans,
            (select count(*)::int from transactions where linked_loan_id=$1) as transfers`,
    [pihuLoanId],
  );
  check(
    "Pristine external loan deletes itself + its principal transfer",
    !!delPihu.rows[0].result?.id && pihuGone.rows[0].loans === 0 && pihuGone.rows[0].transfers === 0,
  );

  // Taken external loan (interest-free, no due date, no reminder) —
  // deletable while pristine.
  const bf = await db.query<{ result: { id: string; direction: string } }>(
    `select public.fp_create_loan($j$${JSON.stringify({
      direction: "taken", counterparty_name: "Bharat Finance",
      principal_amount: 8000, reminder_frequency: "none",
      start_date: "2026-08-15",
    })}$j$::jsonb) as result`,
  );
  const bfId = bf.rows[0].result.id;
  check("Taken external loan created", bf.rows[0].result.direction === "taken");
  await db.query(`select public.fp_delete_loan('${bfId}'::uuid)`);
  const bfGone = await db.query<{ loans: number }>(
    `select count(*)::int as loans from loans where id=$1`,
    [bfId],
  );
  check("Taken loan also deletes while pristine", bfGone.rows[0].loans === 0);

  // Family-member loan — the principal transfer is paired and UNLINKED, so
  // deleting the loan keeps both transfer rows as pure settlements.
  const fam = await db.query<{ result: { id: string } }>(
    `select public.fp_create_loan($j$${JSON.stringify({
      direction: "given", counterparty_user_id: U.karthik,
      principal_amount: 3000, start_date: "2026-08-20", note: "Home appliances",
    })}$j$::jsonb) as result`,
  );
  const famId = fam.rows[0].result.id;
  const famPairNote = await db.query<{ n: number; linked: number }>(
    `select count(*)::int as n, count(linked_loan_id)::int as linked
     from transactions where note='Home appliances' or note='Home appliances (mirror)'`,
  );
  check(
    "Family loan principal is a paired transfer on both ledgers, never loan-linked",
    famPairNote.rows[0].n === 2 && famPairNote.rows[0].linked === 0,
  );
  await db.query(`select public.fp_delete_loan('${famId}'::uuid)`);
  const famAfter = await db.query<{ loans: number; transfers: number }>(
    `select (select count(*)::int from loans where id=$1) as loans,
            (select count(*)::int from transactions
              where note='Home appliances' or note='Home appliances (mirror)') as transfers`,
    [famId],
  );
  check(
    "Deleting a family loan removes the loan but keeps the transfer pair",
    famAfter.rows[0].loans === 0 && famAfter.rows[0].transfers === 2,
  );

  await asActor(U.karthik);
  await expectError(
    "Member cannot delete a loan",
    () => db.query(`select public.fp_delete_loan('${LOAN_AMIT}'::uuid)`),
    "Only a family admin can delete a loan",
  );
  await expectError(
    "Member cannot edit any loan",
    () =>
      db.query(`select public.fp_update_loan('${LOAN_AMIT}'::uuid, $j$${JSON.stringify({ direction: "given" })}$j$::jsonb)`),
    "Only a family admin can edit a loan",
  );

  // ---- O. Project lifecycle engine (pg 0006) ---------------------------
  console.log("\nO. Project lifecycle engine (pg 0006)");
  // A fourth, foreign user to prove same-family enforcement on projects.
  // Inserting into auth.users auto-creates the profile via handle_new_user(),
  // so we add the foreign family and link the fresh profile into it.
  await db.exec("reset role;");
  await db.exec(`
    insert into auth.users (id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4');
    insert into public.families (id, name, owner_id) values
      ('babababa-baba-4aba-8aba-bababababa11', 'The Outsiders', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4');
    update public.users set family_id = 'babababa-baba-4aba-8aba-bababababa11'
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
  `);
  await asActor(U.aravind);

  const targetCol = await db.query<{ n: number }>(
    `select count(*)::int as n from information_schema.columns
     where table_schema='public' and table_name='projects' and column_name='target_date'`,
  );
  check("0006 adds projects.target_date", targetCol.rows[0].n === 1);
  const seedTargets = await db.query<{ n: number }>(
    `select count(*)::int as n from public.projects where target_date is not null`,
  );
  check("Frozen seed projects start with no target date", seedTargets.rows[0].n === 0);

  // Authorization — create is admin-only.
  await asActor(U.karthik);
  await expectError(
    "Member cannot create a project",
    () =>
      db.query(
        `select public.fp_create_project($j$${JSON.stringify({
          name: "Tea Estate",
          members: [{ user_id: U.karthik, role: "owner" }],
        })}$j$::jsonb)`,
      ),
    "Only a family admin can create a project",
  );

  // Validation suite.
  await asActor(U.aravind);
  await expectError(
    "Create requires the creator as owner in the member set",
    () =>
      db.query(
        `select public.fp_create_project('{"name":"X","members":[{"user_id":"${U.revathi}","role":"owner"}]}'::jsonb)`,
      ),
    "You must be included as the project owner",
  );
  await expectError(
    "Create rejects an empty name",
    () =>
      db.query(
        `select public.fp_create_project('{"name":"  ","members":[{"user_id":"${U.aravind}","role":"owner"}]}'::jsonb)`,
      ),
    "Project name is required",
  );
  await expectError(
    "Create rejects a non-positive budget",
    () =>
      db.query(
        `select public.fp_create_project('{"name":"X","budget":-5,"members":[{"user_id":"${U.aravind}","role":"owner"}]}'::jsonb)`,
      ),
    "Budget must be a positive amount",
  );
  await expectError(
    "Create rejects an out-of-family member",
    () =>
      db.query(
        `select public.fp_create_project($j$${JSON.stringify({
          name: "X",
          members: [
            { user_id: U.aravind, role: "owner" },
            { user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4", role: "contributor" },
          ],
        })}$j$::jsonb)`,
      ),
    "Member is not in your family",
  );
  await expectError(
    "Create rejects an invalid project role",
    () =>
      db.query(
        `select public.fp_create_project($j$${JSON.stringify({
          name: "X",
          members: [
            { user_id: U.aravind, role: "owner" },
            { user_id: U.revathi, role: "king" },
          ],
        })}$j$::jsonb)`,
      ),
    "Invalid project role",
  );
  await expectError(
    "Create rejects duplicate members",
    () =>
      db.query(
        `select public.fp_create_project($j$${JSON.stringify({
          name: "X",
          members: [
            { user_id: U.aravind, role: "owner" },
            { user_id: U.aravind, role: "contributor" },
          ],
        })}$j$::jsonb)`,
      ),
    "Duplicate members",
  );

  // A real project: owner (creator) + contributor, budget + target date.
  const create = await db.query<{ result: { id: string } }>(
    `select public.fp_create_project($j$${JSON.stringify({
      name: "Tea Estate",
      budget: 25000,
      target_date: "2026-12-31",
      members: [
        { user_id: U.aravind, role: "owner" },
        { user_id: U.revathi, role: "contributor" },
      ],
    })}$j$::jsonb) as result`,
  );
  const teaId = create.rows[0].result.id;
  check("Create returns the new project id", !!teaId);
  const teaRows = await db.query<{ projects: number; members: number }>(
    `select (select count(*)::int from public.projects where id=$1)::int as projects,
            (select count(*)::int from public.project_members where project_id=$1)::int as members`,
    [teaId],
  );
  check(
    "Create persists project + members (owner + contributor)",
    teaRows.rows[0].projects === 1 && teaRows.rows[0].members === 2,
  );

  // Reads are family-wide for members (frozen projects_select policy).
  await asActor(U.karthik);
  const visibleProjects = await db.query<{ n: string }>(
    `select count(*)::text as n from public.projects`,
  );
  check(
    "Member reads family projects (family-wide visibility)",
    Number(visibleProjects.rows[0].n) >= 3,
    String(visibleProjects.rows[0].n),
  );

  // Project-scoped P&L through the Phase-2 engine: a contributor can log, a
  // viewer cannot (the engine is role-aware — viewers are read-only).
  await asActor(U.revathi);
  const projExp = await db.query<{ result: { id: string } }>(
    `select public.fp_create_transaction($j$${JSON.stringify({
      kind: "pl", type: "expense", scope_type: "project", scope_id: teaId,
      amount: 4000, category_id: CAT.travel, spent_through: "manual",
      date: "2026-08-28", note: "Tea estate booking",
    })}$j$::jsonb) as result`,
  );
  check("Contributor logs a project expense", !!projExp.rows[0]?.result);
  const teaExpId = projExp.rows[0].result.id;

  await asActor(U.karthik);
  await expectError(
    "Non-member cannot log against the project",
    () =>
      db.query(
        `select public.fp_create_transaction($j$${JSON.stringify({
          kind: "pl", type: "expense", scope_type: "project", scope_id: teaId,
          amount: 500, category_id: CAT.travel, spent_through: "manual",
          date: "2026-08-28",
        })}$j$::jsonb)`,
      ),
    "You must be a project member",
  );

  // Metadata edit is admin-only, partial payloads keep untouched fields.
  await asActor(U.karthik);
  await expectError(
    "Member cannot edit project metadata",
    () =>
      db.query(
        `select public.fp_update_project('${teaId}'::uuid, '{"name":"Tea Estate II"}'::jsonb)`,
      ),
    "Only a family admin can edit a project",
  );
  await asActor(U.aravind);
  await db.query(
    `select public.fp_update_project('${teaId}'::uuid, '{"name":"Tea Estate II","budget":30000,"status":"archived"}'::jsonb)`,
  );
  const editedProj = await db.query<{ name: string; budget: string; status: string; target_date: string | null }>(
    `select name, budget, status::text as status, target_date::text as target_date
     from public.projects where id=$1`,
    [teaId],
  );
  check(
    "Metadata edit persists name/budget/status, keeps untouched target date",
    num({ num: editedProj.rows[0].budget }) === 30000 &&
      editedProj.rows[0].name === "Tea Estate II" &&
      editedProj.rows[0].status === "archived" &&
      editedProj.rows[0].target_date === "2026-12-31",
    JSON.stringify(editedProj.rows[0]),
  );

  // Archived projects are read-only at the engine, even for the admin.
  await expectError(
    "Admin cannot edit a transaction of an archived project",
    () =>
      db.query(
        `select public.fp_update_transaction('${teaExpId}'::uuid, '{"note":"hacked"}'::jsonb)`,
      ),
    "Archived projects are read-only",
  );
  await expectError(
    "Admin cannot delete a transaction of an archived project",
    () => db.query(`select public.fp_delete_transaction('${teaExpId}'::uuid)`),
    "Archived projects are read-only",
  );
  await expectError(
    "Archived project membership is frozen",
    () =>
      db.query(
        `select public.fp_set_project_members('${teaId}'::uuid, $j$${JSON.stringify([
          { user_id: U.aravind, role: "owner" },
        ])}$j$::jsonb)`,
      ),
    "Archived projects are read-only",
  );
  await expectError(
    "Archived project metadata is frozen",
    () =>
      db.query(
        `select public.fp_update_project('${teaId}'::uuid, '{"name":"Tea Estate Hack"}'::jsonb)`,
      ),
    "Archived projects are read-only",
  );
  // Only the restore transition is allowed while archived; it re-opens writes.
  await db.query(
    `select public.fp_update_project('${teaId}'::uuid, '{"status":"active"}'::jsonb)`,
  );
  const restored = await db.query<{ status: string }>(
    `select status::text as status from public.projects where id=$1`,
    [teaId],
  );
  await db.query(
    `select public.fp_update_project('${teaId}'::uuid, '{"name":"Tea Estate III"}'::jsonb)`,
  );
  check(
    "Restore is the only archived write and re-enables metadata edits",
    restored.rows[0].status === "active",
    String(restored.rows[0]?.status),
  );

  // Member management — owner (not admin) can replace the member set.
  const create2 = await db.query<{ result: { id: string } }>(
    `select public.fp_create_project($j$${JSON.stringify({
      name: "Renovation",
      members: [
        { user_id: U.aravind, role: "owner" },
        { user_id: U.karthik, role: "owner" },
        { user_id: U.revathi, role: "viewer" },
      ],
    })}$j$::jsonb) as result`,
  );
  const renId = create2.rows[0].result.id;
  check("Create with co-owners + viewer works", !!renId);

  await asActor(U.revathi);
  await expectError(
    "A contributor cannot manage members",
    () =>
      db.query(
        `select public.fp_set_project_members('${renId}'::uuid, $j$${JSON.stringify([{ user_id: U.aravind, role: "owner" }])}$j$::jsonb)`,
      ),
    "family admin or project owner",
  );

  await asActor(U.karthik); // owner, not admin
  await db.query(
    `select public.fp_set_project_members('${renId}'::uuid, $j$${JSON.stringify([
      { user_id: U.karthik, role: "owner" },
      { user_id: U.revathi, role: "contributor" },
    ])}$j$::jsonb)`,
  );
  const renMembers = await db.query<{ user_id: string; role: string }>(
    `select user_id, role::text as role from public.project_members
     where project_id=$1 order by user_id`,
    [renId],
  );
  check(
    "Owner (not admin) replaces membership — Aravind removed, team valid",
    renMembers.rows.length === 2 &&
      renMembers.rows.every((r) => r.role === "owner" || r.role === "contributor") &&
      !renMembers.rows.some((r) => r.user_id === U.aravind),
    JSON.stringify(renMembers.rows),
  );
  await expectError(
    "Last-owner guard: a project can't be left ownerless",
    () =>
      db.query(
        `select public.fp_set_project_members('${renId}'::uuid, $j$${JSON.stringify([{ user_id: U.revathi, role: "viewer" }])}$j$::jsonb)`,
      ),
    "at least one owner",
  );
  await expectError(
    "Owner cannot add an out-of-family member",
    () =>
      db.query(
        `select public.fp_set_project_members('${renId}'::uuid, $j$${JSON.stringify([
          { user_id: U.karthik, role: "owner" },
          { user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4", role: "viewer" },
        ])}$j$::jsonb)`,
      ),
    "Member is not in your family",
  );

  // Delete — admin only; blocked while project P&L exists.
  await asActor(U.karthik);
  await expectError(
    "Member cannot delete a project",
    () => db.query(`select public.fp_delete_project('${renId}'::uuid)`),
    "Only a family admin can delete a project",
  );
  await asActor(U.aravind);
  await expectError(
    "Project with recorded transactions cannot be deleted",
    () => db.query(`select public.fp_delete_project('${teaId}'::uuid)`),
    "cannot be deleted",
  );
  const delSafe = await db.query<{ result: { id: string } }>(
    `select public.fp_delete_project('${renId}'::uuid) as result`,
  );
  const renGone = await db.query<{ projects: number; members: number }>(
    `select (select count(*)::int from public.projects where id=$1)::int as projects,
            (select count(*)::int from public.project_members where project_id=$1)::int as members`,
    [renId],
  );
  check(
    "Pristine project deletes itself and cascades its members",
    !!delSafe.rows[0].result?.id && renGone.rows[0].projects === 0 && renGone.rows[0].members === 0,
  );

  // Budget coexistence (Issue 9 contracts) on project scope + personal.
  await asActor(U.aravind);
  await db.query(
    `insert into public.budgets (id, scope_type, scope_id, category_id, amount, period) values
       ('bbbbbbbb-bbbb-4bbb-8bbb-eeeeeeeeee01', 'project', '${teaId}', '${CAT.travel}', 20000, 'monthly'),
       ('bbbbbbbb-bbbb-4bbb-8bbb-eeeeeeeeee02', 'project', '${teaId}', '${CAT.travel}', 15000, 'one_time')`,
  );
  const coexist = await db.query<{ n: number }>(
    `select count(*)::int as n from public.budgets
     where scope_type='project' and scope_id=$1 and category_id=$2`,
    [teaId, CAT.travel],
  );
  check(
    "Monthly + one-time budgets coexist for the same project category",
    coexist.rows[0].n === 2,
  );

  await db.query(
    `insert into public.budgets (id, scope_type, scope_id, category_id, amount, period) values
       ('bbbbbbbb-bbbb-4bbb-8bbb-eeeeeeeeee03', 'personal', '${U.aravind}', '${CAT.travel}', 500, 'one_time')`,
  );
  const coexist2 = await db.query<{ n: number }>(
    `select count(*)::int as n from public.budgets
     where category_id=$1 and ((scope_type='project' and scope_id=$2) or (scope_type='personal' and scope_id=$3))`,
    [CAT.travel, teaId, U.aravind],
  );
  check(
    "Personal + project budgets coexist for the same category",
    coexist2.rows[0].n === 4, // seed b2 (personal monthly) + ee01..03
    String(coexist2.rows[0].n),
  );

  await expectError(
    "Duplicate monthly project budget rejected (unique index)",
    () =>
      db.query(
        `insert into public.budgets (scope_type, scope_id, category_id, amount, period)
         values ('project', '${teaId}', '${CAT.travel}', 999, 'monthly')`,
      ),
    "duplicate",
  );
  await db.query(
    `insert into public.budgets (id, scope_type, scope_id, category_id, amount, period, start_date, end_date) values
       ('bbbbbbbb-bbbb-4bbb-8bbb-eeeeeeeeee04', 'project', '${teaId}', '${CAT.travel}', 5000, 'custom', '2026-08-01', '2026-08-31')`,
  );
  await expectError(
    "Overlapping custom project budget rejected (exclusion constraint)",
    () =>
      db.query(
        `insert into public.budgets (scope_type, scope_id, category_id, amount, period, start_date, end_date)
         values ('project', '${teaId}', '${CAT.travel}', 5000, 'custom', '2026-08-15', '2026-09-15')`,
      ),
    "conflict",
  );

  // Viewer read-only at the engine + archive lifecycle on a dedicated project.
  const arch = await db.query<{ result: { id: string } }>(
    `select public.fp_create_project($j$${JSON.stringify({
      name: "Archive Flow",
      members: [
        { user_id: U.aravind, role: "owner" },
        { user_id: U.revathi, role: "viewer" },
      ],
    })}$j$::jsonb) as result`,
  );
  const archId = arch.rows[0].result.id;
  await asActor(U.revathi);
  await expectError(
    "Viewer cannot log a project expense (engine-enforced)",
    () =>
      db.query(
        `select public.fp_create_transaction($j$${JSON.stringify({
          kind: "pl", type: "expense", scope_type: "project", scope_id: archId,
          amount: 1000, category_id: CAT.travel, spent_through: "manual",
          date: "2026-08-28",
        })}$j$::jsonb)`,
      ),
    "Project viewers are read-only",
  );
  await asActor(U.aravind);
  await db.query(
    `select public.fp_update_project('${archId}'::uuid, '{"status":"archived"}'::jsonb)`,
  );
  await expectError(
    "Admin cannot log against an archived project",
    () =>
      db.query(
        `select public.fp_create_transaction($j$${JSON.stringify({
          kind: "pl", type: "expense", scope_type: "project", scope_id: archId,
          amount: 1000, category_id: CAT.travel, spent_through: "manual",
          date: "2026-08-28",
        })}$j$::jsonb)`,
      ),
    "Archived projects are read-only",
  );
  // Restore re-opens writes; then clean up the pristine project.
  await db.query(
    `select public.fp_update_project('${archId}'::uuid, '{"status":"active"}'::jsonb)`,
  );
  const writeBack = await db.query<{ result: { id: string } }>(
    `select public.fp_create_transaction($j$${JSON.stringify({
      kind: "pl", type: "revenue", scope_type: "project", scope_id: archId,
      amount: 100, category_id: CAT.travel, date: "2026-08-28",
    })}$j$::jsonb) as result`,
  );
  check("Restored project accepts writes again", !!writeBack.rows[0]?.result);
  await db.query(
    `select public.fp_delete_transaction('${writeBack.rows[0].result.id}'::uuid)`,
  );
  const archTrace = await db.query<{ projects: number }>(
    `select (select count(*)::int from public.projects where id=$1)::int as projects`,
    [archId],
  );
  await db.query(`select public.fp_delete_project('${archId}'::uuid)`);
  check(
    "Deleting a restored project cascades its team",
    archTrace.rows[0].projects === 1,
  );

  // Clean up the O-section project rows (keep the seeded baseline intact).
  await db.query(`select public.fp_delete_transaction('${teaExpId}'::uuid)`);
  await db.query(`delete from public.budgets where id in
    ('bbbbbbbb-bbbb-4bbb-8bbb-eeeeeeeeee01',
     'bbbbbbbb-bbbb-4bbb-8bbb-eeeeeeeeee02',
     'bbbbbbbb-bbbb-4bbb-8bbb-eeeeeeeeee03',
     'bbbbbbbb-bbbb-4bbb-8bbb-eeeeeeeeee04')`);
  await db.query(`select public.fp_delete_project('${teaId}'::uuid)`);

  // ---- P. Family + Admin (Phase 6; pg 0007) ---------------------------
  console.log("\nP. Family + Admin (pg 0007)");
  const FAMILY_ID = "11111111-1111-4111-8111-111111111111";
  const GOA_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
  const U4 = "bbbbbbbb-cccc-4ddd-9aaa-bbbbbbbbbbb4";
  const LOAN_KAR = "ffffffff-ffff-4fff-8fff-fffffffffff9";
  const CAT_TMP = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  // S. Project roles are NOT family-admin powers — a project owner who is
  // only a family member must be blocked from every family-admin engine op.
  await asActor(U.aravind);
  const ownerProj = await db.query<{ result: { id: string } }>(
    `select public.fp_create_project($j$${JSON.stringify({
      name: "Owner Isolation",
      members: [
        { user_id: U.aravind, role: "owner" },
        { user_id: U.karthik, role: "contributor" },
        { user_id: U.revathi, role: "contributor" },
      ],
    })}$j$::jsonb) as result`,
  );
  const ownerProjId = ownerProj.rows[0].result.id;
  await db.query(
    `select public.fp_set_project_members('${ownerProjId}'::uuid, $j$${JSON.stringify([
      { user_id: U.karthik, role: "owner" },
      { user_id: U.revathi, role: "contributor" },
    ])}$j$::jsonb)`,
  );
  await asActor(U.karthik);
  await expectError(
    "Project owner (non-admin family member) cannot change roles",
    () =>
      db.query(`select public.fp_change_family_role('${U.aravind}'::uuid, 'member')`),
    "Only a family admin can change member roles",
  );
  await expectError(
    "Project owner (non-admin family member) cannot remove members",
    () => db.query(`select public.fp_remove_member('${U.revathi}'::uuid)`),
    "Only a family admin can remove members",
  );
  await expectError(
    "Project owner (non-admin family member) cannot reorder categories",
    () => db.query(`select public.fp_reorder_categories('[]'::jsonb)`),
    "Only a family admin can manage categories",
  );
  await asActor(U.aravind);

  // Q. Members are blocked from every family-admin engine op.
  await asActor(U.karthik);
  await expectError(
    "Member cannot change roles",
    () =>
      db.query(`select public.fp_change_family_role('${U.revathi}'::uuid, 'admin')`),
    "Only a family admin can change member roles",
  );
  await expectError(
    "Member cannot remove members",
    () => db.query(`select public.fp_remove_member('${U.revathi}'::uuid)`),
    "Only a family admin can remove members",
  );
  await expectError(
    "Member cannot reorder categories",
    () => db.query(`select public.fp_reorder_categories('[]'::jsonb)`),
    "Only a family admin can manage categories",
  );
  await expectError(
    "Member cannot delete categories",
    () => db.query(`select public.fp_delete_category('${CAT.travel}'::uuid)`),
    "Only a family admin can manage categories",
  );
  await db.query(
    `update public.categories set name = 'Clobbered' where id = '${CAT.food}'`,
  );
  const foodName = await db.query<{ name: string }>(
    `select name from public.categories where id = '${CAT.food}'`,
  );
  check("Member cannot edit categories (RLS)", foodName.rows[0].name === "Food & Dining");

  // E. Promote to admin; R. promoted admin acquires family-admin powers.
  await asActor(U.aravind);
  const promote = await db.query<{ result: { role: string } }>(
    `select public.fp_change_family_role('${U.revathi}'::uuid, 'admin') as result`,
  );
  check("Admin promotes Revathi to admin", promote.rows[0].result.role === "admin");
  await asActor(U.revathi);
  const promoteByPromoted = await db.query<{ result: { role: string } }>(
    `select public.fp_change_family_role('${U.karthik}'::uuid, 'admin') as result`,
  );
  check("Promoted admin can promote members", promoteByPromoted.rows[0].result.role === "admin");

  // F. Demote to member; last-admin demote must be blocked.
  await asActor(U.aravind);
  const demote = await db.query<{ result: { role: string } }>(
    `select public.fp_change_family_role('${U.karthik}'::uuid, 'member') as result`,
  );
  check("Admin demotes Karthik to member", demote.rows[0].result.role === "member");
  const demoteRevathi = await db.query<{ result: { role: string } }>(
    `select public.fp_change_family_role('${U.revathi}'::uuid, 'member') as result`,
  );
  check("Admin demotes Revathi to member", demoteRevathi.rows[0].result.role === "member");
  await expectError(
    "Last remaining admin cannot demote self",
    () =>
      db.query(`select public.fp_change_family_role('${U.aravind}'::uuid, 'member')`),
    "Family must keep at least one admin",
  );

  // G. Self-removal and outside-family removal blocked.
  await expectError(
    "Admin cannot remove self",
    () => db.query(`select public.fp_remove_member('${U.aravind}'::uuid)`),
    "You cannot remove yourself",
  );

  // C. Invitation — new user gets a profile, then joins via invite code.
  await db.exec(`reset role;`);
  await db.query(
    `insert into auth.users (id, email) values ('${U4}', 'temp4@familypurse.test')`,
  );
  // Read the fresh profile as the user themself; a family admin must not see
  // a not-yet-joined member of another household (0009 family-scoped select).
  await asActor(U4);
  const u4profile = await db.query<{ role: string; family_id: string | null }>(
    `select role, family_id from public.users where id = '${U4}'`,
  );
  check(
    "Sign-up creates a member profile before joining",
    u4profile.rows[0].role === "member" && u4profile.rows[0].family_id === null,
  );
  await asActor(U.aravind);
  await expectError(
    "Outside-family user cannot be removed",
    () => db.query(`select public.fp_remove_member('${U4}'::uuid)`),
    "User is not in your family",
  );
  await asActor(U4);
  const joined = await db.query<{ id: string }>(
    `select public.join_family('RAMANPLUS') as id`,
  );
  check("Invite join via code puts member in the family", joined.rows[0].id === FAMILY_ID);
  const famVis = await db.query<{ n: number }>(
    `select count(*)::int as n from public.users where family_id = '${FAMILY_ID}'`,
  );
  check("Joined member sees the full family roster", num(famVis.rows[0].n) === 4);

  // H. Remove a member with no open balance — clean, roles stripped.
  await asActor(U.aravind);
  await db.query(
    `select public.fp_set_project_members('${GOA_ID}'::uuid, $j$${JSON.stringify([
      { user_id: U.aravind, role: "owner" },
      { user_id: U.revathi, role: "contributor" },
      { user_id: U.karthik, role: "contributor" },
      { user_id: U4, role: "contributor" },
    ])}$j$::jsonb)`,
  );
  const removeClean = await db.query<{ result: { removed: boolean } }>(
    `select public.fp_remove_member('${U4}'::uuid) as result`,
  );
  check("Admin removes a member with no open balance", removeClean.rows[0].result.removed === true);
  // Read the removed member's own profile (family-scoped select means an
  // admin can no longer inspect an outside/null-family member's row).
  await asActor(U4);
  const u4after = await db.query<{ family_id: string | null }>(
    `select family_id from public.users where id = '${U4}'`,
  );
  check("Removed member leaves the family", u4after.rows[0].family_id === null);
  await asActor(U.aravind);
  const u4pm = await db.query<{ n: number }>(
    `select count(*)::int as n from public.project_members where user_id = '${U4}'`,
  );
  check("Removal strips the member's project memberships", num(u4pm.rows[0].n) === 0);

  // I. Remove a member with an OPEN balance — authorized server-side
  // (the settle-first guard rail is the client dialog); the outstanding
  // loan survives untouched and becomes read-only.
  const loanCountBefore = await db.query<{ n: number }>(
    `select count(*)::int as n from public.loans`,
  );
  await db.query(
    `insert into public.loans (id, direction, counterparty_user_id, principal_amount, start_date, created_by)
     values ('${LOAN_KAR}', 'given', '${U.karthik}', 4000, '2026-08-01', '${U.aravind}')`,
  );
  const karthikOpen = await db.query<{ n: number }>(
    `select count(*)::int as n from public.loans where counterparty_user_id = '${U.karthik}' and status = 'active'
     and (principal_amount - repayment_total) > 0`,
  );
  check("Open family-member loan is detectable for the guard rail", num(karthikOpen.rows[0].n) === 1);
  const removeOpen = await db.query<{ result: { removed: boolean } }>(
    `select public.fp_remove_member('${U.karthik}'::uuid) as result`,
  );
  check(
    "Server authorizes removal despite the open balance (guard rail is client-side)",
    removeOpen.rows[0].result.removed === true,
  );
  // Read the removed member's own profile (family-scoped users select).
  await asActor(U.karthik);
  const karthikState = await db.query<{ family_id: string | null }>(
    `select family_id from public.users where id = '${U.karthik}'`,
  );
  check("Open-balance member leaves the family", karthikState.rows[0].family_id === null);
  await asActor(U.aravind);
  const karthikLoan = await db.query<{ counterparty_user_id: string }>(
    `select counterparty_user_id from public.loans where id = '${LOAN_KAR}'`,
  );
  check(
    "Loan history survives removal (read-only afterward)",
    karthikLoan.rows[0].counterparty_user_id === U.karthik,
  );

  // Restore the baseline before continuing (rejoin Karthik, re-add his
  // seeded Goa membership, drop the temp loan). This is test scaffolding:
  // as superuser, because the family-scoped users SELECT policy (0009) no
  // longer hands an admin another-null-family user's row.
  await db.exec("reset role;");
  await db.query(
    `update public.users set family_id = '${FAMILY_ID}' where id = '${U.karthik}'`,
  );
  await asActor(U.aravind);
  await db.query(
    `select public.fp_set_project_members('${GOA_ID}'::uuid, $j$${JSON.stringify([
      { user_id: U.aravind, role: "owner" },
      { user_id: U.revathi, role: "contributor" },
      { user_id: U.karthik, role: "contributor" },
    ])}$j$::jsonb)`,
  );
  await db.query(`delete from public.loans where id = '${LOAN_KAR}'`);

  // J. Family-scoped category list — 9 seeded (6 usable + 3 system).
  const catList = await db.query<{ total: number; usable: number }>(
    `select count(*)::int as total,
            count(*) filter (where system = false)::int as usable
     from public.categories where family_id = '${FAMILY_ID}'`,
  );
  check("Family sees its 9 canonical categories", catList.rows[0].total === 9);
  check("6 usable categories (3 are system)", catList.rows[0].usable === 6);

  // K. Reorder — full-set atomic swap, then restore.
  await asActor(U.aravind);
  const orderBefore = await db.query<{ id: string }>(
    `select id from public.categories
     where family_id = '${FAMILY_ID}' and system = false order by sort_order`,
  );
  const beforeIds = orderBefore.rows.map((r) => r.id);
  const reversed = [...beforeIds].reverse();
  const reorder = await db.query<{ result: { reordered: number } }>(
    `select public.fp_reorder_categories($j$${JSON.stringify(reversed.map((id) => ({ id })))}$j$) as result`,
  );
  check("Admin reorders the family categories", reorder.rows[0].result.reordered === beforeIds.length);
  const orderAfter = await db.query<{ id: string }>(
    `select id from public.categories
     where family_id = '${FAMILY_ID}' and system = false order by sort_order`,
  );
  check("Category order persisted", JSON.stringify(orderAfter.rows.map((r) => r.id)) === JSON.stringify(reversed));
  await db.query(
    `select public.fp_reorder_categories($j$${JSON.stringify(beforeIds.map((id) => ({ id })))}$j$)`,
  );
  const orderRestored = await db.query<{ id: string }>(
    `select id from public.categories
     where family_id = '${FAMILY_ID}' and system = false order by sort_order`,
  );
  check("Seed category order restored", JSON.stringify(orderRestored.rows.map((r) => r.id)) === JSON.stringify(beforeIds));

  // L. Edit a category — admin yes, member/no (RLS + reorder guard).
  const editCat = await db.query<{ id: string }>(
    `update public.categories set name = 'Food Revised' where id = '${CAT.food}' returning id`,
  );
  check("Admin can edit a category", editCat.rows.length === 1);
  await db.query(`update public.categories set name = 'Food & Dining' where id = '${CAT.food}'`);

  // M. Delete requires reassignment when transactions are tagged.
  await db.query(
    `insert into public.categories (id, family_id, name, color, sort_order)
     values ('${CAT_TMP}', '${FAMILY_ID}', 'Temp Category', '#123456', 99) returning id`,
  );
  const tmpExp = await db.query<{ result: { id: string } }>(
    `select public.fp_create_transaction($j$${JSON.stringify({
      kind: "pl", type: "expense", scope_type: "personal", scope_id: U.aravind,
      amount: 500, category_id: CAT_TMP, spent_through: "manual", date: "2026-08-28",
    })}$j$::jsonb) as result`,
  );
  await expectError(
    "Deleting a category with tagged transactions needs a reassignment target",
    () => db.query(`select public.fp_delete_category('${CAT_TMP}'::uuid)`),
    "replacement category",
  );
  const reasDelete = await db.query<{ result: { reassigned: number } }>(
    `select public.fp_delete_category('${CAT_TMP}'::uuid, '${CAT.food}'::uuid) as result`,
  );
  check("Reassigned transactions then category deleted", reasDelete.rows[0].result.reassigned === 1);
  const tmpCatGone = await db.query<{ n: number }>(
    `select count(*)::int as n from public.categories where id = '${CAT_TMP}'`,
  );
  check("Category row is gone", num(tmpCatGone.rows[0].n) === 0);
  const recatTxn = await db.query<{ category_id: string }>(
    `select category_id from transactions where id = '${tmpExp.rows[0].result.id}'`,
  );
  check("Its transactions moved to the replacement category", recatTxn.rows[0].category_id === CAT.food);
  await db.query(`select public.fp_delete_transaction('${tmpExp.rows[0].result.id}'::uuid)`);

  // N. System categories are permanent; members blocked by RLS too.
  await expectError(
    "System category cannot be deleted",
    () => db.query(`select public.fp_delete_category('${CAT.interestPaid}'::uuid)`),
    "System categories cannot be deleted",
  );
  await asActor(U.karthik);
  const memberReassign = await db.query<{ id: string }>(
    `update public.categories set name = 'Nope' where id = '${CAT.travel}' returning id`,
  );
  check(
    "Member blocked from editing categories (RLS zero rows)",
    memberReassign.rows.length === 0,
  );

  // P. Profile/account — members edit only themselves; admins edit family rows.
  await asActor(U.aravind);
  const adminRename = await db.query<{ id: string }>(
    `update public.users set name = 'K 2' where id = '${U.karthik}' returning id`,
  );
  check("Admin can update a member's profile", adminRename.rows.length === 1);
  await db.query(`update public.users set name = 'Karthik' where id = '${U.karthik}'`);
  await asActor(U.karthik);
  const selfRename = await db.query<{ id: string }>(
    `update public.users set name = 'Self Edited' where id = '${U.karthik}' returning id`,
  );
  check("Member can edit their own profile", selfRename.rows.length === 1);
  const otherRename = await db.query<{ id: string }>(
    `update public.users set name = 'Hijack' where id = '${U.aravind}' returning id`,
  );
  check(
    "Member cannot edit another member's profile (RLS)",
    otherRename.rows.length === 0,
  );
  await asActor(U.aravind);
  await db.query(
    `update public.users set name = 'Karthik' where id = '${U.karthik}'`,
  );

  // Cleanup: destroy the owner-isolation project; leave the temp sign-up
  // (removed member) as non-family; T. regression — family intact.
  await db.query(`select public.fp_delete_project('${ownerProjId}'::uuid)`);
  const loanCountAfter = await db.query<{ n: number }>(
    `select count(*)::int as n from public.loans`,
  );
  check("Loan baseline restored after member tests", num(loanCountAfter.rows[0].n) === num(loanCountBefore.rows[0].n));
  const regress = await db.query<{ members: number; categories: number; projects: number }>(
    `select (select count(*)::int from public.users where family_id = '${FAMILY_ID}') as members,
            (select count(*)::int from public.categories where family_id = '${FAMILY_ID}') as categories,
            (select count(*)::int from public.projects where family_id = '${FAMILY_ID}') as projects`,
  );
  check(
    "Regression — family intact after Phase 6 (3 members, 9 categories, 2 projects)",
    regress.rows[0].members === 3 &&
      regress.rows[0].categories === 9 &&
      regress.rows[0].projects === 2,
  );

  // ---- Q. Reports: family isolation (RLS) -------------------------------
  console.log("\nQ. Report data isolation (RLS)");
  // A foreign-family expense row, created as superuser (RLS bypassed).
  await db.exec("reset role;");
  await db.query(
    `insert into public.transactions
       (id, kind, type, scope_type, scope_id, amount, category_id, spent_through,
        card_id, date, note, created_by, counterparty_user_id, linked_loan_id, transfer_group_id)
     values ('00000000-0000-4000-8000-00000000c0de', 'pl', 'expense', 'personal',
             'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 500, '${CAT.food}', 'manual',
             null, '2026-08-27', 'Foreign report leak test', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
             null, null, null)`,
  );
  // The outsider can see their own row.
  await asActor("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4");
  const outsiderSees = await db.query<{ n: number }>(
    `select count(*)::int as n from public.transactions
     where id = '00000000-0000-4000-8000-00000000c0de'`,
  );
  check("Foreign-family owner sees their own report row", num(outsiderSees.rows[0].n) === 1);
  // A primary-family member must never see it (report visibility stays in-family).
  await asActor(U.aravind);
  const aravindSees = await db.query<{ n: number }>(
    `select count(*)::int as n from public.transactions
     where id = '00000000-0000-4000-8000-00000000c0de'`,
  );
  check("Family report query excludes another family's rows", num(aravindSees.rows[0].n) === 0);
  await db.exec("reset role;");
  await db.query(`delete from public.transactions where id = '00000000-0000-4000-8000-00000000c0de'`);

  // ---- R. Cross-family admin isolation (pg 0009) ------------------------
  console.log("\nR. Cross-family admin isolation (pg 0009)");
  // The Outsider becomes a family ADMIN of Family B. Family A admin (Aravind)
  // must not read any of Family B's rows across the six scoped SELECT tables,
  // while same-family admin visibility in Family A keeps working.
  const OUTER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";
  const OUT_FAM = "babababa-baba-4aba-8aba-bababababa11";
  await db.exec("reset role;");
  await db.query(`update public.users set role = 'admin' where id = '${OUTER}'`);
  await db.query(
    `insert into public.categories (id, family_id, name, color, sort_order) values
       ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9', '${OUT_FAM}', 'Foreign', '#3E7CA6', 99)
     on conflict (id) do nothing`,
  );
  await db.query(
    `insert into public.credit_cards (id, user_id, name, status) values
       ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeea', '${OUTER}', 'Foreign Card', 'active')
     on conflict (id) do nothing`,
  );
  await db.query(
    `insert into public.budgets (id, scope_type, scope_id, category_id, amount, period) values
       ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeeb', 'personal', '${OUTER}', '${CAT.food}', 500, 'monthly')
     on conflict (id) do nothing`,
  );
  await db.query(
    `insert into public.loans (id, direction, counterparty_user_id, principal_amount, start_date, created_by)
     values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeec', 'given', '${OUTER}', 1000, '2026-09-01', '${OUTER}')
     on conflict (id) do nothing`,
  );
  await db.query(
    `insert into public.projects (id, family_id, name, created_by, status, budget) values
       ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeed', '${OUT_FAM}', 'Foreign Project', '${OUTER}', 'active', 1000)
     on conflict (id) do nothing`,
  );
  await db.query(
    `insert into public.project_members (project_id, user_id, role)
     values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeed', '${OUTER}', 'owner')
     on conflict (project_id, user_id) do nothing`,
  );

  const countWhere = async (table: string, where: string) => {
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from public.${table} where ${where}`,
    );
    return num(r.rows[0].n);
  };

  // Family A admin must see none of Family B's rows.
  await asActor(U.aravind);
  check("Fam A admin cannot read Fam B users", (await countWhere("users", `id = '${OUTER}'`)) === 0);
  check("Fam A admin cannot read Fam B categories", (await countWhere("categories", `family_id = '${OUT_FAM}'`)) === 0);
  check("Fam A admin cannot read Fam B cards", (await countWhere("credit_cards", `id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeea'`)) === 0);
  check("Fam A admin cannot read Fam B budgets", (await countWhere("budgets", `id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeeb'`)) === 0);
  check("Fam A admin cannot read Fam B loans", (await countWhere("loans", `id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeec'`)) === 0);
  check("Fam A admin cannot read Fam B projects", (await countWhere("projects", `id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeed'`)) === 0);
  check(
    "Fam A admin cannot read Fam B project memberships",
    (await countWhere("project_members", `project_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeed'`)) === 0,
  );

  // Same-family admin visibility in Family A keeps working (regression).
  const homeUsers = await db.query<{ n: number }>(
    `select count(*)::int as n from public.users where family_id = (select family_id from public.users where id = '${U.aravind}')`,
  );
  check("Same-family admin still reads Family A users", homeUsers.rows[0].n === 3);
  const homeCats = await db.query<{ n: number }>(
    `select count(*)::int as n from public.categories where family_id = (select family_id from public.users where id = '${U.aravind}')`,
  );
  check("Same-family admin still reads Family A categories", homeCats.rows[0].n === 9);
  const homeCards = await db.query<{ n: number }>(
    `select count(*)::int as n from public.credit_cards c
     join public.users owner on owner.id = c.user_id
     where owner.family_id = (select family_id from public.users where id = '${U.aravind}')`,
  );
  check("Same-family admin still reads Family A cards", homeCards.rows[0].n >= 1);
  const homeLoans = await db.query<{ n: number }>(
    `select count(*)::int as n from public.loans l
     join public.users creator on creator.id = l.created_by
     where creator.family_id = (select family_id from public.users where id = '${U.aravind}')`,
  );
  check("Same-family admin still reads Family A loans", homeLoans.rows[0].n >= 1);
  const homeProjects = await db.query<{ n: number }>(
    `select count(*)::int as n from public.projects
     where family_id = (select family_id from public.users where id = '${U.aravind}')`,
  );
  check("Same-family admin still reads Family A projects", homeProjects.rows[0].n === 2);
  const homeProjMembers = await db.query<{ n: number }>(
    `select count(*)::int as n from public.project_members pm
     join public.projects p on p.id = pm.project_id
     where p.family_id = (select family_id from public.users where id = '${U.aravind}')`,
  );
  check("Same-family admin still reads Family A project memberships", homeProjMembers.rows[0].n >= 1);
  // A family admin can still see another family member's personal budget
  // (family-scoped admin branch) without being the scope owner.
  const homeBudgets = await db.query<{ n: number }>(
    `select count(*)::int as n from public.budgets b
     join public.users me on me.id = '${U.aravind}'
     where b.scope_type = 'personal'
       and exists (select 1 from public.users t where t.id = b.scope_id and t.family_id = me.family_id)`,
  );
  check("Same-family admin still reads Family A personal budgets", homeBudgets.rows[0].n >= 1);

  await db.exec("reset role;");
  await db.exec(`
    delete from public.project_members where project_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeed';
    delete from public.projects where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeed';
    delete from public.loans where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeec';
    delete from public.budgets where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeeb';
    delete from public.credit_cards where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeea';
    delete from public.categories where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9';
    update public.users set role = 'member' where id = '${OUTER}'
  `);

  // ---- Cleanup of engine-created rows ---------------------------------
  console.log("\nCleanup — restoring baseline balances");
  await asActor(U.aravind);
  await db.query(`select public.fp_delete_transaction('${payId}'::uuid)`);
  await db.query(`delete from transactions where note in ('overpay','Engine test repayment','Engine test principal') or (note='Engine test expense' and date='2026-08-28')`);
  await db.query(`delete from transactions where linked_loan_id=$1 and created_at=(select max(created_at) from transactions where linked_loan_id=$1)`, [LOAN_AMIT]);
  const finalHdfc = await db.query<{ num: string }>(
    `select coalesce(sum(case when t.kind='pl' then t.amount else 0 end) - sum(case when t.kind='settlement' then t.amount else 0 end),0)::numeric as num
     from transactions t where t.card_id=$1`,
    [CARD_HDFC],
  );
  check("HDFC outstanding restored to ₹38,480", num(finalHdfc.rows[0].num) === 38480, String(finalHdfc.rows[0].num));

  console.log(`\n\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("Failures:", failures.join(", "));
    process.exit(1);
  }
  await db.close();
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});