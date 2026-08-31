import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/format";
import { summarizeMonth, reportTransactions } from "@/lib/report";
import type { Budget, Category, Transaction, UserRow } from "@/lib/types";
import AddCategorySheet from "@/components/add-category-sheet";

function monthBounds(d = new Date()) {
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from, to: last.toISOString().slice(0, 10), day: d.getDate(), days: last.getDate() };
}

export default async function BudgetsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { from, to, day, days } = monthBounds();

  const [meRes, catsRes, txnsRes, budgetsRes] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("categories").select("*").order("sort_order"),
    supabase.from("transactions").select("*"),
    supabase.from("budgets").select("*"),
  ]);

  const me = meRes.data as UserRow | null;
  if (catsRes.error || txnsRes.error || budgetsRes.error || meRes.error)
    throw new Error("Could not load budgets.");
  const categories = (catsRes.data ?? []) as Category[];
  const allTxns = (txnsRes.data ?? []) as Transaction[];
  const budgets = (budgetsRes.data ?? []) as Budget[];
  const isAdmin = me?.role === "admin";

  const catName = (id: string | null) => {
    const c = categories.find((c) => c.id === id);
    return c ? { name: c.name, color: c.color } : null;
  };

  const report = summarizeMonth(reportTransactions(allTxns, from, to), catName);

  const myBudgets = budgets.filter((b) => b.scope_type === "personal" && b.scope_id === user.id);
  const budgetByCat = new Map(myBudgets.map((b) => [b.category_id, b.amount]));
  const catSpend = new Map(report.byCategory.map((r) => [r.categoryId, r.amount]));

  const spendTotal = report.byCategory.reduce((s, r) => s + r.amount, 0);
  const budgetTotal = [...budgetByCat.values()].reduce((s, a) => s + a, 0);

  const rows = categories
    .filter((c) => !c.system)
    .map((c) => ({
      category: c,
      spent: catSpend.get(c.id) ?? 0,
      budget: budgetByCat.get(c.id),
    }))
    .sort((a, b) => b.spent - a.spent);

  return (
    <div className="min-h-screen pb-24">
      <div className="flex items-center gap-3 px-5 pt-6 pb-4">
        <Link href="/app/dashboard" className="icon-btn" aria-label="Back">
          <span aria-hidden="true" className="text-[16px] leading-none">‹</span>
        </Link>
        <h1 className="text-[17px] font-bold">Budgets & categories</h1>
      </div>

      <div className="card mx-5 p-5">
        <div className="text-[11.5px] font-bold uppercase tracking-wide t-secondary">
          Spent this month
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-[30px] font-bold num">{formatINR(spendTotal)}</span>
          <span className="text-[13px] font-bold t-tertiary">of {formatINR(budgetTotal)}</span>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="badge neutral">Day {day} of {days}</span>
          {budgetTotal > 0 && (
            <span className="text-[11.5px] font-bold t-secondary">
              {Math.round((spendTotal / budgetTotal) * 100)}% used
            </span>
          )}
        </div>
      </div>

      {isAdmin && me?.family_id && <AddCategorySheet familyId={me.family_id} />}

      <div className="section-label">Categories · {rows.length}</div>

      <div className="px-5 flex flex-col gap-2.5">
        {rows.map((row) => {
          const pct = row.budget ? row.spent / row.budget : null;
          const over = pct !== null && pct > 1;
          return (
            <Link
              key={row.category.id}
              href={`/app/categories/${row.category.id}`}
              className="card p-4 block"
            >
              <div className="flex items-center justify-between gap-3 min-w-0">
                <span className="flex items-center gap-2.5 text-[14.5px] font-bold min-w-0">
                  <span className="dot" style={{ background: row.category.color }} />
                  <span className="truncate">{row.category.name}</span>
                </span>
                <span className="text-[13.5px] font-bold num flex-shrink-0">
                  <span className={over ? "t-red" : "t-primary"}>{formatINR(row.spent)}</span>
                  {row.budget !== undefined && (
                    <span className="t-tertiary font-semibold"> / {formatINR(row.budget)}</span>
                  )}
                </span>
              </div>
              <div className="bar-track mt-2.5">
                {row.budget !== undefined && (
                  <div
                    className="bar-fill"
                    style={{
                      width: `${Math.min(100, Math.max(3, (pct ?? 0) * 100))}%`,
                      background: over ? "var(--red)" : row.category.color,
                    }}
                  />
                )}
              </div>
              <div className="flex items-center justify-between mt-2 text-[11px] font-bold">
                {row.budget !== undefined ? (
                  <span className={over ? "t-red" : "t-green"}>
                    {over ? "Over budget" : "On pace"}
                  </span>
                ) : (
                  <span className="t-tertiary">No budget set</span>
                )}
                <span className="t-tertiary">Day {day} of {days}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}