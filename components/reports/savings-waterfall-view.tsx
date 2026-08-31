"use client";

import { useMemo } from "react";
import { IconBulb } from "@tabler/icons-react";
import {
  categoryMeta,
  reportTransactions,
  summarizeMonth,
  waterfallLayout,
  waterfallSteps,
} from "@/lib/report";
import { downloadCSV } from "@/lib/csv";
import { formatINR, formatSigned } from "@/lib/format";
import type { Category, Transaction } from "@/lib/types";
import ReportFrame from "@/components/reports/report-frame";
import ReportEmpty from "@/components/reports/report-empty";

const BAR_W = 36;

export default function SavingsWaterfallView({
  categories,
  txns,
}: {
  categories: Category[];
  txns: Transaction[];
}) {
  const catName = useMemo(() => categoryMeta(categories), [categories]);

  return (
    <ReportFrame
      title="Where did the savings come from?"
      backHref="/app/reports"
      onExport={(r) => {
        const summary = summarizeMonth(
          reportTransactions(txns, r.from, r.to),
          catName,
        );
        if (summary.income === 0 && summary.expense === 0) return;
        const steps = waterfallSteps(summary);
        const rows: (string | number)[][] = [];
        for (const s of steps) {
          rows.push([
            s.kind === "net" ? "Net savings" : s.name,
            s.kind === "expense" ? -s.amount : s.amount,
          ]);
        }
        downloadCSV(
          `savings-waterfall-${r.from}--to-${r.to}.csv`,
          ["Step", "Amount (INR)"],
          rows,
        );
      }}
    >
      {(range) => {
        const summary = summarizeMonth(
          reportTransactions(txns, range.from, range.to),
          catName,
        );
        if (summary.income === 0 && summary.expense === 0) {
          return <ReportEmpty message="No activity in this period." />;
        }

        const steps = waterfallSteps(summary);
        const layout = waterfallLayout(steps);
        const topCat =
          summary.byCategory.length > 0 ? summary.byCategory[0] : null;

        return (
          <>
            <div className="card mx-5 mt-4 p-5 flex flex-col items-center">
              <div className="w-full flex items-start justify-between mb-2">
                <div className="text-[12.5px] font-semibold t-secondary">
                  Income cascading to net savings
                </div>
                <div className="text-right">
                  <span className="text-[18px] font-bold num block t-green">
                    {formatSigned(summary.net)}
                  </span>
                  <span className="text-[11px] t-tertiary font-semibold block">
                    net savings
                  </span>
                </div>
              </div>

              <svg
                viewBox={`0 0 ${layout.viewW} ${layout.viewH}`}
                className="w-full h-auto block mt-2"
                aria-label="Cashflow waterfall"
              >
                {[0.25, 0.5, 0.75].map((f) => {
                  const gridY =
                    layout.bars[0].y +
                    f * (layout.baselineY - layout.bars[0].y);
                  return (
                    <line
                      key={f}
                      x1={0}
                      x2={layout.viewW}
                      y1={gridY}
                      y2={gridY}
                      stroke="rgba(0,0,0,0.07)"
                      strokeWidth={1}
                    />
                  );
                })}
                <line
                  x1={0}
                  x2={layout.viewW}
                  y1={layout.baselineY}
                  y2={layout.baselineY}
                  stroke="#A8A398"
                  strokeWidth={1}
                />

                {layout.connectors.map((c, i) => (
                  <line
                    key={`c${i}`}
                    x1={c.x1}
                    x2={c.x2}
                    y1={c.y}
                    y2={c.y}
                    stroke="var(--text-tertiary)"
                    strokeWidth={1}
                    strokeDasharray="2,3"
                  />
                ))}

                {layout.bars.map((b, i) => {
                  const isBookend = b.kind !== "expense";
                  const value =
                    b.kind === "expense"
                      ? `−${formatINR(b.amount)}`
                      : formatSigned(b.amount);
                  return (
                    <g key={i}>
                      {b.height > 0 && (
                        <rect
                          x={b.x}
                          y={b.y}
                          width={BAR_W}
                          height={b.height}
                          rx={5}
                          fill={b.color}
                        />
                      )}
                      <text
                        x={b.x + BAR_W / 2}
                        y={
                          b.kind === "net" && b.amount < 0
                            ? b.y + b.height + 10
                            : b.y - 6
                        }
                        textAnchor="middle"
                        fontSize={9}
                        fontWeight={700}
                        fill={isBookend ? "var(--text)" : b.color}
                      >
                        {value}
                      </text>
                      <text
                        x={b.x + BAR_W / 2}
                        y={layout.baselineY + 13}
                        textAnchor="middle"
                        fontSize={8}
                        fontWeight={700}
                        fill="var(--text-tertiary)"
                      >
                        {b.kind === "income"
                          ? "Income"
                          : b.kind === "net"
                            ? "Net"
                            : b.name.slice(0, 6)}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <div className="w-full mt-4 flex flex-col gap-2.5">
                {summary.byCategory.map((c) => (
                  <div
                    key={c.categoryId ?? "uncategorised"}
                    className="flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="dot" style={{ background: c.color }} />
                      <span className="text-[13.5px] font-semibold">
                        {c.name}
                      </span>
                    </span>
                    <span className="text-[13.5px] font-bold num">
                      −{formatINR(c.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {topCat && summary.income > 0 && (
              <div className="card mx-5 mt-3 p-4 flex items-start gap-2.5">
                <span className="t-secondary mt-0.5">
                  <IconBulb size={16} stroke={1.8} />
                </span>
                <p className="text-[13px] font-semibold leading-snug">
                  <span className="font-bold">{topCat.name}</span> took the
                  single biggest bite out of income this period —{" "}
                  <span className="font-bold">
                    {Math.round((topCat.amount / summary.income) * 100)}%
                  </span>{" "}
                  of the cascade.
                </p>
              </div>
            )}
          </>
        );
      }}
    </ReportFrame>
  );
}