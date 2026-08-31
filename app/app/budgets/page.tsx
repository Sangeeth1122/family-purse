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
      <div className="flex items-center gap-3 px-5 pt-5 pb-2">
        <Link href="/app/dashboard" className="icon-btn" style={{ width: 36, height: 36 }} aria-label="Back">
          <span aria-hidden="true" className="text-[17px] leading-none">‹</span>
        </Link>
        <h1 className="text-[20px] font-bold" style={{ letterSpacing: "-0.01em" }}>Budgets & categories</h1>
      </div>

      <div className="card mx-5 mt-3 p-5 flex items-center justify-between">
        <div>
          <div className="text-[12px] font-semibold t-secondary uppercase" style={{ letterSpacing: "0.04em", marginBottom: 6 }}>
            Spent this month
          </div>
          <div>
            <span className="text-[22px] font-bold num">{formatINR(spendTotal)}</span>
            {budgetTotal > 0 && (
              <span className="text-[13px] font-semibold t-tertiary ml-1">of {formatINR(budgetTotal)}</span>
            )}
          </div>
        </div>
        {budgetTotal > 0 && (
          <div className="text-right">
            <div
              className="text-[22px] font-bold num"
              style={{ color: spendTotal > budgetTotal ? "var(--red)" : "var(--text)" }}
            >
              {Math.round((spendTotal / budgetTotal) * 100)}%
            </div>
            <div className="text-[11px] font-semibold t-tertiary">used</div>
          </div>
        )}
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
                <span className="flex items-center gap-2.5 text-[15px] font-semibold min-w-0">
                  <span className="dot" style={{ background: row.category.color, width: 9, height: 9 }} />
                  <span className="truncate">{row.category.name}</span>
                </span>
                <span className="text-[14px] num flex-shrink-0">
                  <span className="font-bold t-primary">
                    {formatINR(row.spent)}
                  </span>
                  {row.budget !== undefined && row.budget !== null && (
                    <span className="font-semibold t-tertiary"> / {formatINR(row.budget)}</span>
                  )}
                </span>
              </div>
              {row.budget !== undefined && row.budget !== null && (
                <>
                  <div className="h-[5px] rounded-full overflow-hidden mt-2.5" style={{ background: "rgba(0,0,0,0.06)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, Math.max(3, (pct ?? 0) * 100))}%`, background: "var(--text)" }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2 text-[11px] font-semibold t-tertiary">
                    <span className={over ? "t-red" : ""}>
                      {over ? "Over budget" : "On pace"}
                    </span>
                    <span>Day {day} of {days}</span>
                  </div>
                </>
              )}
              {(!row.budget || row.budget === 0) && (
                <div className="flex items-center justify-between mt-2 text-[11px] font-semibold t-tertiary">
                  <span>No budget set</span>
                  <span>—</span>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}