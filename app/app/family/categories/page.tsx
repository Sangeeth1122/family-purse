import { redirect } from "next/navigation";
import { IconLock } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import type { Category, Transaction, UserRow, LegacyBudget } from "@/lib/types";
import CategoryManagerView from "@/components/category-manager-view";

export default async function FamilyCategoriesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: me }, catsRes, budgetsRes, txnsRes] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("categories").select("*").order("sort_order"),
    supabase.from("budgets").select("*"),
    supabase.from("transactions").select("*").eq("kind", "pl"),
  ]);

  const meRow = (me ?? null) as UserRow | null;
  if (catsRes.error || budgetsRes.error || txnsRes.error)
    throw new Error("Could not load categories.");
  if (!meRow?.family_id) redirect("/setup");

  if (meRow.role !== "admin") {
    return (
      <div className="min-h-screen pb-24 px-5 pt-24 text-center">
        <div className="w-11 h-11 rounded-full bg-[rgba(0,0,0,0.06)] flex items-center justify-center mx-auto mb-3">
          <IconLock size={18} className="t-secondary" />
        </div>
        <h1 className="text-[17px] font-bold mb-1">Admins only</h1>
        <p className="text-[12.5px] font-semibold t-secondary leading-relaxed mx-auto max-w-[280px]">
          Category management — reordering, renaming, budgets and deletion — is
          kept with family admins. Ask an admin if this needs to change.
        </p>
      </div>
    );
  }

  const categories = (catsRes.data ?? []) as Category[];
  const nonSystemCategories = categories.filter((c) => !c.system);
  const budgets = (budgetsRes.data ?? []) as LegacyBudget[];
  const txns = (txnsRes.data ?? []) as Transaction[];

  const myBudget: Record<string, number> = {};
  for (const b of budgets) {
    if (b.scope_type === "personal" && b.scope_id === meRow.id && b.period === "monthly") {
      myBudget[b.category_id] = b.amount;
    }
  }

  const tagged: Record<string, number> = {};
  for (const t of txns) {
    if (t.category_id) tagged[t.category_id] = (tagged[t.category_id] ?? 0) + 1;
  }

  return (
    <CategoryManagerView
      categories={nonSystemCategories}
      myBudget={myBudget}
      tagged={tagged}
      familyId={meRow.family_id}
      meId={meRow.id}
    />
  );
}