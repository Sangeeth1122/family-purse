"use client";

import { useMemo, useState } from "react";
import { formatINR } from "@/lib/format";
import TransactionRow, { type TxnRowDatum } from "@/components/transaction-row";

type Filter = "month" | "prev" | "all";

function monthKeyBounds(d: Date): { from: string; to: string } {
  const vm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return { from: `${vm}-01`, to: `${vm}-${String(last).padStart(2, "0")}` };
}

function dayLabel(date: string): string {
  const d = new Date(date);
  const today = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const day = startOfDay(d);
  const now = startOfDay(today);
  const diff = Math.round((now - day) / 86400000);
  const dateOnly = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (diff === 0) return `Today, ${dateOnly}`;
  if (diff === 1) return `Yesterday, ${dateOnly}`;
  return dateOnly;
}

export default function CategoryTransactionsClient({
  rows,
  budgetAmount,
}: {
  rows: TxnRowDatum[];
  budgetAmount: number | null;
}) {
  const [filter, setFilter] = useState<Filter>("month");
  const now = new Date();
  const cur = monthKeyBounds(now);
  const prevBounds = monthKeyBounds(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const shown = useMemo(() => {
    if (filter === "month") return rows.filter((r) => r.date >= cur.from && r.date <= cur.to);
    if (filter === "prev") return rows.filter((r) => r.date >= prevBounds.from && r.date <= prevBounds.to);
    return rows;
  }, [filter, rows, cur.from, cur.to, prevBounds.from, prevBounds.to]);

  const monthSpent = rows
    .filter((r) => r.date >= cur.from && r.date <= cur.to)
    .filter((r) => r.type === "expense" || r.type === "interest_expense")
    .reduce((s, r) => s + r.amount, 0);

  const left = budgetAmount != null ? budgetAmount - monthSpent : null;
  const over = left != null && left < 0;

  const groups = useMemo(() => {
    const list: { label: string; items: TxnRowDatum[] }[] = [];
    for (const r of shown) {
      const label = dayLabel(r.date);
      const last = list[list.length - 1];
      if (last && last.label === label) last.items.push(r);
      else list.push({ label, items: [r] });
    }
    return list;
  }, [shown]);

  const filters: { key: Filter; label: string }[] = [
    { key: "month", label: "This month" },
    { key: "prev", label: "Last month" },
    { key: "all", label: "Custom range" },
  ];

  return (
    <>
      <div className="card mx-5 mt-4 p-5 flex items-center justify-between">
        <div>
          <div className="text-[12px] font-semibold t-secondary uppercase" style={{ letterSpacing: "0.04em", marginBottom: 6 }}>
            Spent this month
          </div>
          <div>
            <span className="text-[22px] font-bold num">{formatINR(monthSpent)}</span>
            {budgetAmount != null && (
              <span className="text-[13px] font-semibold t-tertiary ml-1">
                of {formatINR(budgetAmount)}
              </span>
            )}
          </div>
        </div>
        {left != null && (
          <div
            className="text-right text-[12px] font-semibold"
            style={{ color: over ? "var(--red)" : "var(--text-tertiary)" }}
          >
            <span
              className="block text-[16px] font-bold num"
              style={{ color: over ? "var(--red)" : "var(--text)" }}
            >
              {over ? formatINR(-left) : formatINR(left)}
            </span>
            {over ? "over" : "left"}
          </div>
        )}
      </div>

      <div className="px-5 pt-4 flex gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`chip ${filter === f.key ? "active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="px-5 mt-1 pb-4">
        {groups.length === 0 && (
          <div className="card p-6 text-center">
            <p className="text-[13.5px] font-bold mb-1">Nothing here yet</p>
            <p className="text-[12.5px] font-semibold t-secondary">
              Transactions in this category will show up here.
            </p>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.label}>
            <div
              className="text-[11px] font-bold uppercase t-tertiary pb-2 pt-4"
              style={{ letterSpacing: "0.05em" }}
            >
              {g.label}
            </div>
            <div className="flex flex-col gap-2">
              {g.items.map((r) => (
                <TransactionRow key={r.id} t={r} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
