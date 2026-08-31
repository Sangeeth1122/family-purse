import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { memberOpenBalance } from "@/lib/family";
import type { Family, Loan, UserRow } from "@/lib/types";
import MembersView from "@/components/members-view";

export default async function FamilyMembersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: me }, membersRes, familyRes, loansRes] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("users").select("*").order("created_at"),
    supabase.from("families").select("*").maybeSingle(),
    supabase.from("loans").select("*"),
  ]);

  const meRow = (me ?? null) as UserRow | null;
  if (membersRes.error || familyRes.error || loansRes.error)
    throw new Error("Could not load family members.");
  if (!meRow?.family_id) redirect("/setup");

  const family = (familyRes.data ?? null) as Family | null;
  if (!family) redirect("/setup");

  const members = ((membersRes.data ?? []) as UserRow[]).filter(
    (m) => m.family_id === meRow.family_id,
  );
  const loans = (loansRes.data ?? []) as Loan[];

  const openBalances: Record<string, { amount: number; count: number }> = {};
  for (const m of members) {
    const ob = memberOpenBalance(loans, m.id);
    if (ob.amount > 0) openBalances[m.id] = ob;
  }

  return (
    <MembersView
      me={meRow}
      family={family}
      members={members}
      openBalances={openBalances}
      isAdmin={meRow.role === "admin"}
    />
  );
}