import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { monthBounds, familySpend } from "@/lib/family";
import { memberSpend, reportTransactions } from "@/lib/report";
import type { Family, Transaction, UserRow } from "@/lib/types";
import FamilyDashboardView from "@/components/family-dashboard-view";

export default async function FamilyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: me }, membersRes, familyRes, txnsRes] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("users").select("*").order("created_at"),
    supabase.from("families").select("*").maybeSingle(),
    supabase.from("transactions").select("*"),
  ]);

  const meRow = (me ?? null) as UserRow | null;
  if (membersRes.error || familyRes.error || txnsRes.error)
    throw new Error("Could not load family overview.");
  if (!meRow?.family_id) redirect("/setup");

  const family = (familyRes.data ?? null) as Family | null;
  if (!family) redirect("/setup");

  const members = ((membersRes.data ?? []) as UserRow[]).filter(
    (m) => m.family_id === meRow.family_id,
  );
  const allTxns = (txnsRes.data ?? []) as Transaction[];

  const { from, to } = monthBounds();
  const spend = familySpend(allTxns, from, to);
  const spendByMember = Object.fromEntries(
    memberSpend(reportTransactions(allTxns, from, to)),
  );

  return (
    <FamilyDashboardView
      me={meRow}
      family={family}
      members={members}
      spend={spend}
      memberSpend={spendByMember}
      isAdmin={meRow.role === "admin"}
    />
  );
}