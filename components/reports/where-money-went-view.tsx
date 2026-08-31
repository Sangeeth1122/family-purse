"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { IconChartDonut4 } from "@tabler/icons-react";
import {
  categoryMeta,
  reportTransactions,
  summarizeMonth,
  type ReportRange,
} from "@/lib/report";
import { formatINR } from "@/lib/format";
import { downloadCSV } from "@/lib/csv";
import type { Category, Transaction } from "@/lib/types";
import ReportFrame from "@/components/reports/report-frame";
import ReportEmpty from "@/components/reports/report-empty";

const EXPORT_FILENAME = (r: ReportRange) =>
  `where-money-went-${r.from}--to-${r.to}.csv`;

export default function WhereMoneyWentView({
  categories,
  txns,
}: {
  categories: Category[];
  txns: Transaction[];
}) {
  const catName = useMemo(() => categoryMeta(categories), [categories]);

  return (
    <ReportFrame
      title="Where did the money go?"
      backHref="/app/reports"
      onExport={(r) => {
        const summary = summarizeMonth(
          reportTransactions(txns, r.from, r.to),
          catName,
        );
        if (summary.expense <= 0) return;
        const rows = summary.byCategory.map((c) => [
          c.name,
          c.amount,
          `${Math.round((c.amount / summary.expense) * 100)}%`,
        ] as (string | number)[]);
        downloadCSV(
          EXPORT_FILENAME(r),
          ["Category", "Amount (INR)", "Share"],
          rows,
        );
      }}
    >
      {(range) => {
        const summary = summarizeMonth(
          reportTransactions(txns, range.from, range.to),
          catName,
        );
        const total = summary.expense;
        if (total <= 0) {
          return (
            <ReportEmpty message="No spending in this period." />
          );
        }
        const data = summary.byCategory.map((c) => ({
          ...c,
          pct: Math.round((c.amount / total) * 100),
        }));
        const top = data[0];
        return (
          <>
            <div className="card mx-5 mt-4 p-5 flex flex-col items-center">
              <div className="relative w-full h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data}
                      dataKey="amount"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={84}
                      paddingAngle={1}
                      cornerRadius={4}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {data.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="text-[22px] font-bold num">
                    {formatINR(total)}
                  </div>
                  <div className="text-[11px] t-tertiary font-bold mt-0.5">
                    total spent
                  </div>
                </div>
              </div>

              <div className="w-full mt-5 flex flex-col gap-2.5">
                {data.map((d) => (
                  <div
                    key={d.categoryId ?? "uncategorised"}
                    className="flex items-center justify-between gap-3 min-w-0"
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className="dot" style={{ background: d.color }} />
                      <span className="text-[13.5px] font-semibold truncate">
                        {d.name}
                      </span>
                    </span>
                    <span className="flex items-baseline gap-2 flex-shrink-0">
                      <span className="text-[12px] font-bold t-tertiary w-8 text-right">
                        {d.pct}%
                      </span>
                      <span className="text-[13.5px] font-bold num w-[76px] text-right">
                        {formatINR(d.amount)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {top && (
              <div className="card mx-5 mt-3 p-4 flex items-start gap-2.5">
                <span className="t-secondary mt-0.5">
                  <IconChartDonut4 size={16} stroke={1.8} />
                </span>
                <p className="text-[13px] font-semibold leading-snug">
                  <span className="font-bold">{top.name}</span> took the biggest
                  slice — {top.pct}% of this period&apos;s spend.
                </p>
              </div>
            )}
          </>
        );
      }}
    </ReportFrame>
  );
}