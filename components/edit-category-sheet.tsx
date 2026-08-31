"use client";

import { useState } from "react";
import { useEsc } from "@/components/use-esc";
import { useRouter } from "next/navigation";
import { IconX } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/lib/types";

const SWATCHES = ["#B0562F", "#C79A3A", "#4A7A5E", "#3E7CA6", "#7A6FA8", "#B0567F", "#5C6B73", "#8A867C"];

export default function EditCategorySheet({
  familyId,
  meId,
  category,
  budget,
  onClose,
}: {
  familyId: string;
  meId: string;
  category?: Category;
  budget?: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = category !== undefined;
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? SWATCHES[0]);
  const [hasBudget, setHasBudget] = useState((budget ?? 0) > 0);
  const [budgetAmt, setBudgetAmt] = useState(budget && budget > 0 ? String(budget) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveBudget(catId: string) {
    const amount = hasBudget ? Math.round(parseFloat(budgetAmt || "0") * 100) / 100 : null;
    const supabase = createClient();
    if (amount !== null && amount > 0) {
      const { error } = await supabase.from("budgets").upsert(
        {
          scope_type: "personal",
          scope_id: meId,
          category_id: catId,
          amount,
          period: "monthly",
        },
        { onConflict: "scope_type,scope_id,category_id,period" },
      );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("budgets")
        .delete()
        .eq("scope_type", "personal")
        .eq("scope_id", meId)
        .eq("category_id", catId)
        .eq("period", "monthly");
      if (error) throw new Error(error.message);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      if (editing) {
        const { error } = await supabase
          .from("categories")
          .update({ name: name.trim(), color })
          .eq("id", category.id);
        if (error) throw new Error(error.message);
        await saveBudget(category.id);
      } else {
        const { data, error } = await supabase
          .from("categories")
          .insert({ family_id: familyId, name: name.trim(), color, system: false, sort_order: 99 })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        await saveBudget(data.id);
      }
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  useEsc(true, onClose);

  return (
    <div
      className="sheet-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-category-title"
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="handle" />
        <div className="sheet-head">
          <h2 id="edit-category-title">{editing ? "Edit category" : "New category"}</h2>
          <button type="button" className="close-btn" aria-label="Close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div>
            <label className="field">
              <span className="field-label">Name</span>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rent"
                maxLength={40}
                required
              />
            </label>

            <div className="field">
              <span className="field-label">Colour</span>
              <div className="flex gap-2.5 flex-wrap">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colour ${c}`}
                    className="dot"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: c,
                      outline: color === c ? `2px solid var(--text)` : "none",
                      outlineOffset: 3,
                    }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>

            <div className="field">
              <div
                className="flex items-center justify-between px-4 py-3.5 rounded-xl border mb-2"
                style={{ borderColor: "var(--border)" }}
              >
                <span>
                  <span className="block text-[13.5px] font-bold">Monthly budget</span>
                  <span className="block text-[11.5px] font-semibold t-tertiary mt-0.5">
                    Your personal limit for this category
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={hasBudget}
                  aria-label="Set a monthly budget for this category"
                  className="w-11 h-6 rounded-full relative transition-colors"
                  style={{ background: hasBudget ? "var(--green)" : "rgba(0,0,0,0.12)" }}
                  onClick={() => setHasBudget((v) => !v)}
                >
                  <span
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                    style={{ left: hasBudget ? 22 : 2 }}
                  />
                </button>
              </div>
              {hasBudget && (
                <input
                  className="input num"
                  inputMode="decimal"
                  aria-label="Monthly budget amount in rupees"
                  value={budgetAmt}
                  onChange={(e) => setBudgetAmt(e.target.value)}
                  placeholder="e.g. 10000"
                />
              )}
            </div>

            {error && <p className="text-[12.5px] font-semibold t-red mb-3">{error}</p>}

            <button className="btn btn-primary w-full" disabled={busy || !name.trim()}>
              {busy ? "Saving…" : editing ? "Save changes" : "Add category"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}