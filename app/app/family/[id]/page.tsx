import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { monthBounds, memberOpenBalance } from "@/lib/family";
import { reportTransactions } from "@/lib/report";
import type { Family, Loan, Transaction, UserRow } from "@/lib/types";
import MemberDetailView, { type MemberCategory } from "@/components/member-detail-view";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: me }, targetRes, familyRes, txnsRes, loansRes] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("users").select("*").eq("id", id).maybeSingle(),
    supabase.from("families").select("*").maybeSingle(),
    supabase.from("transactions").select("*"),
    supabase.from("loans").select("*"),
  ]);

  const meRow = (me ?? null) as UserRow | null;
  if (targetRes.error || familyRes.error || txnsRes.error || loansRes.error)
    throw new Error("Could not load this member's overview.");
  if (!meRow?.family_id) redirect("/setup");

  const target = (targetRes.data ?? null) as UserRow | null;
  if (!target || target.family_id !== meRow.family_id) {
    return (
      <div className="min-h-screen pb-24 px-5 pt-24 text-center">
        <div className="avatar mx-auto mb-3" style={{ width: 64, height: 64, fontSize: 20 }}>
          ?
        </div>
        <h1 className="text-[17px] font-bold mb-1">Member not found</h1>
        <p className="text-[12.5px] font-semibold t-secondary leading-relaxed mb-5">
          This member isn&apos;t part of your family, or they left it. No member
          data is visible outside the family.
        </p>
        <Link href="/app/family/members" className="btn btn-primary inline-flex">
          Back to members
        </Link>
      </div>
    );
  }

  const family = (familyRes.data ?? null) as Family | null;
  const allTxns = (txnsRes.data ?? []) as Transaction[];
  const loans = (loansRes.data ?? []) as Loan[];
  const { from, to } = monthBounds();

  const catMeta = new Map<string, { name: string; color: string }>();
  const catColors: Record<string, string> = {};

  const monthTxns = reportTransactions(allTxns, from, to).filter(
    (t) => t.scope_type === "personal" && t.scope_id === target.id,
  );

  let spendThisMonth = 0;
  let txnCount = 0;
  const byCat = new Map<string, number>();
  for (const t of monthTxns) {
    if (t.type !== "expense" && t.type !== "interest_expense") continue;
    spendThisMonth += t.amount;
    txnCount++;
    byCat.set(t.category_id ?? "uncat", (byCat.get(t.category_id ?? "uncat") ?? 0) + t.amount);
  }

  // Resolve category names/colors from the family category list.
  const catsRes = await supabase.from("categories").select("*").order("sort_order");
  for (const c of (catsRes.data ?? []) as { id: string; name: string; color: string }[]) {
    catMeta.set(c.id, { name: c.name, color: c.color });
  }
  catColors.uncat = "#8A867C";

  const byCategory: MemberCategory[] = [...byCat.entries()]
    .map(([key, amount]) => ({
      categoryId: key === "uncat" ? null : key,
      name: key === "uncat" ? "Uncategorised" : (catMeta.get(key)?.name ?? "Category"),
      color: catMeta.get(key)?.color ?? "#8A867C",
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <MemberDetailView
      me={meRow}
      member={target}
      family={family!}
      spendThisMonth={spendThisMonth}
      txnCount={txnCount}
      byCategory={byCategory}
      openBalance={memberOpenBalance(loans, target.id)}
      isAdmin={meRow.role === "admin"}
    />
  );
}