"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  IconAdjustmentsHorizontal,
  IconArrowLeft,
  IconBookmark,
  IconDownload,
  IconUsers,
} from "@tabler/icons-react";
import { reportMonthRange, type ReportRange } from "@/lib/report";
import PresetSheet, { type PresetFilter } from "@/components/reports/preset-sheet";

/**
 * Shared Report Detail shell (mockups 20/20b/20c): back topbar, period filter
 * pills (This month / Last month / Custom range) + whole-family scope chip,
 * chart body, and the Custom range / Export CSV action row. The single
 * control is reused across every report type so filter changes recalculate
 * each chart from its own data rather than relabelling.
 */
export default function ReportFrame({
  title,
  backHref,
  onExport,
  children,
}: {
  title: string;
  backHref: string;
  onExport: (range: ReportRange) => void;
  children: (range: ReportRange) => React.ReactNode;
}) {
  const [period, setPeriod] = useState<"this" | "last" | "custom">("this");
  const defaultCustom = useMemo(() => reportMonthRange(0), []);
  const [customRange, setCustomRange] = useState<{ from: string; to: string }>(
    () => ({ from: defaultCustom.from, to: defaultCustom.to }),
  );
  const fromRef = useRef<HTMLInputElement>(null);

  const range: ReportRange =
    period === "this"
      ? reportMonthRange(0)
      : period === "last"
        ? reportMonthRange(-1)
        : {
            from: customRange.from,
            to: customRange.to,
            label: `${customRange.from} → ${customRange.to}`,
          };

  const openMoreFilters = () => {
    if (period !== "custom") {
      setPeriod("custom");
      requestAnimationFrame(() => fromRef.current?.focus());
    } else {
      fromRef.current?.focus();
    }
  };

  const [presetsOpen, setPresetsOpen] = useState(false);

  const applyPreset = (f: PresetFilter) => {
    setPeriod(f.period);
    if (f.from && f.to) setCustomRange({ from: f.from, to: f.to });
  };

  const pills = [
    { key: "this", label: "This month" },
    { key: "last", label: "Last month" },
    { key: "custom", label: "Custom range" },
  ] as const;

  return (
    <div className="min-h-screen pb-24">
      <header className="flex items-center gap-3 justify-between px-5 pt-6 pb-1">
        <div className="flex items-center gap-3">
          <Link href={backHref} className="icon-btn" aria-label="Back">
            <IconArrowLeft size={18} stroke={2} />
          </Link>
          <h1 className="text-[16px] font-bold">{title}</h1>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Saved report filters"
          onClick={() => setPresetsOpen(true)}
        >
          <IconBookmark size={18} stroke={2} />
        </button>
      </header>

      <div className="flex gap-2 px-5 pt-4 overflow-x-auto">
        {pills.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`chip ${period === p.key ? "active" : ""}`}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
        <span className="chip flex items-center gap-1.5 cursor-default">
          <IconUsers size={12} stroke={2} />
          Whole family
        </span>
      </div>

      {period === "custom" && (
        <div className="flex items-center gap-2 px-5 pt-3">
          <input
            ref={fromRef}
            type="date"
            className="input flex-1"
            value={customRange.from}
            max={customRange.to}
            onChange={(e) =>
              setCustomRange({ ...customRange, from: e.target.value })
            }
          />
          <span className="t-tertiary font-bold">→</span>
          <input
            type="date"
            className="input flex-1"
            value={customRange.to}
            min={customRange.from}
            onChange={(e) =>
              setCustomRange({ ...customRange, to: e.target.value })
            }
          />
        </div>
      )}

      {children(range)}

      <div className="flex gap-2.5 mx-5 mt-5">
        <button
          type="button"
          className="btn btn-secondary flex-1"
          onClick={openMoreFilters}
        >
          <IconAdjustmentsHorizontal size={16} stroke={2} />
          Custom range
        </button>
        <button
          type="button"
          className="btn btn-primary flex-1"
          onClick={() => onExport(range)}
        >
          <IconDownload size={16} stroke={2} />
          Export CSV
        </button>
      </div>

      <PresetSheet
        open={presetsOpen}
        onClose={() => setPresetsOpen(false)}
        current={{ period, from: range.from, to: range.to }}
        onApply={applyPreset}
      />
    </div>
  );
}

export type { ReportRange };