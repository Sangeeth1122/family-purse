"use client";

import { useState } from "react";
import { useEsc } from "@/components/use-esc";
import { useRouter } from "next/navigation";
import { IconPlus, IconX } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";

const SWATCHES = ["#B0562F", "#C79A3A", "#4A7A5E", "#3E7CA6", "#7A6FA8", "#B0567F", "#5C6B73", "#8A867C"];

export default function AddCategorySheet({ familyId }: { familyId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await createClient().from("categories").insert({
      family_id: familyId,
      name: name.trim(),
      color,
      system: false,
      sort_order: 99,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setName("");
    setColor(SWATCHES[0]);
    setOpen(false);
    router.refresh();
  }

  useEsc(open, () => setOpen(false));

  return (
    <>
      <button type="button" className="btn btn-ghost w-full" onClick={() => setOpen(true)}>
        <IconPlus size={16} /> Add category
      </button>

      {open && (
        <div
          className="sheet-overlay"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-category-title"
        >
          <div className="sheet sheet-category" onClick={(e) => e.stopPropagation()}>
            <div className="handle" />
            <div className="sheet-head">
              <h2 id="add-category-title">Add category</h2>
              <button type="button" className="close-btn" aria-label="Close" onClick={() => setOpen(false)}>
                <IconX size={16} />
              </button>
            </div>
            <form onSubmit={onSubmit}>
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
                {busy ? "Saving…" : "Add category"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}