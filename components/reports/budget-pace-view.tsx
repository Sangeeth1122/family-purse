"use client";

import { useMemo } from "react";
import { IconTargetArrow } from "@tabler/icons-react";
import {
  budgetPace,
  categoryMeta,
} from "@/lib/report";
import { formatINR } from "@/lib/format";
import { downloadCSV } from "@/lib/csv";
import type { Category, LegacyBudget, Transaction } from "@/lib/types";
import ReportFrame from "@/components/reports/report-frame";
import ReportEmpty from "@/components/reports/report-empty";

export default function BudgetPaceView({
  categories,
  txns,
  budgets,
}: {
  categories: Category[];
  txns: Transaction[];
  budgets: LegacyBudget[];
}) {
  const catName = useMemo(() => categoryMeta(categories), [categories]);

  return (
    <ReportFrame
      title="Are we on pace with budget?"
      backHref="/app/reports"
      onExport={(r) => {
        const pace = budgetPace(txns, r.from, r.to, budgets, catName);
        if (pace.length === 0) return;
        const rows = pace.map((p) => [p.name, p.budget, p.spent] as (string | number)[]);
        downloadCSV(
          `budget-pace-${r.from}--to-${r.to}.csv`,
          ["Category", "Budget (INR)", "Spent (INR)"],
          rows,
        );
      }}
    >
      {(range) => {
        const pace = budgetPace(txns, range.from, range.to, budgets, catName);
        if (pace.length === 0) {
          return (
            <ReportEmpty message="No budgets apply to this period." />
          );
        }

        const spentTotal = pace.reduce((s, p) => s + p.spent, 0);
        const budgetTotal = pace.reduce((s, p) => s + p.budget, 0);
        const overRows = pace.filter((p) => p.over);
        const insight =
          overRows.length > 0
            ? `${overRows[0].name} is over its ${formatINR(overRows[0].budget)} budget by ${formatINR(overRows[0].spent - overRows[0].budget)}.`
            : pace[0]
              ? `${pace[0].name} is closest to its budget at ${Math.round((pace[0].spent / pace[0].budget) * 100)}%.`
              : null;

        return (
          <>
            <div className="card mx-5 mt-4 px-6 py-5">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-bold uppercase tracking-wide t-secondary">
                  {range.label}
                </span>
                <span className="text-[13px] font-bold num t-secondary">
                  {formatINR(spentTotal)} / {formatINR(budgetTotal)}
                </span>
              </div>
              <div className="bar-track mt-3">
                <div
                  className="bar-fill"
                  style={{
                    width: `${Math.min(100, (spentTotal / Math.max(budgetTotal, 1)) * 100)}%`,
                    background: overRows.length > 0 ? "var(--red)" : "var(--green)",
                  }}
                />
              </div>

              <div className="mt-5 flex flex-col gap-4">
                {pace.map((p) => {
                  const pct = Math.min(100, (p.spent / p.budget) * 100);
                  return (
                    <div key={p.categoryId ?? "uncategorised"}>
                      <div className="flex items-center justify-between gap-3 min-w-0">
                        <span className="flex items-center gap-2.5 min-w-0">
                          <span className="dot" style={{ background: p.color }} />
                          <span className="text-[13.5px] font-semibold truncate">
                            {p.name}
                          </span>
                        </span>
                        <span className="flex items-baseline gap-2 flex-shrink-0">
                          <span className="text-[12px] font-bold num w-[84px] text-right">
                            {formatINR(p.spent)}
                          </span>
                          <span className="text-[11.5px] font-bold t-tertiary">
                            / {formatINR(p.budget)}
                          </span>
                        </span>
                      </div>
                      <div className="bar-track mt-1.5">
                        <div
                          className="bar-fill"
                          style={{ width: `${pct}%`, background: p.color }}
                        />
                      </div>
                      {p.over && (
                        <div className="flex items-center gap-1.5 text-[11px] font-bold t-red mt-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--red)]" />
                          {formatINR(p.spent - p.budget)} over budget
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {insight && (
              <div className="card mx-5 mt-3 p-4 flex items-start gap-2.5">
                <span className="t-secondary mt-0.5">
                  <IconTargetArrow size={16} stroke={1.8} />
                </span>
                <p className="text-[13px] font-semibold leading-snug">{insight}</p>
              </div>
            )}
          </>
        );
      }}
    </ReportFrame>
  );
}