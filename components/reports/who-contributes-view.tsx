"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { IconUsers } from "@tabler/icons-react";
import {
  categoryMeta,
  memberContribution,
  reportTransactions,
  summarizeMonth,
} from "@/lib/report";
import { formatINR } from "@/lib/format";
import { downloadCSV } from "@/lib/csv";
import type { Category, Transaction, UserRow } from "@/lib/types";
import ReportFrame from "@/components/reports/report-frame";
import ReportEmpty from "@/components/reports/report-empty";

export default function WhoContributesView({
  categories,
  txns,
  members,
}: {
  categories: Category[];
  txns: Transaction[];
  members: UserRow[];
}) {
  const catName = categoryMeta(categories);

  return (
    <ReportFrame
      title="Who's contributing what?"
      backHref="/app/reports"
      onExport={(r) => {
        const rows = memberContribution(txns, r.from, r.to, members).map((m) => [
          m.name,
          m.amount,
        ] as (string | number)[]);
        if (rows.length === 0) return;
        downloadCSV(
          `who-contributes-what-${r.from}--to-${r.to}.csv`,
          ["Member", "Spent (INR)"],
          rows,
        );
      }}
    >
      {(range) => {
        const rows = memberContribution(txns, range.from, range.to, members);
        const summary = summarizeMonth(
          reportTransactions(txns, range.from, range.to),
          catName,
        );
        if (rows.length === 0 || summary.expense <= 0) {
          return <ReportEmpty message="Nobody in the family spent in this period." />;
        }

        const top = rows[0];
        const totalSpend = rows.reduce((s, m) => s + m.amount, 0);

        return (
          <>
            <div className="card mx-5 mt-4 px-6 py-5">
              <div className="text-[11.5px] font-bold uppercase tracking-wide t-secondary">
                {range.label} · family
              </div>
              <div className="h-[180px] mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[...rows].reverse()}
                    layout="vertical"
                    margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
                    barCategoryGap="22%"
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={96}
                      reversed
                      tick={{ fontSize: 12, fill: "#1A1A18", fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Bar dataKey="amount" barSize={16} radius={[0, 5, 5, 0]} isAnimationActive={false}>
                      {[...rows].reverse().map((m, i) => (
                        <Cell key={i} fill={m.color} />
                      ))}
                      <LabelList
                        dataKey="amount"
                        position="right"
                        formatter={(v) => formatINR(Number(v))}
                        style={{ fontSize: 11, fill: "#8F8B81", fontWeight: 700 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card mx-5 mt-3 p-1.5">
              {rows.map((m, i) => {
                const pct = Math.round((m.amount / totalSpend) * 100);
                return (
                  <div
                    key={m.userId}
                    className={`flex items-center gap-3 rounded-lg px-3.5 py-3 ${
                      i > 0 ? "border-t" : ""
                    }`}
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="w-6 text-[12px] font-bold t-tertiary text-right">
                      {i + 1}
                    </span>
                    <span className="dot" style={{ background: m.color }} />
                    <span className="text-[13.5px] font-bold flex-1 min-w-0 truncate">
                      {m.name}
                    </span>
                    <span className="text-[13px] font-bold num w-[84px] text-right">
                      {formatINR(m.amount)}
                    </span>
                    <span className="text-[11.5px] font-bold t-tertiary w-9 text-right">
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>

            {top && (
              <div className="card mx-5 mt-3 p-4 flex items-start gap-2.5">
                <span className="t-secondary mt-0.5">
                  <IconUsers size={16} stroke={1.8} />
                </span>
                <p className="text-[13px] font-semibold leading-snug">
                  <span className="font-bold">{top.name}</span> recorded the most
                  spend this period — {formatINR(top.amount)}, a{" "}
                  {totalSpend > 0 ? Math.round((top.amount / totalSpend) * 100) : 0}% share of the
                  family total.
                </p>
              </div>
            )}
          </>
        );
      }}
    </ReportFrame>
  );
}