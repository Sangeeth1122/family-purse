"use client";

import { useMemo, useState } from "react";
import { IconBulb } from "@tabler/icons-react";
import {
  categoryMeta,
  dailySpend,
} from "@/lib/report";
import { downloadCSV } from "@/lib/csv";
import { formatINR } from "@/lib/format";
import type { Category, Transaction } from "@/lib/types";
import ReportFrame from "@/components/reports/report-frame";
import ReportEmpty from "@/components/reports/report-empty";

const HEAT = "176,86,47";
const HEAT_ALPHAS = [0.14, 0.3, 0.52, 0.75, 1];

function intensity(amount: number, max: number): number {
  if (amount <= 0 || max <= 0) return 0;
  const q = amount / max;
  if (q > 0.75) return 5;
  if (q > 0.52) return 4;
  if (q > 0.3) return 3;
  if (q > 0.14) return 2;
  return 1;
}

/** Local-timezone-safe YYYY-MM-DD key. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function SpendCalendarView({
  categories,
  txns,
}: {
  categories: Category[];
  txns: Transaction[];
}) {
  const catName = useMemo(() => categoryMeta(categories), [categories]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  return (
    <ReportFrame
      title="When do we actually spend?"
      backHref="/app/reports"
      onExport={(r) => {
        const buckets = new Map(
          dailySpend(txns, r.from, r.to, catName).map((b) => [b.date, b]),
        );
        const rows: (string | number)[][] = [];
        const start = new Date(`${r.from}T00:00:00`);
        const end = new Date(`${r.to}T00:00:00`);
        for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const b = buckets.get(dayKey(d));
          if (b) {
            rows.push([
              dayKey(d),
              d.toLocaleDateString("en-IN", { weekday: "short" }),
              b.total,
            ]);
          }
        }
        downloadCSV(
          `spend-calendar-${r.from}--to-${r.to}.csv`,
          ["Date", "Day", "Spend (INR)"],
          rows,
        );
      }}
    >
      {(range) => {
        const buckets = dailySpend(txns, range.from, range.to, catName);
        const byDay = new Map(buckets.map((b) => [b.date, b]));
        const maxDay = buckets.reduce((m, b) => Math.max(m, b.total), 0);

        if (range.from > range.to) {
          return (
            <ReportEmpty
              message="Invalid date range."
              hint="The custom range start is after its end."
            />
          );
        }
        if (maxDay <= 0) {
          return (
            <ReportEmpty
              message="No spending in this period."
              hint="Days without transactions stay blank — try another period."
            />
          );
        }

        const start = new Date(`${range.from}T00:00:00`);
        const end = new Date(`${range.to}T00:00:00`);
        const leadEmpty = (start.getDay() + 6) % 7;
        const days: { key: string; num: number }[] = [];
        for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          days.push({ key: dayKey(d), num: d.getDate() });
        }
        const trail = (7 - ((leadEmpty + days.length) % 7)) % 7;

        const defaultKey = buckets.reduce(
          (best, b) => (b.total > best.total ? b : best),
          buckets[0],
        ).date;

        const selectedKey = selectedDay ?? defaultKey;
        const selected = byDay.get(selectedKey) ?? null;

        const periodTotal = buckets.reduce((s, b) => s + b.total, 0);

        // Weekend vs weekday average spend.
        let wkdAmt = 0, wkdCount = 0, wknAmt = 0, wknCount = 0;
        for (const b of buckets) {
          const dow = new Date(`${b.date}T00:00:00`).getDay();
          if (dow === 0 || dow === 6) {
            wknAmt += b.total;
            wknCount++;
          } else {
            wkdAmt += b.total;
            wkdCount++;
          }
        }
        const wknAvg = wknCount > 0 ? wknAmt / wknCount : null;
        const wkdAvg = wkdCount > 0 ? wkdAmt / wkdCount : null;
        const weekendHigher =
          wknAvg !== null && wkdAvg !== null && wknAvg > wkdAvg;
        const spread =
          wknAvg !== null && wkdAvg !== null && wknAvg !== wkdAvg
            ? Math.round(
                (Math.max(wknAvg, wkdAvg) / Math.min(wknAvg, wkdAvg) - 1) *
                  100,
              )
            : null;

        return (
          <>
            <div className="card mx-5 mt-4 px-6 py-5 flex flex-col items-center">
              <div className="w-full flex items-start justify-between mb-4">
                <div className="text-[12.5px] font-semibold t-secondary">
                  Spending by day
                </div>
                <div className="text-right">
                  <span className="text-[18px] font-bold num block">
                    {formatINR(periodTotal)}
                  </span>
                  <span className="text-[11px] t-tertiary font-semibold block">
                    this period
                  </span>
                </div>
              </div>

              <div className="w-full grid grid-cols-7 mb-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <span
                    key={d}
                    className="text-[10px] font-bold t-tertiary text-center"
                  >
                    {d}
                  </span>
                ))}
              </div>

              <div className="w-full grid grid-cols-7 gap-[5px]">
                {Array.from({ length: leadEmpty }).map((_, i) => (
                  <div key={`lead-${i}`} className="invisible aspect-square" />
                ))}
                {days.map((d) => {
                  const b = byDay.get(d.key);
                  const lvl = intensity(b?.total ?? 0, maxDay);
                  const isSelected = selectedKey === d.key;
                  return (
                    <button
                      key={d.key}
                      type="button"
                      aria-label={`${d.key}${b ? `, ${formatINR(b.total)}` : ", no spend"}`}
                      className="aspect-square rounded-[7px] border flex items-center justify-center relative"
                      style={{
                        background:
                          lvl === 0
                            ? "var(--card)"
                            : `rgba(${HEAT},${HEAT_ALPHAS[lvl - 1]})`,
                        color:
                          lvl === 0
                            ? "var(--text-tertiary)"
                            : lvl <= 2
                              ? "var(--text)"
                              : "#fff",
                        borderColor: "var(--border)",
                        outline: isSelected
                          ? "2px solid var(--text)"
                          : "none",
                        outlineOffset: 1,
                      }}
                      onClick={() => setSelectedDay(b?.date ?? null)}
                    >
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold opacity-75">
                        {d.num}
                      </span>
                    </button>
                  );
                })}
                {Array.from({ length: trail }).map((_, i) => (
                  <div key={`trail-${i}`} className="invisible aspect-square" />
                ))}
              </div>

              <div className="w-full flex items-center justify-end gap-1.5 mt-4">
                <span className="text-[10px] font-semibold t-tertiary">
                  Less
                </span>
                <span className="flex gap-[3px]">
                  {[0, 1, 2, 3, 4, 5].map((l) => (
                    <span
                      key={l}
                      className="w-3 h-3 rounded-[3px] border border-black/10"
                      style={{
                        background:
                          l === 0
                            ? "var(--card)"
                            : `rgba(${HEAT},${HEAT_ALPHAS[l - 1]})`,
                      }}
                    />
                  ))}
                </span>
                <span className="text-[10px] font-semibold t-tertiary">
                  More
                </span>
              </div>
            </div>

            {selected && (
              <div className="card mx-5 mt-3 p-5 flex items-center justify-between">
                <div>
                  <div className="text-[12px] font-semibold t-secondary mb-1">
                    {new Date(`${selected.date}T00:00:00`).toLocaleDateString(
                      "en-IN",
                      {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      },
                    )}
                  </div>
                  <div className="text-[13.5px] font-semibold flex items-center gap-x-3 gap-y-1 flex-wrap">
                    {selected.categories.slice(0, 3).map((c) => (
                      <span key={c.categoryId ?? "u"} className="flex items-center gap-1.5">
                        <span className="dot" style={{ background: c.color }} />
                        {c.name}
                      </span>
                    ))}
                    {selected.categories.length > 3 && (
                      <span className="t-tertiary font-semibold">
                        +{selected.categories.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-[18px] font-bold num">
                  {formatINR(selected.total)}
                </div>
              </div>
            )}

            {spread !== null && (
              <div className="card mx-5 mt-3 p-4 flex items-start gap-2.5">
                <span className="t-secondary mt-0.5">
                  <IconBulb size={16} stroke={1.8} />
                </span>
                <p className="text-[13px] font-semibold leading-snug">
                  {weekendHigher ? (
                    <>
                      Weekend days average{" "}
                      <span className="font-bold">{spread}% higher spend</span>{" "}
                      than weekdays this period.
                    </>
                  ) : (
                    <>
                      Weekday days average{" "}
                      <span className="font-bold">{spread}% higher spend</span>{" "}
                      than weekends this period.
                    </>
                  )}
                </p>
              </div>
            )}
          </>
        );
      }}
    </ReportFrame>
  );
}