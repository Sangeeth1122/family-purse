import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Category, Transaction, UserRow, LegacyBudget } from "@/lib/types";
import CategoryTransactionsClient from "@/components/category-transactions-client";

function monthBounds(d = new Date()) {
  const vm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const from = `${vm}-01`;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const to = `${vm}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

function prevMonthBounds(d = new Date()) {
  const firstOfPrev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const lastOfPrev = new Date(d.getFullYear(), d.getMonth(), 0);
  const from = `${firstOfPrev.getFullYear()}-${String(firstOfPrev.getMonth() + 1).padStart(2, "0")}-01`;
  const to = `${lastOfPrev.getFullYear()}-${String(lastOfPrev.getMonth() + 1).padStart(2, "0")}-${String(
    lastOfPrev.getDate(),
  ).padStart(2, "0")}`;
  return { from, to };
}

export default async function CategoryTransactionsPage({
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

  const isUncategorised = id === "uncategorised";

  let category: Category | null = null;
  if (!isUncategorised) {
    const { data } = await supabase
      .from("categories")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    category = (data as Category | null) ?? null;
    if (!category) notFound();
  }

  const cur = monthBounds();
  const prev = prevMonthBounds();

  const [txnsRes, catsRes, budgetsRes, membersRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .eq("kind", "pl")
      .gte("date", prev.from)
      .lte("date", cur.to)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("categories").select("*"),
    supabase.from("budgets").select("*"),
    supabase.from("users").select("*"),
  ]);

  const txns = (txnsRes.data ?? []) as Transaction[];
  const cats = (catsRes.data ?? []) as Category[];
  const budgets = (budgetsRes.data ?? []) as LegacyBudget[];
  const members = (membersRes.data ?? []) as UserRow[];

  const filtered = txns.filter((t) =>
    isUncategorised ? t.category_id === null : t.category_id === id,
  );

  const catName = (cid: string | null) => {
    const c = cats.find((c) => c.id === cid);
    return c ? { name: c.name, color: c.color } : null;
  };

  const myBudget = budgets.find(
    (b) => b.scope_type === "personal" && b.scope_id === user.id && b.category_id === id,
  );

  const allRows = filtered.map((t) => ({
    id: t.id,
    amount: t.amount,
    date: t.date,
    note: t.note,
    categoryName: catName(t.category_id)?.name ?? "Uncategorised",
    categoryColor: catName(t.category_id)?.color ?? null,
    type: t.type,
    creatorName: members.find((m) => m.id === t.created_by)?.name ?? "Family member",
    showCreator: true,
  }));

  return (
    <div className="min-h-screen pb-24">
      <div className="flex items-center gap-3 px-5 pt-5 pb-1">
        <Link href="/app/budgets" className="icon-btn" style={{ width: 36, height: 36 }} aria-label="Back">
          <span aria-hidden="true" className="text-[17px] leading-none">‹</span>
        </Link>
        <div className="flex items-center gap-2">
          <span
            className="h-[10px] w-[10px] rounded-full"
            style={{ background: category?.color ?? "#8A867C" }}
          />
          <h1 className="text-[18px] font-bold">
            {category?.name ?? "Uncategorised"}
          </h1>
        </div>
      </div>

      <CategoryTransactionsClient
        rows={allRows}
        budgetAmount={myBudget?.amount ?? null}
      />
    </div>
  );
}
