"use client";

import { useEffect, useState } from "react";
import { IconBookmark, IconTrash, IconX } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { useEsc } from "@/components/use-esc";

export type PresetFilter = {
  scope: "whole_family";
  period: "this" | "last" | "custom";
  from: string;
  to: string;
  categories: string[];
  groupBy: null;
};

export type ReportPreset = {
  id: string;
  name: string;
  filters: PresetFilter;
  created_at: string;
};

export default function PresetSheet({
  open,
  onClose,
  current,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  current: { period: string; from: string; to: string };
  onApply: (filters: PresetFilter) => void;
}) {
  const [presets, setPresets] = useState<ReportPreset[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEsc(open, onClose);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    createClient()
      .from("report_presets")
      .select("*")
      .order("created_at")
      .then(({ data, error }) => {
        if (cancelled) return;
        setPresets(((data ?? []) as ReportPreset[]).sort((a, b) =>
          a.name.localeCompare(b.name),
        ));
        setError(error ? "Couldn't load saved filters." : null);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const canSave = name.trim().length > 0 && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const filters: PresetFilter = {
      scope: "whole_family",
      period: current.period as PresetFilter["period"],
      from: current.from,
      to: current.to,
      categories: [],
      groupBy: null,
    };
    const { error: err } = await createClient().from("report_presets").insert({
      name: name.trim(),
      filters,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setName("");
    onClose();
  }

  async function remove(id: string) {
    await createClient().from("report_presets").delete().eq("id", id);
    setPresets((p) => p.filter((x) => x.id !== id));
  }

  return (
    <div className="sheet-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="preset-sheet-title">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="handle" />
        <div className="sheet-head">
          <h2 id="preset-sheet-title">Saved filters</h2>
          <button type="button" className="close-btn" aria-label="Close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>

        <div className="px-5 pt-2">
          <label className="field">
            <span className="field-label">Current filters</span>
            <div className="flex items-center gap-2">
              <input
                className="input flex-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name for this range, e.g. August budget review"
                maxLength={60}
              />
              <button
                type="button"
                className={`btn ${canSave ? "btn-primary" : "btn-secondary"} shrink-0`}
                disabled={!canSave}
                onClick={save}
              >
                <IconBookmark size={15} />
                Save
              </button>
            </div>
            <div className="field-hint">
              {current.period === "custom"
                ? `${current.from} → ${current.to}`
                : current.period === "this"
                  ? "This month"
                  : "Last month"}
              {" · whole family"}
            </div>
          </label>

          {error && (
            <p className="text-[12px] font-semibold t-red mb-2">{error}</p>
          )}

          {presets.length === 0 ? (
            <p className="text-[12.5px] font-semibold t-tertiary text-center py-5">
              No saved filters yet. Give the current range a name above and
              bookmark it for next time.
            </p>
          ) : (
            <div className="card p-1.5 mb-2">
              {presets.map((p, i) => {
                const f = p.filters;
                const rangeLabel =
                  f.period === "custom"
                    ? `${f.from} → ${f.to}`
                    : f.period === "this"
                      ? "This month"
                      : "Last month";
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-1.5 rounded-lg py-1 pr-1 pl-3 ${
                      i > 0 ? "border-t" : ""
                    }`}
                    style={{ borderColor: "var(--border)" }}
                  >
                    <button
                      type="button"
                      className="flex items-center gap-3 rounded-lg py-2 flex-1 min-w-0 text-left"
                      onClick={() => {
                        onApply(f);
                        onClose();
                      }}
                    >
                      <span className="h-8 w-8 rounded-lg bg-black/5 flex items-center justify-center shrink-0">
                        <IconBookmark size={15} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13.5px] font-bold truncate">
                          {p.name}
                        </span>
                        <span className="block text-[11.5px] font-semibold t-tertiary mt-0.5">
                          {rangeLabel}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Delete ${p.name}`}
                      onClick={() => remove(p.id)}
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <p className="field-hint">
            Saved filters are private to your account and persist across
            report types.
          </p>
        </div>
      </div>
    </div>
  );
}