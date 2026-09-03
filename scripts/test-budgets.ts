/**
 * Budget live checks (pg 0012).
 *
 * Exercises the budget RPCs end-to-end against a real Supabase project,
 * using the canonical demo users (aravind admin / revathi + karthik members).
 *
 * Covers:
 *   Create Monthly Budget
 *   Duplicate Monthly Budget rejected
 *   Create Project Budget
 *   Wrong-family project rejected
 *   Invalid date range rejected
 *   Category allocation creation
 *   Duplicate category allocation rejected
 *   Unallocated amount calculation
 *   Over-allocation behaviour
 *   Budget usage calculation
 *   Project budget usage
 *   Family isolation / RLS
 *   Edit budget
 *   Deactivate budget
 *   Reactivate budget
 *   Inactive budget retained for history
 *
 * Run with: npm run db:test-budgets
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LegacyBudget, BudgetListItem } from "@/lib/types";

config({ path: ".env.local" });

const SRV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SRV_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DEMO_PASSWORD = "FamilyPurse#2026";

const GOA = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const ARAVIND = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const REVATHI = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const KARTHIK = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const CAT_FOOD = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const CAT_TRAVEL = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";

const service = createClient(SRV_URL, SERVICE_KEY);

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(ok: boolean, name: string, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

async function asUser(email: string): Promise<SupabaseClient> {
  const client = createClient(SRV_URL, SRV_ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: DEMO_PASSWORD,
  });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  client.auth.setSession(data.session);
  return client;
}

async function main() {
  console.log("Budget live checks against", SRV_URL);

  const probe = await service.from("users").select("id").limit(1).maybeSingle();
  if (probe.error || !probe.data) {
    console.error("users table empty/missing — run migrations + `npm run db:seed-demo` first.");
    process.exit(1);
  }

  const aravind = await asUser("aravind@example.com");

  // -------------------------------------------------------
  // 0. Clean up any existing budgets for a clean slate
  // -------------------------------------------------------
  console.log("\n[0] Clean up existing budgets");
  {
    const { data } = await aravind.rpc("fp_list_budgets", { p_active_only: false });
    for (const b of (data ?? [])) {
      await aravind.rpc("fp_set_budget_active", { p_budget_id: b.id, p_active: false });
    }
    console.log("  Cleared existing budgets");
  }

  // -------------------------------------------------------
  // 1. Create Monthly Budget
  // -------------------------------------------------------
  console.log("\n[1] Create Monthly Budget");
  {
    const start = "2026-09-01";
    const end = "2026-09-30";
    const { data: id, error } = await aravind.rpc("fp_create_budget", {
      p_name: "September 2026",
      p_type: "monthly",
      p_total_amount: 45000,
      p_start_date: start,
      p_end_date: end,
    });
    check(error === null, "monthly budget created", error?.message);
    check(typeof id === "string", "returns budget id", id);
  }

  // -------------------------------------------------------
  // 2. Duplicate Monthly Budget rejected
  // -------------------------------------------------------
  console.log("\n[2] Duplicate Monthly Budget rejected");
  {
    const start = "2026-09-01";
    const end = "2026-09-30";
    const { error } = await aravind.rpc("fp_create_budget", {
      p_name: "September 2026 Again",
      p_type: "monthly",
      p_total_amount: 50000,
      p_start_date: start,
      p_end_date: end,
    });
    check(error !== null, "duplicate monthly budget rejected", error?.message);
  }

  // -------------------------------------------------------
  // 3. Create Project Budget
  // -------------------------------------------------------
  console.log("\n[3] Create Project Budget");
  {
    const { data: id, error } = await aravind.rpc("fp_create_budget", {
      p_name: "Goa Trip Budget",
      p_type: "project",
      p_total_amount: 75000,
      p_start_date: "2026-09-01",
      p_end_date: "2026-09-15",
      p_project_id: GOA,
    });
    check(error === null, "project budget created", error?.message);
    check(typeof id === "string", "returns budget id", id);
  }

  // -------------------------------------------------------
  // 4. Wrong-family project rejected
  // -------------------------------------------------------
  console.log("\n[4] Wrong-family project rejected");
  {
    // Create a foreign user and their project
    const extEmail = `foreign-${Date.now()}@example.com`;
    const extRes = await service.auth.admin.createUser({
      email: extEmail,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    const extUserId = extRes.data?.user?.id;
    let foreignProjectId: string | null = null;
    if (extUserId) {
      const foreign = await asUser(extEmail);
      const famRes = await foreign.rpc("create_family", { family_name: "Foreign Family (test)" });
      const famId = typeof famRes.data === "string" ? famRes.data : famRes.data?.id;
      if (famId) {
        const projRes = await foreign.rpc("fp_create_project", {
          p_name: "Foreign Project",
          p_total_budget: 10000,
          p_start_date: "2026-09-01",
          p_end_date: "2026-09-10",
        });
        foreignProjectId = projRes.data as string | null;
        // Try to create budget with foreign project from aravind's session
        if (foreignProjectId) {
          const { error } = await aravind.rpc("fp_create_budget", {
            p_name: "Hack Attempt",
            p_type: "project",
            p_total_amount: 10000,
            p_start_date: "2026-09-01",
            p_end_date: "2026-09-10",
            p_project_id: foreignProjectId,
          });
          check(error !== null, "foreign project rejected", error?.message);
        }
      }
      if (foreignProjectId) await service.from("projects").delete().eq("id", foreignProjectId);
      if (famId) await service.from("families").delete().eq("id", famId);
      await service.auth.admin.deleteUser(extUserId);
    }
  }

  // -------------------------------------------------------
  // 5. Invalid date range rejected
  // -------------------------------------------------------
  console.log("\n[5] Invalid date range rejected");
  {
    const { error } = await aravind.rpc("fp_create_budget", {
      p_name: "Bad Dates",
      p_type: "project",
      p_total_amount: 10000,
      p_start_date: "2026-09-15",
      p_end_date: "2026-09-01",
      p_project_id: GOA,
    });
    check(error !== null, "end before start rejected", error?.message);
  }

  // -------------------------------------------------------
  // 6. Category allocation creation
  // -------------------------------------------------------
  console.log("\n[6] Category allocation creation");
  {
    // Get a project budget id
    const { data: budgets } = await aravind.rpc("fp_list_budgets", { p_active_only: true });
    const projBudget = (budgets as BudgetListItem[]).find((b) => b.type === "project");
    check(!!projBudget, "found project budget");
    if (projBudget) {
      const { data: allocId, error } = await aravind.rpc("fp_add_budget_allocation", {
        p_budget_id: projBudget.id,
        p_category_id: CAT_TRAVEL,
        p_amount: 30000,
      });
      check(error === null, "allocation created", error?.message);
      check(typeof allocId === "string", "returns allocation id", allocId);
    }
  }

  // -------------------------------------------------------
  // 7. Duplicate category allocation rejected
  // -------------------------------------------------------
  console.log("\n[7] Duplicate category allocation rejected");
  {
    const { data: budgets } = await aravind.rpc("fp_list_budgets", { p_active_only: true });
    const projBudget = (budgets as BudgetListItem[]).find((b) => b.type === "project");
    if (projBudget) {
      const { error } = await aravind.rpc("fp_add_budget_allocation", {
        p_budget_id: projBudget.id,
        p_category_id: CAT_TRAVEL,
        p_amount: 20000,
      });
      check(error !== null, "duplicate allocation rejected", error?.message);
    }
  }

  // -------------------------------------------------------
  // 8. Unallocated amount calculation
  // -------------------------------------------------------
  console.log("\n[8] Unallocated amount calculation");
  {
    const { data: budgets } = await aravind.rpc("fp_list_budgets", { p_active_only: true });
    const projBudget = (budgets as BudgetListItem[]).find((b) => b.type === "project");
    if (projBudget) {
      const allocated = projBudget.total_allocated ?? 0;
      const unallocated = projBudget.total_amount - allocated;
      check(unallocated === 45000, "unallocated = 45000", `got ${unallocated}`);
    }
  }

  // -------------------------------------------------------
  // 9. Over-allocation behaviour
  // -------------------------------------------------------
  console.log("\n[9] Over-allocation behaviour");
  {
    const { data: budgets } = await aravind.rpc("fp_list_budgets", { p_active_only: true });
    const monthlyBudget = (budgets as BudgetListItem[]).find((b) => b.type === "monthly");
    if (monthlyBudget) {
      // Try to allocate more than total
      const { error } = await aravind.rpc("fp_add_budget_allocation", {
        p_budget_id: monthlyBudget.id,
        p_category_id: CAT_FOOD,
        p_amount: 50000, // exceeds 45000 total
      });
      check(error === null, "over-allocation allowed", error?.message);
      // Verify total_allocated > total_amount
      const { data: budgets2 } = await aravind.rpc("fp_list_budgets", { p_active_only: true });
      const mb2 = (budgets2 as BudgetListItem[]).find((b) => b.id === monthlyBudget.id);
      check(!!mb2, "budget found after update");
      check((mb2!.total_allocated ?? 0) > mb2!.total_amount, "total_allocated > total_amount");
    }
  }

  // -------------------------------------------------------
  // 10. Budget usage calculation (monthly)
  // -------------------------------------------------------
  console.log("\n[10] Budget usage calculation (monthly)");
  {
    const { data: budgets } = await aravind.rpc("fp_list_budgets", { p_active_only: true });
    const monthlyBudget = (budgets as BudgetListItem[]).find((b) => b.type === "monthly");
    if (monthlyBudget) {
      const { data: detail, error } = await aravind.rpc("fp_get_budget_detail", { p_budget_id: monthlyBudget.id });
      if (error) throw new Error(error.message);
      check(typeof detail.total_spent === "number", "total_spent is number", detail.total_spent);
      check(detail.total_spent >= 0, "total_spent non-negative");
      check(Array.isArray(detail.allocations), "allocations is array");
    }
  }

  // -------------------------------------------------------
  // 11. Project budget usage
  // -------------------------------------------------------
  console.log("\n[11] Project budget usage");
  {
    const { data: budgets } = await aravind.rpc("fp_list_budgets", { p_active_only: true });
    const projBudget = (budgets as BudgetListItem[]).find((b) => b.type === "project");
    if (projBudget) {
      const { data: detail, error } = await aravind.rpc("fp_get_budget_detail", { p_budget_id: projBudget.id });
      if (error) throw new Error(error.message);
      check(typeof detail.total_spent === "number", "project total_spent is number", detail.total_spent);
      check(detail.total_spent >= 0, "project total_spent non-negative");
    }
  }

  // -------------------------------------------------------
  // 12. Family isolation / RLS
  // -------------------------------------------------------
  console.log("\n[12] Family isolation / RLS");
  {
    // Create foreign user
    const extEmail = `foreign2-${Date.now()}@example.com`;
    const extRes = await service.auth.admin.createUser({
      email: extEmail,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    const extUserId = extRes.data?.user?.id;
    if (extUserId) {
      const foreign = await asUser(extEmail);
      // Foreign user cannot see our budgets
      const { data: foreignBudgets } = await foreign.rpc("fp_list_budgets", { p_active_only: true });
      check((foreignBudgets?.length ?? 0) === 0, "foreign user sees no budgets");

      // Foreign user cannot create budget
      const { error: createErr } = await foreign.rpc("fp_create_budget", {
        p_name: "Hack",
        p_type: "monthly",
        p_total_amount: 1000,
        p_start_date: "2026-10-01",
        p_end_date: "2026-10-31",
      });
      check(createErr !== null, "foreign user cannot create budget", createErr?.message);

      // Cleanup
      await service.auth.admin.deleteUser(extUserId);
    }
  }

  // -------------------------------------------------------
  // 13. Edit budget
  // -------------------------------------------------------
  console.log("\n[13] Edit budget");
  {
    const { data: budgets } = await aravind.rpc("fp_list_budgets", { p_active_only: true });
    const monthlyBudget = (budgets as BudgetListItem[]).find((b) => b.type === "monthly");
    if (monthlyBudget) {
      const { error } = await aravind.rpc("fp_update_budget", {
        p_budget_id: monthlyBudget.id,
        p_name: "September 2026 Updated",
        p_total_amount: 50000,
      });
      check(error === null, "budget updated", error?.message);

      // Verify update
      const { data: budgets2 } = await aravind.rpc("fp_list_budgets", { p_active_only: true });
      const updated = (budgets2 as BudgetListItem[]).find((b) => b.id === monthlyBudget.id);
      check(updated?.name === "September 2026 Updated", "name updated");
      check(updated?.total_amount === 50000, "total_amount updated");
    }
  }

  // -------------------------------------------------------
  // 14. Deactivate budget
  // -------------------------------------------------------
  console.log("\n[14] Deactivate budget");
  {
    const { data: budgets } = await aravind.rpc("fp_list_budgets", { p_active_only: true });
    const monthlyBudget = (budgets as BudgetListItem[]).find((b) => b.type === "monthly");
    if (monthlyBudget) {
      const { error } = await aravind.rpc("fp_set_budget_active", {
        p_budget_id: monthlyBudget.id,
        p_active: false,
      });
      check(error === null, "budget deactivated", error?.message);

      // Verify not in active list
      const { data: activeBudgets } = await aravind.rpc("fp_list_budgets", { p_active_only: true });
      check(!(activeBudgets as BudgetListItem[]).some((b) => b.id === monthlyBudget.id), "not in active list");

      // Verify in inactive list
      const { data: allBudgets } = await aravind.rpc("fp_list_budgets", { p_active_only: false });
      const inactive = (allBudgets as BudgetListItem[]).find((b) => b.id === monthlyBudget.id);
      check(inactive?.active === false, "inactive list shows active=false");
    }
  }

  // -------------------------------------------------------
  // 15. Reactivate budget
  // -------------------------------------------------------
  console.log("\n[15] Reactivate budget");
  {
    const { data: budgets } = await aravind.rpc("fp_list_budgets", { p_active_only: false });
    const monthlyBudget = (budgets as BudgetListItem[]).find((b) => b.type === "monthly" && b.active === false);
    if (monthlyBudget) {
      const { error } = await aravind.rpc("fp_set_budget_active", {
        p_budget_id: monthlyBudget.id,
        p_active: true,
      });
      check(error === null, "budget reactivated", error?.message);

      // Verify in active list
      const { data: activeBudgets } = await aravind.rpc("fp_list_budgets", { p_active_only: true });
      check((activeBudgets as BudgetListItem[]).some((b) => b.id === monthlyBudget.id), "in active list");
    }
  }

  // -------------------------------------------------------
  // 16. Inactive budget retained for history
  // -------------------------------------------------------
  console.log("\n[16] Inactive budget retained for history");
  {
    const { data: budgets } = await aravind.rpc("fp_list_budgets", { p_active_only: false });
    const monthlyBudget = (budgets as BudgetListItem[]).find((b) => b.type === "monthly" && b.active === false);
    if (monthlyBudget) {
      const { data: detail, error } = await aravind.rpc("fp_get_budget_detail", { p_budget_id: monthlyBudget.id });
      if (error) throw new Error(error.message);
      check(detail !== null, "detail available for inactive budget");
      check(typeof detail.total_spent === "number", "historical spending retained");
    }
  }

  // -------------------------------------------------------
  // Summary
  // -------------------------------------------------------
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("Failures:", failures.join(", "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});