#!/usr/bin/env tsx
/**
 * Phase 2 — Live transaction-engine smoke tests against a REAL Supabase
 * project (migrations must already be applied: 0001 + 0002 + 0003).
 *
 * Covers A–L from the validation contract: P&L create rules, interest
 * category gating, settlement authorization (Issue 5), paired family
 * transfers, external loan principal, loan repayment + repayment_total sync,
 * update/delete authorization, RLS visibility, and P&L totals being
 * unaffected by settlements. Each check verifies BOTH the RPC behaviour and
 * the resulting DB rows/balances. It cleans up after itself.
 *
 * Usage:
 *   cp .env.example .env.local        # fill in a REAL project URL + anon + service role
 *   npm run db:migrate                # apply 0001–0003
 *   npm run db:seed-demo              # create the demo sign-in accounts
 *   npm run db:smoke-phase2           # this script
 *
 * This script only reports; it never mutates the frozen seed baseline for
 * long — every created transaction is deleted at the end.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRole) {
  console.error(
    "Missing env. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "FamilyPurse#2026";

const U = {
  aravind: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  revathi: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  karthik: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
};
const CARD_HDFC = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const LOAN_AMIT = "ffffffff-ffff-4fff-8fff-fffffffffff1";
const LOAN_RAVI = "ffffffff-ffff-4fff-8fff-fffffffffff2";
const CAT = {
  food: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
  groceries: "cccccccc-cccc-4ccc-8ccc-ccccccccccc4",
  interestPaid: "cccccccc-cccc-4ccc-8ccc-ccccccccccc7",
  interestReceived: "cccccccc-cccc-4ccc-8ccc-ccccccccccc8",
};

const service = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

async function asUser(
  email: string,
): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: DEMO_PASSWORD,
  });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  client.auth.setSession(data.session);
  return client;
}

const num = (v: unknown): number => Number((v as { num?: number | string } | null)?.num ?? v);

async function main() {
  console.log("Phase 2 live smoke tests against", url);

  const probe = await service.from("users").select("id").limit(1).maybeSingle();
  if (probe.error || !probe.data) {
    console.error(
      "users table is empty/missing — run migrations (0001–0003) then `npm run db:seed-demo` first.",
    );
    process.exit(1);
  }

  const aravind = await asUser("aravind@example.com");
  const karthik = await asUser("karthik@example.com");
  const createdAtIds: string[] = [];

  const create = async (supabase: SupabaseClient, payload: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc("fp_create_transaction", {
      p_payload: payload,
    });
    if (error) throw new Error(`fp_create_transaction: ${error.message}`);
    return data as { id: string; mirror_id?: string; transfer_group_id?: string };
  };

  const cleanup = async (ids: string[]) => {
    // Delete via the engine (as admin), which also removes transfer pairs.
    for (const id of ids) {
      await aravind.rpc("fp_delete_transaction", { p_transaction_id: id });
    }
  };

  // ------------------------------------------------------------------
  console.log("\nA. Seed baselines (frozen canonical data)");
  const { data: hdfc } = await service
    .from("transactions")
    .select("kind, type, card_id, amount")
    .eq("card_id", CARD_HDFC);
  const outstanding = (rows: { kind: string; type: string; amount: number }[]) =>
    Math.round(
      rows
        .filter((r) => r.kind === "pl").reduce((s, r) => s + r.amount, 0) -
        rows
          .filter((r) => r.kind === "settlement" && r.type === "card_payment")
          .reduce((s, r) => s + r.amount, 0),
    );
  check("HDFC outstanding = ₹38,480", outstanding(hdfc ?? []) === 38480);

  const { data: amit } = await service
    .from("loans")
    .select("principal_amount, repayment_total")
    .eq("id", LOAN_AMIT)
    .single();
  check(
    "Amit loan balance = ₹15,000",
    amit ? num({ num: amit.principal_amount }) - num({ num: amit.repayment_total }) === 15000 : false,
  );

  // ------------------------------------------------------------------
  console.log("\nB. Engine create — P&L");
  const { data: revathi } = await service.from("users").select("id").eq("id", U.revathi).single();
  const wrongScope = await aravind.rpc("fp_create_transaction", {
    p_payload: {
      kind: "pl",
      type: "expense",
      scope_type: "personal",
      scope_id: revathi?.id,
      amount: 100,
      category_id: CAT.food,
      spent_through: "manual",
      date: "2026-08-28",
    },
  });
  check(
    "Cannot create personal P&L on someone else's ledger",
    !!wrongScope.error && wrongScope.error.message.includes("only record your own personal transactions"),
    wrongScope.error?.message,
  );

  const noCat = await aravind.rpc("fp_create_transaction", {
    p_payload: {
      kind: "pl",
      type: "expense",
      scope_type: "personal",
      amount: 100,
      spent_through: "manual",
      date: "2026-08-28",
    },
  });
  check(
    "Expense without category rejected",
    !!noCat.error && noCat.error.message.includes("require a category"),
    noCat.error?.message,
  );

  const exp = await create(aravind, {
    kind: "pl",
    type: "expense",
    scope_type: "personal",
    amount: 1234.5,
    category_id: CAT.food,
    spent_through: "credit_card",
    card_id: CARD_HDFC,
    date: "2026-08-28",
    note: "Smoke test expense",
  });
  createdAtIds.push(exp.id);
  check("Expense created", !!exp.id);

  // ------------------------------------------------------------------
  console.log("\nC. Engine create — interest");
  const goodInterest = await create(aravind, {
    kind: "pl",
    type: "interest_expense",
    scope_type: "personal",
    amount: 120,
    category_id: CAT.interestPaid,
    spent_through: "credit_card",
    card_id: CARD_HDFC,
    date: "2026-08-28",
    note: "Smoke test card interest",
  });
  createdAtIds.push(goodInterest.id);
  check("interest_expense with Interest Paid category accepted", !!goodInterest.id);

  const badInterest = await aravind.rpc("fp_create_transaction", {
    p_payload: {
      kind: "pl",
      type: "interest_expense",
      scope_type: "personal",
      amount: 120,
      category_id: CAT.food,
      spent_through: "manual",
      date: "2026-08-28",
    },
  });
  check(
    "interest_expense with a non-system category rejected",
    !!badInterest.error && badInterest.error.message.includes("Interest Paid"),
    badInterest.error?.message,
  );

  // ------------------------------------------------------------------
  console.log("\nD. Settlements — authorization (Issue 5)");
  const memberPay = await karthik.rpc("fp_create_transaction", {
    p_payload: {
      kind: "settlement",
      type: "card_payment",
      scope_type: "personal",
      amount: 1000,
      card_id: CARD_HDFC,
      date: "2026-08-28",
      note: "should be rejected",
    },
  });
  check(
    "Member cannot create a card payment",
    !!memberPay.error && /admin/i.test(memberPay.error.message),
    memberPay.error?.message,
  );

  const pay = await create(aravind, {
    kind: "settlement",
    type: "card_payment",
    scope_type: "personal",
    amount: 1000,
    card_id: CARD_HDFC,
    date: "2026-08-28",
    note: "Smoke test payment",
  });
  createdAtIds.push(pay.id);
  const { data: afterPay } = await service
    .from("transactions")
    .select("kind, type, card_id, amount")
    .eq("card_id", CARD_HDFC);
  check("Card outstanding reduced by ₹1,000", outstanding(afterPay ?? []) === 37480, outstanding(afterPay ?? []));
  check("Admin card payment created", !!pay.id);

  // ------------------------------------------------------------------
  console.log("\nE. Family transfer pairs");
  const tf = await create(aravind, {
    kind: "settlement",
    type: "transfer",
    scope_type: "personal",
    amount: 2500,
    counterparty_user_id: U.karthik,
    date: "2026-08-28",
    note: "Smoke test transfer",
  });
  const m = tf as { id: string; mirror_id: string; transfer_group_id: string };
  createdAtIds.push(m.id, m.mirror_id);
  const { data: pair } = await service
    .from("transactions")
    .select("scope_id, counterparty_user_id, note")
    .eq("transfer_group_id", m.transfer_group_id!);
  check("Two rows share transfer_group_id", (pair ?? []).length === 2);
  check(
    "Mirror sits on recipient's ledger with originator as counterparty",
    (pair ?? []).some((r) => r.scope_id === U.karthik && r.counterparty_user_id === U.aravind),
  );
  check(
    "Mirror note marked",
    (pair ?? []).some((r) => r.note === "Smoke test transfer (mirror)"),
  );

  const selfTransfer = await aravind.rpc("fp_create_transaction", {
    p_payload: {
      kind: "settlement",
      type: "transfer",
      scope_type: "personal",
      amount: 100,
      counterparty_user_id: U.aravind,
      date: "2026-08-28",
    },
  });
  check(
    "Cannot transfer to yourself",
    !!selfTransfer.error,
    selfTransfer.error?.message,
  );

  // ------------------------------------------------------------------
  console.log("\nF. External transfer / loan principal");
  const ext = await create(aravind, {
    kind: "settlement",
    type: "transfer",
    scope_type: "personal",
    amount: 3000,
    linked_loan_id: LOAN_AMIT,
    date: "2026-08-28",
    note: "Smoke test principal",
  });
  const xm = ext as { id: string; transfer_group_id: string };
  createdAtIds.push(xm.id);
  const { data: extRows } = await service
    .from("transactions")
    .select("id")
    .eq("transfer_group_id", xm.transfer_group_id!);
  check("Exactly one row for external principal", (extRows ?? []).length === 1);

  const extNoLoan = await aravind.rpc("fp_create_transaction", {
    p_payload: {
      kind: "settlement",
      type: "transfer",
      scope_type: "personal",
      amount: 100,
      date: "2026-08-28",
      note: "bad external",
    },
  });
  check(
    "External transfer without a linked loan rejected",
    !!extNoLoan.error && extNoLoan.error.message.includes("linked loan"),
    extNoLoan.error?.message,
  );

  // ------------------------------------------------------------------
  console.log("\nG. Loan repayment");
  const rep = await create(aravind, {
    kind: "settlement",
    type: "loan_repayment",
    scope_type: "personal",
    amount: 2000,
    linked_loan_id: LOAN_AMIT,
    date: "2026-08-28",
    note: "Smoke test repayment",
  });
  createdAtIds.push(rep.id);
  const { data: amitAfter } = await service
    .from("loans")
    .select("principal_amount, repayment_total")
    .eq("id", LOAN_AMIT)
    .single();
  check(
    "Amit balance = ₹13,000 (principal − repaid)",
    amitAfter
      ? num({ num: amitAfter.principal_amount }) - num({ num: amitAfter.repayment_total }) === 13000
      : false,
  );

  const memberEdit = await karthik.rpc("fp_update_transaction", {
    p_transaction_id: rep.id,
    p_payload: { note: "hijack" },
  });
  check(
    "Member cannot edit a settlement",
    !!memberEdit.error && /admin/i.test(memberEdit.error.message),
    memberEdit.error?.message,
  );

  // ------------------------------------------------------------------
  console.log("\nH. Engine update");
  const karthikEdit = await karthik.rpc("fp_update_transaction", {
    p_transaction_id: exp.id,
    p_payload: { note: "hijack" },
  });
  check(
    "Member cannot edit another member's P&L row",
    !!karthikEdit.error,
    karthikEdit.error?.message,
  );

  const ownEdit = await aravind.rpc("fp_update_transaction", {
    p_transaction_id: exp.id,
    p_payload: { amount: 999, note: "Edited expense" },
  });
  check("Owner-edited P&L amount/note persisted", !ownEdit.error, ownEdit.error?.message);
  const { data: expRow } = await service
    .from("transactions")
    .select("amount, note")
    .eq("id", exp.id)
    .single();
  check(
    "Edit written to DB",
    !!(expRow && num({ num: expRow.amount }) === 999 && expRow.note === "Edited expense"),
  );

  await aravind.rpc("fp_update_transaction", {
    p_transaction_id: m.id,
    p_payload: { amount: 3000, note: "Updated transfer" },
  });
  const { data: mirror } = await service
    .from("transactions")
    .select("amount, note")
    .eq("id", m.mirror_id)
    .single();
  check(
    "Paired transfer mirror updated atomically",
    !!(mirror && num({ num: mirror.amount }) === 3000 && mirror.note === "Updated transfer (mirror)"),
  );

  // ------------------------------------------------------------------
  console.log("\nI. Batch write (nudge overpay → payment + interest)");
  const { error: batchErr } = await aravind.rpc("fp_create_transaction", {
    p_payload: [
      {
        kind: "settlement",
        type: "card_payment",
        scope_type: "personal",
        amount: 500,
        card_id: CARD_HDFC,
        date: "2026-08-28",
        note: "smoke overpay",
      },
      {
        kind: "pl",
        type: "interest_expense",
        scope_type: "personal",
        amount: 50,
        category_id: CAT.interestPaid,
        spent_through: "credit_card",
        card_id: CARD_HDFC,
        date: "2026-08-28",
        note: "smoke overpay",
      },
    ],
  });
  check("Batch (payment + interest) committed", !batchErr, batchErr?.message);
  const { data: both } = await service
    .from("transactions")
    .select("id")
    .eq("note", "smoke overpay");
  check("Both batch rows landed", (both ?? []).length === 2, both?.length);
  for (const r of both ?? []) createdAtIds.push(r.id);

  // ------------------------------------------------------------------
  console.log("\nJ. Engine delete");
  const wrongDel = await karthik.rpc("fp_delete_transaction", { p_transaction_id: exp.id });
  check(
    "Member cannot delete another member's P&L row",
    !!wrongDel.error && wrongDel.error.message.includes("only delete"),
    wrongDel.error?.message,
  );

  const delPair = await aravind.rpc("fp_delete_transaction", { p_transaction_id: m.id });
  check("Deleting a transfer removes BOTH rows", !delPair.error, delPair.error?.message);
  createdAtIds.splice(createdAtIds.indexOf(m.id), 1);
  createdAtIds.splice(createdAtIds.indexOf(m.mirror_id), 1);
  const { data: pairAfterDel } = await service
    .from("transactions")
    .select("id")
    .eq("transfer_group_id", m.transfer_group_id!);
  check("Transfer pair rows are gone", (pairAfterDel ?? []).length === 0);
  const { data: loanUnchanged } = await service
    .from("loans")
    .select("repayment_total")
    .eq("id", LOAN_AMIT)
    .single();
  check(
    "Loan repayment_total rewound after deleting the repayment",
    loanUnchanged ? num({ num: loanUnchanged.repayment_total }) === 5000 : false,
    loanUnchanged?.repayment_total,
  );

  // ------------------------------------------------------------------
  console.log("\nK. RLS read visibility");
  const { data: asMember } = await karthik.from("transactions").select("id");
  check("Member sees family transactions (full visibility)", (asMember ?? []).length >= 24, asMember?.length);
  const { data: profiles } = await karthik.from("users").select("id").eq("id", U.revathi);
  check("Member reads family members' profiles", (profiles ?? []).length === 1);

  // ------------------------------------------------------------------
  console.log("\nL. P&L totals unaffected by settlements");
  const { data: plBefore } = await service
    .from("transactions")
    .select("amount")
    .eq("kind", "pl")
    .eq("type", "expense");
  const plSumBefore = (plBefore ?? []).reduce((s, r) => s + num(r.amount), 0);

  await create(aravind, {
    kind: "settlement",
    type: "loan_repayment",
    scope_type: "personal",
    amount: 1500,
    linked_loan_id: LOAN_RAVI,
    date: "2026-08-28",
    note: "smoke totals",
  });
  const fresh = await create(aravind, {
    kind: "pl",
    type: "expense",
    scope_type: "personal",
    amount: 777,
    category_id: CAT.groceries,
    spent_through: "manual",
    date: "2026-08-28",
    note: "smoke totals",
  });
  createdAtIds.push(fresh.id);

  const { data: plAfter } = await service
    .from("transactions")
    .select("amount")
    .eq("kind", "pl")
    .eq("type", "expense");
  const plSumAfter = (plAfter ?? []).reduce((s, r) => s + num(r.amount), 0);
  check(
    "Settlement did not move P&L sum; new expense added exactly ₹777",
    plSumAfter - plSumBefore === 777,
    { plSumBefore, plSumAfter },
  );

  // ------------------------------------------------------------------
  console.log("\nCleanup — removing created transactions");
  await cleanup(createdAtIds);
  const { data: leftovers } = await service
    .from("transactions")
    .select("id")
    .in("note", ["Smoke test expense", "smoke overpay", "smoke totals", "Smoke test payment", "Smoke test transfer", "Smoke test principal", "Smoke test repayment", "Smoke test card interest"]);
  check(
    "All smoke-test rows removed",
    (leftovers ?? []).length === 0,
    leftovers?.length,
  );

  // ------------------------------------------------------------------
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.error("\nFailures:\n" + failures.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});