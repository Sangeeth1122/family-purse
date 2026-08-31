import type { Budget, Category, Transaction } from "@/lib/types";

/**
 * Card opening balances are seeded as one-time P&L expenses so the cards module
 * (Phase 2) can compute outstanding balances from them. They are a balance
 * transfer / opening-balance artifact, NOT monthly household spend, so they are
 * excluded from the monthly P&L report. (Contract: report-period spend ₹40,600
 * with Amex ₹3,650 and HDFC ₹75,460 excluded as card opening balances.)
 */
export const CARD_OPENING_BALANCE_IDS = new Set([
  "12121212-1212-4121-8121-121212121218", // Prior HDFC card spend
  "12121212-1212-4121-8121-121212121219", // Amex spend
]);

/** All P&L transactions inside [from, to] (inclusive), excluding card opening balances. */
export function reportTransactions(
  all: Transaction[],
  from: string,
  to: string,
): Transaction[] {
  return all.filter(
    (t) =>
      t.kind === "pl" &&
      !CARD_OPENING_BALANCE_IDS.has(t.id) &&
      t.date >= from &&
      t.date <= to,
  );
}

export type MonthlySummary = {
  income: number;
  expense: number;
  net: number;
  savingsRate: number | null;
  byCategory: { categoryId: string | null; name: string; color: string; amount: number }[];
  byMember: Map<string, number>;
};

export function summarizeMonth(
  txns: Transaction[],
  categoryName: (id: string | null) => { name: string; color: string } | null,
): MonthlySummary {
  let income = 0;
  let expense = 0;
  const byCategory = new Map<
    string | null,
    { categoryId: string | null; name: string; color: string; amount: number }
  >();
  const byMember = new Map<string, number>();

  for (const t of txns) {
    if (t.type === "revenue") income += t.amount;
    else if (t.type === "interest_income") income += t.amount;
    else if (t.type === "expense" || t.type === "interest_expense") {
      expense += t.amount;
      const meta = categoryName(t.category_id);
      const key = t.category_id;
      const entry = byCategory.get(key) ?? {
        categoryId: key,
        name: meta?.name ?? "Uncategorised",
        color: meta?.color ?? "#8A867C",
        amount: 0,
      };
      entry.amount += t.amount;
      byCategory.set(key, entry);
    }
  }

  const net = income - expense;
  return {
    income,
    expense,
    net,
    savingsRate: income > 0 ? Math.round((net / income) * 100) : null,
    byCategory: [...byCategory.values()].sort((a, b) => b.amount - a.amount),
    byMember,
  };
}

/** Member spend (P&L expenses only) keyed by user id, from personal-scope rows. */
export function memberSpend(txns: Transaction[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of txns) {
    if (t.kind === "pl" && (t.type === "expense" || t.type === "interest_expense")) {
      map.set(t.scope_id, (map.get(t.scope_id) ?? 0) + t.amount);
    }
  }
  return map;
}

export function inMonth(d: Date, monthKey: string): boolean {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === monthKey;
}

/** Lookup helper mapping a category id to its canonical name/color. */
export function categoryMeta(
  categories: Category[],
): (id: string | null) => { name: string; color: string } | null {
  return (id: string | null) => {
    const c = categories.find((c) => c.id === id);
    return c ? { name: c.name, color: c.color } : null;
  };
}

/** Inclusive calendar-month range, `offset` months from `base`. */
export type ReportRange = {
  from: string;
  to: string;
  label: string;
};

export function reportMonthRange(offset = 0, base = new Date()): ReportRange {
  const d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return {
    from: `${key}-01`,
    to: `${key}-${String(last).padStart(2, "0")}`,
    label: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
  };
}

/** Pure P&L spend for a day: date → category breakdown (settlements and card
 * opening balances excluded, per the accounting model). */
export type DaySpend = {
  date: string;
  total: number;
  categories: {
    categoryId: string | null;
    name: string;
    color: string;
    amount: number;
  }[];
};

