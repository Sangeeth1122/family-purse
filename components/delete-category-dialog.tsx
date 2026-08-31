"use client";

import { useState } from "react";
import { useEsc } from "@/components/use-esc";
import { useRouter } from "next/navigation";
import { IconInbox, IconTrash } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/lib/types";

export default function DeleteCategoryDialog({
  category,
  options,
  tagged,
  onClose,
}: {
  category: Category;
  options: Category[];
  tagged: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsReassign = tagged > 0;

  async function onDelete() {
    setError(null);
    setBusy(true);
    const { error: err } = await createClient().rpc("fp_delete_category", {
      p_category: category.id,
      p_reassign_to: needsReassign && target ? target : null,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    onClose();
    router.refresh();
  }

  useEsc(true, onClose);

  return (
    <div
      className="dialog-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-category-title"
    >
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="w-12 h-12 rounded-full bg-[rgba(176,86,47,0.12)] flex items-center justify-center mx-auto mb-3.5">
          <IconTrash size={22} className="t-red" />
        </div>
        <h2 id="delete-category-title" className="text-[16px] font-bold mb-2 text-center">Delete {category.name}?</h2>

        {needsReassign ? (
          <>
            <p className="text-[13.5px] font-medium t-secondary leading-relaxed text-center mb-4">
              {tagged} P&amp;L {tagged === 1 ? "transaction uses" : "transactions use"} it.
              Reassign them to another category before deleting — their amounts stay
              exactly as recorded, just with a new label.
            </p>
            <label className="field">
              <span className="field-label">Move transactions to</span>
              <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Choose a category…</option>
                {options
                  .filter((c) => c.id !== category.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <p className="field-hint mx-5 -mt-2 mb-4">
              Any budget set for {category.name} is removed when the category goes.
            </p>
          </>
        ) : (
          <p className="text-[13.5px] font-medium t-secondary leading-relaxed text-center mb-5">
            No transactions use it right now, so this is clean. Any budget set for it
            is removed too.
          </p>
        )}

        {error && <p className="text-[12.5px] font-semibold t-red text-center mb-3">{error}</p>}

        <div className="flex gap-2.5 mt-3">
          <button type="button" className="btn btn-secondary flex-1" onClick={onClose} disabled={busy}>
            Keep
          </button>
          <button
            type="button"
            className="btn btn-red flex-1"
            disabled={busy || (needsReassign && !target)}
            onClick={onDelete}
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>

        {needsReassign && !target && (
          <p className="flex items-center gap-1.5 text-[11.5px] font-semibold t-tertiary mt-3">
            <IconInbox size={13} /> Pick a category first — deletion is blocked until
            every transaction has a home.
          </p>
        )}
      </div>
    </div>
  );
}