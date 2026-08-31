"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { IconArrowsLeftRight } from "@tabler/icons-react";
import {
  categoryMeta,
  previousRange,
  reportTransactions,
  summarizeMonth,
  vsLastPeriod,
} from "@/lib/report";
import { formatINR } from "@/lib/format";
import { downloadCSV } from "@/lib/csv";
import type { Category, Transaction } from "@/lib/types";
import ReportFrame from "@/components/reports/report-frame";
import ReportEmpty from "@/components/reports/report-empty";

const shortAmount = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 100000) return `₹${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `₹${Math.round(abs / 1000)}k`;
  return `₹${Math.round(abs)}`;
};

export default function VsLastPeriodView({
  categories,
  txns,
}: {
  categories: Category[];
  txns: Transaction[];
}) {
  const catName = useMemo(() => categoryMeta(categories), [categories]);

  return (
    <ReportFrame
      title="What changed vs last period?"
      backHref="/app/reports"
      onExport={(r) => {
        const deltas = vsLastPeriod(txns, r, catName);
        if (deltas.length === 0) return;
        const rows = deltas.map((d) => [
          d.name,
          d.current,
          d.delta,
        ] as (string | number)[]);
        downloadCSV(
          `vs-last-period-${r.from}--to-${r.to}.csv`,
          ["Category", "Spent this period (INR)", "Change vs previous (INR)"],
          rows,
        );
      }}
    >
      {(range) => {
        const deltas = vsLastPeriod(txns, range, catName);
        const summary = summarizeMonth(
          reportTransactions(txns, range.from, range.to),
          catName,
        );
        if (deltas.length === 0) {
          return (
            <ReportEmpty message="Nothing changed between this period and the one before it." />
          );
        }

        const more = deltas.filter((d) => d.delta > 0).reduce((s, d) => s + d.delta, 0);
        const less = -deltas.filter((d) => d.delta < 0).reduce((s, d) => s + d.delta, 0);
        const biggestMover = deltas[deltas.length - 1];
        const prevLabel = previousRange(range);

        return (
          <>
            <div className="card mx-5 mt-4 px-6 py-5">
              <div className="text-[11.5px] font-bold uppercase tracking-wide t-secondary">
                {range.label} vs {prevLabel.from.slice(0, 7)}
              </div>
              <div className="h-[220px] mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={deltas}
                    layout="vertical"
                    margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
                    barCategoryGap="22%"
                  >
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: "#8F8B81" }}
                      tickFormatter={shortAmount}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={112}
                      reversed
                      tick={{ fontSize: 12, fill: "#1A1A18" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <ReferenceLine x={0} stroke="#1A1A18" strokeWidth={1.5} />
                    <Bar dataKey="delta" barSize={14} isAnimationActive={false} radius={[0, 5, 5, 0]}>
                      {deltas.map((d, i) => (
                        <Cell
                          key={i}
                          fill={d.delta > 0 ? "var(--red)" : "var(--green)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-4 mt-3">
                <span className="flex items-center gap-1.5 text-[11.5px] font-bold t-green">
                  <span className="w-2 h-2 rounded-full bg-[var(--green)]" />
                  {formatINR(less)} spent less
                </span>
                <span className="flex items-center gap-1.5 text-[11.5px] font-bold t-red">
                  <span className="w-2 h-2 rounded-full bg-[var(--red)]" />
                  {formatINR(more)} spent more
                </span>
              </div>
            </div>

            {biggestMover && (
              <div className="card mx-5 mt-3 p-4 flex items-start gap-2.5">
                <span className="t-secondary mt-0.5">
                  <IconArrowsLeftRight size={16} stroke={1.8} />
                </span>
                <p className="text-[13px] font-semibold leading-snug">
                  <span className="font-bold">{biggestMover.name}</span> moved by{" "}
                  <span className="font-bold">
                    {formatINR(biggestMover.delta)}
                  </span>{" "}
                  {biggestMover.delta > 0 ? "more" : "less"} than the previous
                  period{summary.expense > 0 ? " — the largest swing of the month" : ""}.
                </p>
              </div>
            )}
          </>
        );
      }}
    </ReportFrame>
  );
}