export function dailySpend(
  txns: Transaction[],
  from: string,
  to: string,
  categoryName: (id: string | null) => { name: string; color: string } | null,
): DaySpend[] {
  const byDay = new Map<string, Map<string | null, number>>();
  for (const t of reportTransactions(txns, from, to)) {
    if (t.type !== "expense" && t.type !== "interest_expense") continue;
    const day = byDay.get(t.date) ?? new Map<string | null, number>();
    day.set(t.category_id, (day.get(t.category_id) ?? 0) + t.amount);
    byDay.set(t.date, day);
  }
  return [...byDay.entries()]
    .map(([date, cats]) => {
      const categories = [...cats.entries()]
        .map(([categoryId, amount]) => {
          const meta = categoryName(categoryId);
          return {
            categoryId,
            name: meta?.name ?? "Uncategorised",
            color: meta?.color ?? "#8A867C",
            amount,
          };
        })
        .sort((a, b) => b.amount - a.amount);
      return {
        date,
        total: categories.reduce((s, e) => s + e.amount, 0),
        categories,
      };
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Waterfall steps: income bookend, each expense category (hanging), net bookend. */
export type WaterfallStep =
  | { kind: "income"; name: string; amount: number }
  | {
      kind: "expense";
      categoryId: string | null;
      name: string;
      color: string;
      amount: number;
    }
  | { kind: "net"; amount: number };

export function waterfallSteps(summary: MonthlySummary): WaterfallStep[] {
  const steps: WaterfallStep[] = [
    { kind: "income", name: "Income", amount: summary.income },
    ...summary.byCategory.map((c) => ({
      kind: "expense" as const,
      categoryId: c.categoryId,
      name: c.name,
      color: c.color,
      amount: c.amount,
    })),
    { kind: "net", amount: summary.net },
  ];
  return steps;
}

const W_CHART_TOP = 16;
const W_CHART_BOTTOM = 208;
const W_CHARTS_H = W_CHART_BOTTOM - W_CHART_TOP;
const W_PITCH = 44;

function wRound2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type WaterfallLayout = {
  bars: {
    kind: WaterfallStep["kind"];
    name: string;
    color: string;
    amount: number;
    x: number;
    y: number;
    height: number;
  }[];
  connectors: { x1: number; x2: number; y: number }[];
  viewW: number;
  viewH: number;
  baselineY: number;
};

/** Scale/draw arithmetic for the hand-rolled waterfall SVG (mockup 20c).
 * Pure so the income → expense → net accounting flow stays testable. */
export function waterfallLayout(steps: WaterfallStep[]): WaterfallLayout {
  const running: number[] = [0];
  for (const s of steps) {
    running.push(
      s.kind === "income"
        ? wRound2(running[running.length - 1] + s.amount)
        : s.kind === "expense"
          ? wRound2(running[running.length - 1] - s.amount)
          : running[running.length - 1],
    );
  }
  const values = [...running.slice(0, -1), steps[steps.length - 1].amount];
  const yMin = Math.min(0, ...values);
  const yMax = Math.max(...values, 0);
  const scale = yMax - yMin || 1;
  const top = (v: number) =>
    W_CHART_BOTTOM - ((v - yMin) / scale) * W_CHARTS_H;
  const baselineY = top(0);

  const bars = steps.map((s, i) => {
    const x = 7 + i * W_PITCH;
    if (s.kind === "expense") {
      const from = top(running[i]);
      const to = top(running[i + 1]);
      return {
        kind: s.kind as WaterfallStep["kind"],
        name: s.name,
        color: s.color,
        amount: s.amount,
        x,
        y: from,
        height: to - from,
      };
    }
    return {
      kind: s.kind as WaterfallStep["kind"],
      name: s.kind === "net" ? "Net" : s.name,
      color: "#1A1A18",
      amount: s.amount,
      x,
      y: top(s.amount),
      height: top(0) - top(s.amount),
    };
  });

  const connectors = steps.slice(0, -1).map((_, i) => ({
    x1: 7 + (i + 1) * W_PITCH - 4,
    x2: 7 + (i + 1) * W_PITCH + 4,
    y: top(running[i + 1]),
  }));

  const need = 7 + steps.length * W_PITCH - 4 + 4;
  return {
    bars,
    connectors,
    viewW: Math.max(358, need),
    viewH: W_CHART_BOTTOM + 22,
    baselineY,
  };
}

/** Budgets whose period applies to [from, to]: monthly always; one_time on
 * start date inside the range; custom when the range overlaps its dates. */
export function budgetsForRange(
  budgets: Budget[],
  from: string,
  to: string,
): Budget[] {
  return budgets.filter((b) => {
    if (b.period === "monthly") return true;
    if (b.period === "one_time") {
      return !!b.start_date && b.start_date >= from && b.start_date <= to;
    }
    if (!b.start_date || !b.end_date) return false;
    return b.start_date <= to && b.end_date >= from;
  });
}

export type BudgetPaceRow = {
  categoryId: string | null;
  name: string;
  color: string;
  budget: number;
  spent: number;
  over: boolean;
};

/** Bullet-bar dataset: per-category spend vs the budget amounts that apply to
 * the range (budgets aggregated across scopes, whole-family view). */
export function budgetPace(
  txns: Transaction[],
  from: string,
  to: string,
  budgets: Budget[],
  categoryName: (id: string | null) => { name: string; color: string } | null,
): BudgetPaceRow[] {
  const spend = new Map<string | null, number>();
  for (const t of reportTransactions(txns, from, to)) {
    if (t.type === "expense" || t.type === "interest_expense") {
      spend.set(t.category_id, (spend.get(t.category_id) ?? 0) + t.amount);
    }
  }
  const budgetByCat = new Map<string | null, number>();
  for (const b of budgetsForRange(budgets, from, to)) {
    budgetByCat.set(
      b.category_id,
      (budgetByCat.get(b.category_id) ?? 0) + b.amount,
    );
  }
  return [...budgetByCat.entries()]
    .map(([categoryId, budget]) => {
      const meta = categoryName(categoryId);
      const spent = spend.get(categoryId) ?? 0;
      return {
        categoryId,
        name: meta?.name ?? "Uncategorised",
        color: meta?.color ?? "#8A867C",
        budget,
        spent,
        over: spent > budget,
      };
    })
    .sort((a, b) => b.spent / b.budget - a.spent / a.budget);
}

/** The contiguous period immediately before `range`, same length. */
export function previousRange(range: ReportRange): { from: string; to: string } {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  const fromMs = new Date(`${range.from}T00:00:00`).getTime();
  const toMs = new Date(`${range.to}T00:00:00`).getTime();
  const len = toMs - fromMs + 86400000;
  const prevTo = new Date(fromMs - 86400000);
  const prevFrom = new Date(prevTo.getTime() - len + 86400000);
  return { from: fmt(prevFrom), to: fmt(prevTo) };
}

export type DeltaRow = {
  categoryId: string | null;
  name: string;
  color: string;
  current: number;
  delta: number;
};

/** Vs-last-period category deltas (current spend − previous spend). Same-length
 * previous window; categories present only in one window get the missing
 * side treated as zero. */
export function vsLastPeriod(
  txns: Transaction[],
  range: ReportRange,
  categoryName: (id: string | null) => { name: string; color: string } | null,
): DeltaRow[] {
  const current = summarizeMonth(
    reportTransactions(txns, range.from, range.to),
    categoryName,
  ).byCategory;
  const previous = previousRange(range);
  const prior = summarizeMonth(
    reportTransactions(txns, previous.from, previous.to),
    categoryName,
  ).byCategory;

  const map = new Map<string | null, DeltaRow>();
  for (const c of current) {
    map.set(c.categoryId, {
      categoryId: c.categoryId,
      name: c.name,
      color: c.color,
      current: c.amount,
      delta: c.amount,
    });
  }
  for (const c of prior) {
    const hit = map.get(c.categoryId);
    if (hit) {
      hit.delta = hit.delta - c.amount;
    } else {
      map.set(c.categoryId, {
        categoryId: c.categoryId,
        name: c.name,
        color: c.color,
        current: 0,
        delta: -c.amount,
      });
    }
  }
  // Project budgets can aggregate spend under several categories; a delta of
  // exactly zero carries no signal.
  return [...map.values()]
    .filter((r) => r.delta !== 0)
    .sort((a, b) => a.delta - b.delta);
}

export type TrendPoint = {
  key: string;
  label: string;
  income: number;
  expense: number;
};

/** Income/expense time series for [from, to]: monthly buckets when the range
 * spans months, weekly buckets when it is a single calendar month. */
export function trendSeries(
  txns: Transaction[],
  from: string,
  to: string,
): TrendPoint[] {
  const pl = reportTransactions(txns, from, to);
  const pts = new Map<string, TrendPoint>();
  const push = (t: Transaction, key: string, label: string) => {
    const p = pts.get(key) ?? { key, label, income: 0, expense: 0 };
    if (t.type === "revenue" || t.type === "interest_income") {
      p.income += t.amount;
    } else if (t.type === "expense" || t.type === "interest_expense") {
      p.expense += t.amount;
    }
    pts.set(key, p);
  };

  if (from.slice(0, 7) === to.slice(0, 7)) {
    const start = new Date(`${from}T00:00:00`);
    const lastDay = new Date(
      start.getFullYear(),
      start.getMonth() + 1,
      0,
    ).getDate();
    for (const t of pl) {
      const dayNum = Math.floor(
        (new Date(`${t.date}T00:00:00`).getTime() - start.getTime()) /
          86400000,
      );
      const wk = Math.floor(dayNum / 7);
      const wkStart = new Date(start.getTime() + wk * 7 * 86400000);
      const wkEndNum = Math.min(wkStart.getDate() + 6, lastDay);
      const monthShort = wkStart.toLocaleDateString("en-IN", { month: "short" });
      push(t, `w${wk}`, `${wkStart.getDate()}–${wkEndNum} ${monthShort}`);
    }
  } else {
    for (const t of pl) {
      const key = t.date.slice(0, 7);
      const label = new Date(`${key}-01T00:00:00`).toLocaleDateString("en-IN", {
        month: "short",
        year: "2-digit",
      });
      push(t, key, label);
    }
  }
  return [...pts.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** Deterministic per-member colors (persistent across reloads), from the same
 * warm/pop palette family as category colors. */
export const MEMBER_COLORS = [
  "#4A7A5E",
  "#B0562F",
  "#C79A3A",
  "#3E7CA6",
  "#7A6FA8",
  "#8A867C",
];

export type MemberContribution = {
  userId: string;
  name: string;
  color: string;
  amount: number;
};

/** Who's contributing what: personal-scope P&L spend per family member in the
 * range, ranked descending, each member colored from the fixed palette in
 * stable (name-sorted) order. */
export function memberContribution(
  txns: Transaction[],
  from: string,
  to: string,
  members: { id: string; name: string }[],
): MemberContribution[] {
  const spend = memberSpend(reportTransactions(txns, from, to));
  const ordered = [...members].sort((a, b) => a.name.localeCompare(b.name));
  const colorFor = new Map<string, string>();
  ordered.forEach((m, i) => colorFor.set(m.id, MEMBER_COLORS[i % MEMBER_COLORS.length]));
  return [...spend.entries()]
    .map(([userId, amount]) => {
      const m = ordered.find((x) => x.id === userId);
      return {
        userId,
        name: m?.name ?? "Family member",
        color: m ? colorFor.get(m.id) ?? "#8A867C" : "#8A867C",
        amount,
      };
    })
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}