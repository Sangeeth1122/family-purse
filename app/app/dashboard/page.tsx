import { redirect } from "next/navigation";
import Link from "next/link";
import { createElement } from "react";
import {
  IconBell,
  IconTrendingUp,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { formatINR, formatFullDate, initials } from "@/lib/format";
import { categoryIcon } from "@/lib/category-icons";
import { summarizeMonth, memberSpend, reportTransactions } from "@/lib/report";
import RemindersBell from "@/components/reminders/reminders-panel";
import type { Budget, Category, Reminder, Transaction, UserRow } from "@/lib/types";

function monthBounds(d = new Date()) {
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const to = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to, label: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { from, to, label } = monthBounds();

  const [membersRes, catsRes, txnsRes, budgetsRes, remindersRes] = await Promise.all([
    supabase.from("users").select("*").order("created_at"),
    supabase.from("categories").select("*").order("sort_order"),
    supabase.from("transactions").select("*"),
    supabase.from("budgets").select("*"),
    supabase.from("reminders").select("*").eq("status", "pending").order("due_date").limit(5),
  ]);

  if (membersRes.error || catsRes.error || txnsRes.error || budgetsRes.error || remindersRes.error)
    throw new Error("Could not load your dashboard.");

  const members = (membersRes.data ?? []) as UserRow[];
  const categories = (catsRes.data ?? []) as Category[];
  const allTxns = (txnsRes.data ?? []) as Transaction[];
  const budgets = (budgetsRes.data ?? []) as Budget[];
  const reminders = (remindersRes.data ?? []) as Reminder[];

  const me = members.find((m) => m.id === user.id);

  const catName = (id: string | null) => {
    const c = categories.find((c) => c.id === id);
    return c ? { name: c.name, color: c.color } : null;
  };

  const report = summarizeMonth(reportTransactions(allTxns, from, to), catName);
  const spendByMember = memberSpend(reportTransactions(allTxns, from, to));

  // Personal budget pace for the signed-in user.
  const myBudgets = budgets.filter((b) => b.scope_type === "personal" && b.scope_id === user.id);
  const catBudgetMap = new Map(myBudgets.map((b) => [b.category_id, b.amount]));
  const pace = categories
    .filter((c) => catBudgetMap.has(c.id))
    .map((c) => ({
      category: c,
      budget: catBudgetMap.get(c.id)!,
      spent:
        report.byCategory.find((r) => r.categoryId === c.id)?.amount ?? 0,
    }))
    .sort((a, b) => b.spent / b.budget - a.spent / a.budget);
  const paceTotal = pace.reduce((s, p) => s + p.spent, 0);
  const budgetTotal = pace.reduce((s, p) => s + (p.budget ?? 0), 0);

  const topMover = pace.find((p) => p.spent > 0);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-1">
        <div>
          <div className="text-[13px] font-semibold t-secondary">{greeting()}</div>
          <h1 className="text-[17px] font-bold">Family Purse</h1>
        </div>
        <RemindersBell
          reminders={reminders}
          isAdmin={me?.role === "admin"}
        />
      </div>

      {/* Balance card */}
      <div className="card mx-5 mt-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold t-secondary">Family balance</span>
        </div>
        <div className="text-[29px] font-semibold num mt-1.5" style={{ letterSpacing: "-0.3px" }}>
          {report.net >= 0 ? "+" : "−"}
          {formatINR(Math.abs(report.net))}
        </div>

        <div className="flex items-center gap-4 mt-2">
          <span className="text-[12px] font-semibold t-green">
            {formatINR(report.income)} in
          </span>
          <span className="text-[12px] font-semibold t-red">
            {formatINR(report.expense)} out
          </span>
        </div>
      </div>

      {/* Budget pace */}
      {pace.length > 0 && (
        <div className="card mx-5 mt-2.5 p-3.5">
          <Link href="/app/budgets" className="block">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] font-semibold t-secondary">
                Personal budget pace
              </span>
              <span className="text-[12px] font-semibold t-primary num">
                {formatINR(paceTotal)} / {formatINR(budgetTotal)}
              </span>
            </div>
            <div className="h-[6px] rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.07)", marginBottom: 8 }}>
              <div
                className="h-full"
                style={{
                  width: `${Math.min(100, (paceTotal / Math.max(budgetTotal, 1)) * 100)}%`,
                  background: "var(--red)",
                }}
              />
            </div>
            <div className="text-[12px] t-secondary">
              {Math.round((paceTotal / Math.max(budgetTotal, 1)) * 100)}% of budget used
            </div>
          </Link>
        </div>
      )}

      {/* Reminders */}
      {reminders.length > 0 && (
        <>
          <div className="px-5">
            <div className="section-label" style={{ padding: "20px 0 8px" }}>
              Upcoming
            </div>
            <div className="card p-1.5">
              {reminders.map((r, i) => (
                <div
                  key={r.id}
                  className={`flex items-center gap-3 rounded-lg px-3.5 py-3 ${
                    i > 0 ? "border-t" : ""
                  }`}
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="txn-icon">
                    <IconBell size={17} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="txn-title truncate">{r.title}</div>
                    <div className="txn-sub">Due {formatFullDate(r.due_date)}</div>
                  </div>
                  {r.amount !== null && (
                    <span className="text-[13px] font-bold num t-red">{formatINR(r.amount)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Top mover insight */}
      {topMover ? (
        <div className="card mx-5 mt-2.5 p-3.5 flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "rgba(176,86,47,0.08)", color: "var(--red)" }}
          >
            <IconTrendingUp size={16} />
          </div>
          <div>
            <div className="text-[12px] font-semibold t-primary">
              {topMover.category.name} is your top mover
            </div>
            <div className="text-[11px] font-semibold t-secondary mt-0.5">
              {formatINR(topMover.spent)} of {formatINR(topMover.budget)} budget used
            </div>
          </div>
        </div>
      ) : null}

      {/* Where it went */}
      <div className="px-5">
        <div className="flex items-center justify-between pt-5">
          <div className="text-[13px] font-bold">Where it went</div>
          <Link href="/app/reports" className="text-[12px] font-semibold t-secondary">
            Full report
          </Link>
        </div>
      </div>

      {report.byCategory.length > 0 ? (
        <div className="card mx-5 mt-2 px-3.5 py-3">
          {report.byCategory.map((row, i) => {
            const widest = report.byCategory[0].amount;
            return (
              <Link
                key={row.categoryId ?? "uncat"}
                href={`/app/categories/${row.categoryId ?? "uncategorised"}`}
                className={i > 0 ? "block mt-2.5" : "block"}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="flex items-center gap-2 text-[12px] font-semibold">
                    <span className="txn-icon" style={{ width: 24, height: 24, borderRadius: 6 }}>
                      {createElement(categoryIcon(row.name, "expense"), { size: 14, stroke: 1.8 })}
                    </span>
                    {row.name}
                  </span>
                  <span className="text-[12px] font-semibold num">{formatINR(row.amount)}</span>
                </div>
                <div className="h-[5px] rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.06)", marginBottom: 8 }}>
                  <div
                    className="h-full"
                    style={{ width: `${Math.max(4, (row.amount / Math.max(widest, 1)) * 100)}%`, background: row.color }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="card mx-5 mt-2 p-6 text-center">
          <p className="text-[13.5px] font-bold mb-1">No spending this month</p>
          <p className="text-[12.5px] font-semibold t-secondary">
            Tap + to log your first expense or revenue.
          </p>
        </div>
      )}

      {/* Expenses by member */}
      {spendByMember.size > 1 && (
        <div className="px-5">
          <div className="section-label" style={{ padding: "20px 0 8px" }}>
            By member
          </div>
          <div className="card p-1.5">
            {members
              .filter((m) => (spendByMember.get(m.id) ?? 0) > 0 || m.id === user.id)
              .map((m, i) => {
                const spent = spendByMember.get(m.id) ?? 0;
                return (
                  <div
                    key={m.id}
                    className={`flex items-center gap-3 px-3.5 py-3 ${i > 0 ? "border-t" : ""}`}
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="avatar" style={{ width: 34, height: 34, fontSize: 12 }}>
                      {initials(m.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="txn-title truncate">{m.name}</div>
                      <div className="txn-sub">
                        {m.id === me?.id ? "You" : m.role === "admin" ? "Admin" : "Member"}
                      </div>
                    </div>
                    <span className="text-[13.5px] font-bold num t-red">
                      {spent > 0 ? formatINR(spent) : "—"}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <div className="text-center text-[11px] font-semibold t-tertiary pt-8 pb-2">
        {label} · {me?.name ?? "You"}
      </div>
    </div>
  );
}