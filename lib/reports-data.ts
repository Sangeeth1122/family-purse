import { createClient } from "@/lib/supabase/server";
import type { Category, LegacyBudget, Transaction, UserRow } from "@/lib/types";

export type ReportData = {
  categories: Category[];
  txns: Transaction[];
  budgets: LegacyBudget[];
  members: UserRow[];
};

/**
 * Shared family-wide report dataset. Transactions are fetched with the
 * caller's RLS scope only (full family-wide read visibility, per the
 * existing authorization model — never across families). Budgets and family
 * members ride along so budget-pace and who-contributes reports can derive
 * their rows without extra requests.
 */
export async function loadReportData(): Promise<ReportData> {
  const supabase = await createClient();
  const [catsRes, txnsRes, budgetsRes, membersRes] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order"),
    supabase.from("transactions").select("*"),
    supabase.from("budgets").select("*"),
    supabase.from("users").select("*").order("name"),
  ]);
  if (catsRes.error || txnsRes.error || budgetsRes.error || membersRes.error) {
    throw new Error("Failed to load report data");
  }
  return {
    categories: (catsRes.data ?? []) as Category[],
    txns: (txnsRes.data ?? []) as Transaction[],
    budgets: (budgetsRes.data ?? []) as LegacyBudget[],
    members: (membersRes.data ?? []) as UserRow[],
  };
}