import { redirect } from "next/navigation";
import Link from "next/link";
import { IconTrendingUp } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/format";
import { summarizeMonth, reportTransactions } from "@/lib/report";
import RemindersBell from "@/components/reminders/reminders-panel";
import type { Category, Reminder, Transaction, UserRow, Budget } from "@/lib/types";

function monthBounds(d = new Date()) {
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const to = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to, label: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
}

/** Convert a YYYY-MM key to a Date at the first day of that month. */
function dateFromKey(key: string): Date {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const rem10 = n % 10;
  const suffix = rem10 === 1 ? "st" : rem10 === 2 ? "nd" : rem10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

/** Projected day-of-month the total budget would be exhausted at the current
 * spend pace (mockup note "…hit budget by 22nd · 8 days early"), or null when
 * there is no meaningful projection (nothing spent / already over / month
 * complete). */
function budgetHitDay(spent: number, budget: number, elapsedDay: number, daysInMonth: number): number | null {
  if (budget <= 0 || spent <= 0 || spent >= budget) return null;
  const projected = Math.ceil((elapsedDay * budget) / spent);
  if (elapsedDay >= daysInMonth || projected > daysInMonth) return null;
  return projected;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [membersRes, catsRes, txnsRes, budgetsRes, allocsRes, remindersRes, billsRes] = await Promise.all([
    supabase.from("users").select("*").order("created_at"),
    supabase.from("categories").select("*").order("sort_order"),
    supabase.from("transactions").select("*"),
    supabase.rpc("fp_list_budgets", { p_active_only: true }),
    supabase.from("budget_category_allocations").select("*"),
    supabase.from("reminders").select("*").eq("status", "pending").order("due_date"),
    supabase.from("recurring_bills").select("*").eq("active", true),
  ]);

  if (membersRes.error || catsRes.error || txnsRes.error)
    throw new Error("Could not load your dashboard.");

  const members = (membersRes.data ?? []) as UserRow[];
  const categories = (catsRes.data ?? []) as Category[];
  const allTxns = (txnsRes.data ?? []) as Transaction[];
  const activeBudgets = (budgetsRes.data ?? []) as (Budget & { total_spent: number; total_allocated: number })[];
  const rawReminders = (remindersRes.data ?? []) as Reminder[];
  const recurringBills = (billsRes.data ?? []) as { id: string; name: string; amount: number; due_day: number; category_id: string | null }[];

  // Dashboard month. Normally the current calendar month; when it has no
  // transactions (e.g. the month just rolled over and the family's canonical
  // data lives in a previous month), fall back to the most recent month that
  // has P&L transactions so the dashboard renders real data.
  const reportable = reportTransactions(allTxns, "0000-01-01", "9999-12-31");
  const dataMonths = [...new Set(reportable.map((t) => t.date.slice(0, 7)))].sort();
  const currentBounds = monthBounds();
  const currentKey = currentBounds.from.slice(0, 7);
  const bounds =
    !dataMonths.includes(currentKey) && dataMonths.length > 0
      ? monthBounds(dateFromKey(dataMonths[dataMonths.length - 1]))
      : currentBounds;
  const { from, to } = bounds;

  const me = members.find((m) => m.id === user.id);

  const catName = (id: string | null) => {
    const c = categories.find((c) => c.id === id);
    return c ? { name: c.name, color: c.color } : null;
  };

  const report = summarizeMonth(reportTransactions(allTxns, from, to), catName);

  // Previous-month summary, used by the balance trend and the top-mover delta.
  const [fromY, fromM] = from.split("-").map(Number);
  const prevBounds = monthBounds(new Date(fromY, fromM - 2, 1));
  const prevReport = summarizeMonth(reportTransactions(allTxns, prevBounds.from, prevBounds.to), catName);
  const trendPct =
    prevReport.net !== 0
      ? Math.abs(Math.round(((report.net - prevReport.net) / Math.abs(prevReport.net)) * 100))
      : null;
  const trendUp = report.net >= prevReport.net;
  const elapsedDay =
    bounds.from.slice(0, 7) === currentKey
      ? new Date().getDate()
      : Number(to.slice(-2));
  const daysInMonth = Number(to.slice(-2));

  // Synchronized Budget Pace: Find the active family monthly budget for this period
  const monthKey = bounds.from.slice(0, 7);
  const activeBudget =
    activeBudgets.find((b) => b.type === "monthly" && b.active && b.start_date.startsWith(monthKey)) ||
    activeBudgets.find((b) => b.type === "monthly" && b.active) ||
    activeBudgets[0] ||
    null;

  // Calculate Rollover Fund from the immediately preceding month
  const prevMonthKey = prevBounds.from.slice(0, 7);
  const prevBudget = activeBudgets.find(
    (b) => b.type === "monthly" && b.start_date.startsWith(prevMonthKey),
  );
  const rolloverSurplus =
    prevBudget && prevBudget.total_amount > (prevBudget.total_spent ?? 0)
      ? Math.round(prevBudget.total_amount - (prevBudget.total_spent ?? 0))
      : 0;

  const budgetAllocations = ((allocsRes.data ?? []) as { budget_id: string; category_id: string; amount: number }[]).filter(
    (a) => a.budget_id === activeBudget?.id,
  );
  const catBudgetMap = new Map(budgetAllocations.map((a) => [a.category_id, a.amount]));

  const pace = categories
    .filter((c) => catBudgetMap.has(c.id))
    .map((c) => ({
      category: c,
      budget: catBudgetMap.get(c.id)!,
      spent:
        report.byCategory.find((r) => r.categoryId === c.id)?.amount ?? 0,
    }))
    .sort((a, b) => b.spent / b.budget - a.spent / a.budget);

  const budgetTotal = activeBudget ? activeBudget.total_amount + rolloverSurplus : pace.reduce((s, p) => s + p.budget, 0);
  const paceTotal = activeBudget ? activeBudget.total_spent : pace.reduce((s, p) => s + p.spent, 0);

  const topMover = pace.find((p) => p.spent > 0);
  const moverDelta =
    topMover != null
      ? topMover.spent - (prevReport.byCategory.find((c) => c.categoryId === topMover.category.id)?.amount ?? 0)
      : 0;

  // Compile active reminders + proactive budget threshold alerts + recurring bills
  const todayStr = new Date().toISOString().slice(0, 10);
  const dynamicAlerts: Reminder[] = [];

  // 1. Budget Alerts: warn if family budget or any category exceeds 85%
  if (activeBudget && budgetTotal > 0) {
    const totalPct = (paceTotal / budgetTotal) * 100;
    if (totalPct >= 85) {
      dynamicAlerts.push({
        id: `alert-budget-${activeBudget.id}`,
        loan_id: null,
        card_id: null,
        category_id: null,
        due_date: todayStr,
        status: "pending",
        type: "budget_threshold",
        title: `${activeBudget.name}: ${Math.round(totalPct)}% used (${formatINR(paceTotal)} of ${formatINR(budgetTotal)})`,
        amount: Math.max(0, budgetTotal - paceTotal),
      });
    }
  }
  for (const p of pace) {
    if (p.budget > 0 && p.spent >= p.budget * 0.9) {
      dynamicAlerts.push({
        id: `alert-cat-${p.category.id}`,
        loan_id: null,
        card_id: null,
        category_id: p.category.id,
        due_date: todayStr,
        status: "pending",
        type: "budget_threshold",
        title: `${p.category.name} at ${Math.round((p.spent / p.budget) * 100)}% of allocation`,
        amount: Math.max(0, p.budget - p.spent),
      });
    }
  }

  // 2. Recurring bills dues
  const curY = new Date().getFullYear();
  const curM = String(new Date().getMonth() + 1).padStart(2, "0");
  for (const bill of recurringBills) {
    const dueDay = Math.min(bill.due_day, 28);
    const billDueDate = `${curY}-${curM}-${String(dueDay).padStart(2, "0")}`;
    dynamicAlerts.push({
      id: `bill-${bill.id}`,
      loan_id: null,
      card_id: null,
      category_id: bill.category_id,
      due_date: billDueDate,
      status: "pending",
      type: "card_payment_due",
      title: `Recurring: ${bill.name}`,
      amount: bill.amount,
    });
  }

  const reminders = [...rawReminders, ...dynamicAlerts];

  return (
    <div className="min-h-screen leading-[1.2]">
      {/* Header (mockup: frame provides 20px top padding; greeting 13px muted / brand 17px / bell 34x34) */}
      <div className="flex items-center justify-between pb-[18px]">
        <div>
          <div className="text-[13px] font-semibold t-secondary">Welcome!</div>
          <h1 className="text-[17px] font-bold">{me?.name}</h1>
        </div>
        <RemindersBell reminders={reminders} isAdmin={me?.role === "admin"} />
      </div>

      {/* Balance card (mockup: padding 16px, label left + balance + sparkline, delta row 12px/600) */}
      <div className="card p-4 mb-2.5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[13px] font-semibold t-secondary">Family balance</div>
            <div
              className="text-[29px] font-semibold num mt-1.5"
              style={{ letterSpacing: "-0.3px" }}
            >
              {formatINR(report.net)}
            </div>
          </div>
          <svg width="70" height="32" viewBox="0 0 70 32" className="shrink-0" aria-hidden="true">
            <polyline
              points="0,26 12,22 24,24 36,14 48,16 60,6 70,9"
              fill="none"
              stroke="#4A7A5E"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="flex gap-4 mt-2 text-[12px] font-semibold">
          <span className="t-green">{formatINR(report.income)} in</span>
          <span className="t-red">{formatINR(report.expense)} out</span>
          {trendPct !== null && (
            <span className="t-secondary">
              {trendUp ? "↑" : "↓"} {trendPct}% vs last mo.
            </span>
          )}
        </div>
      </div>

      {/* Budget pace (synchronized with active family monthly budget) */}
      {(activeBudget != null || pace.length > 0) && (
        <div className="card p-3.5 mb-2.5">
          <Link href="/app/budgets" className="block">
            <div className="flex items-center justify-between mb-1.5 text-[12px] font-semibold">
              <span className="t-secondary">
                {activeBudget ? `${activeBudget.name} pace` : "Budget pace"}
              </span>
              <span className="t-primary num">
                {formatINR(paceTotal)} / {budgetTotal.toLocaleString("en-IN")}
                {rolloverSurplus > 0 ? " (+rollover)" : ""}
              </span>
            </div>
            <div
              className="h-[6px] rounded-[3px] overflow-hidden mb-2"
              style={{ background: "rgba(0,0,0,0.07)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, (paceTotal / Math.max(budgetTotal, 1)) * 100)}%`,
                  background: "var(--red)",
                }}
              />
            </div>
            <div className="text-[12px] t-secondary">
              {budgetHitDay(paceTotal, budgetTotal, elapsedDay, daysInMonth) !== null ? (
                <>
                  At this pace, you&apos;ll hit budget by{" "}
                  <b className="t-primary">
                    {ordinal(budgetHitDay(paceTotal, budgetTotal, elapsedDay, daysInMonth)!)}
                  </b>
                  {" "}·{" "}
                  {daysInMonth - budgetHitDay(paceTotal, budgetTotal, elapsedDay, daysInMonth)!} days early
                </>
              ) : paceTotal > 0 && paceTotal >= budgetTotal && budgetTotal > 0 ? (
                <>Over budget by {formatINR(paceTotal - budgetTotal)}</>
              ) : (
                <>{Math.round((paceTotal / Math.max(budgetTotal, 1)) * 100)}% of budget used</>
              )}
            </div>
          </Link>
        </div>
      )}

      {/* Top mover (mockup: padding 14px, 32px red icon tile, title 12px / sub 11px) */}
      {topMover ? (
        <div className="card p-3.5 mb-2.5 flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0"
            style={{ background: "rgba(176,86,47,0.08)", color: "var(--red)" }}
          >
            <IconTrendingUp size={16} />
          </div>
          <div>
            <div className="text-[12px] font-semibold t-primary">
              {topMover.category.name} is your top mover
            </div>
            <div className="text-[11px] font-semibold t-secondary mt-0.5">
              {moverDelta > 0
                ? `${formatINR(moverDelta)} more than last month`
                : moverDelta < 0
                  ? `${formatINR(Math.abs(moverDelta))} less than last month`
                  : `Same as last month`}
            </div>
          </div>
        </div>
      ) : null}

      {/* Where it went — section head (mockup: margin 16px top / 8px bottom) */}
      <div className="flex items-center justify-between mt-4 mb-2">
        <div className="text-[13px] font-bold">Where it went</div>
        <Link href="/app/reports" className="text-[12px] font-semibold t-secondary">
          Full report
        </Link>
      </div>

      {report.byCategory.length > 0 ? (
        <div className="card px-3.5 py-3">
          {report.byCategory.map((row, i) => {
            const widest = report.byCategory[0].amount;
            const last = i === report.byCategory.length - 1;
            return (
              <Link
                key={row.categoryId ?? "uncat"}
                href={`/app/categories/${row.categoryId ?? "uncategorised"}`}
                className="block"
              >
                <div className="flex items-center justify-between mb-2.5">
                  <span className="flex items-center gap-2 text-[12px] font-semibold">
                    <span className="h-2 w-2 rounded-full" style={{ background: row.color }} />
                    {row.name}
                  </span>
                  <span className="text-[12px] font-semibold num">{formatINR(row.amount)}</span>
                </div>
                <div
                  className={`h-[5px] rounded-[3px] overflow-hidden ${last ? "mb-0" : "mb-3"}`}
                  style={{ background: "rgba(0,0,0,0.06)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(4, (row.amount / Math.max(widest, 1)) * 100)}%`,
                      background: row.color,
                    }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="card px-6 py-6 text-center">
          <p className="text-[13.5px] font-bold mb-1">No spending this month</p>
          <p className="text-[12.5px] font-semibold t-secondary">
            Tap + to log your first expense or revenue.
          </p>
        </div>
      )}

      </div>
  );
}