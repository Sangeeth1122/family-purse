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
  onClose,
}: {
  familyId: string;
  meId: string;
  category?: Category;
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = category !== undefined;
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? SWATCHES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          .eq("id", category!.id);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase
          .from("categories")
          .insert({ family_id: familyId, name: name.trim(), color, system: false, sort_order: 99 })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
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
      <div className="sheet sheet-category" onClick={(e) => e.stopPropagation()}>
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
              <div className="flex gap-3 flex-wrap">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colour ${c}`}
                    className="dot"
                    style={{
                      width: 34,
                      height: 34,
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