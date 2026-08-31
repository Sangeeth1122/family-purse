"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { IconTrendingUp } from "@tabler/icons-react";
import {
  categoryMeta,
  reportTransactions,
  summarizeMonth,
  trendSeries,
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

export default function IncomeVsExpenseView({
  categories,
  txns,
}: {
  categories: Category[];
  txns: Transaction[];
}) {
  const catName = categoryMeta(categories);

  return (
    <ReportFrame
      title="How is income vs expense trending?"
      backHref="/app/reports"
      onExport={(r) => {
        const series = trendSeries(txns, r.from, r.to);
        if (series.length === 0) return;
        const rows = series.map((s) => [
          s.label,
          s.income,
          s.expense,
        ] as (string | number)[]);
        downloadCSV(
          `income-vs-expense-${r.from}--to-${r.to}.csv`,
          ["Period", "Income (INR)", "Expense (INR)"],
          rows,
        );
      }}
    >
      {(range) => {
        const series = trendSeries(txns, range.from, range.to);
        const summary = summarizeMonth(
          reportTransactions(txns, range.from, range.to),
          catName,
        );
        if (series.length === 0 || (summary.income === 0 && summary.expense === 0)) {
          return <ReportEmpty message="No activity in this period." />;
        }

        const topGap = series.reduce((best, s) => {
          const gap = s.income - s.expense;
          return gap > best.gap
            ? { gap, point: s.label }
            : best;
        }, { gap: -Infinity, point: "" });

        return (
          <>
            <div className="card mx-5 mt-4 p-5">
              <div className="h-[210px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={series}
                    margin={{ top: 6, right: 10, bottom: 0, left: -14 }}
                  >
                    <CartesianGrid
                      stroke="rgba(0,0,0,0.06)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "#8F8B81" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#8F8B81" }}
                      tickFormatter={shortAmount}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value) => formatINR(Number(value))}
                      labelStyle={{ color: "#1A1A18", fontWeight: 700, fontSize: 12 }}
                      contentStyle={{
                        background: "#FDFCFA",
                        border: "1px solid rgba(0,0,0,0.07)",
                        borderRadius: 10,
                        boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="income"
                      name="Income"
                      stroke="#4A7A5E"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#4A7A5E", strokeWidth: 0 }}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="expense"
                      name="Expense"
                      stroke="#B0562F"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#B0562F", strokeWidth: 0 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-4 mt-3">
                <span className="flex items-center gap-1.5 text-[11.5px] font-bold t-green">
                  <span className="w-2 h-2 rounded-full bg-[#4A7A5E]" />
                  Income
                </span>
                <span className="flex items-center gap-1.5 text-[11.5px] font-bold t-red">
                  <span className="w-2 h-2 rounded-full bg-[#B0562F]" />
                  Expense
                </span>
              </div>
            </div>

            {topGap.point !== "" && (
              <div className="card mx-5 mt-3 p-4 flex items-start gap-2.5">
                <span className="t-secondary mt-0.5">
                  <IconTrendingUp size={16} stroke={1.8} />
                </span>
                <p className="text-[13px] font-semibold leading-snug">
                  In <span className="font-bold">{topGap.point}</span> the gap
                  between income and expense was{" "}
                  <span className="font-bold num">{formatINR(topGap.gap)}</span>{" "}
                  — the widest this period
                  {summary.savingsRate !== null ? `, a ${summary.savingsRate}% savings rate` : ""}.
                </p>
              </div>
            )}
          </>
        );
      }}
    </ReportFrame>
  );
}