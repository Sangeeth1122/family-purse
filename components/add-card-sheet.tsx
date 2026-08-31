"use client";

import { useState } from "react";
import { useEsc } from "@/components/use-esc";
import { useRouter } from "next/navigation";
import { IconPlus, IconX } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import type { Card } from "@/lib/types";

function CardSheetBody({ card, onDone }: { card?: Card | null; onDone: () => void }) {
  const router = useRouter();
  const editing = !!card;
  const [name, setName] = useState(card?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const supabase = createClient();
    if (editing) {
      const { error: err } = await supabase
        .from("credit_cards")
        .update({ name: name.trim() })
        .eq("id", card.id);
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
      onDone();
      router.refresh();
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      setError("You need to sign in again.");
      return;
    }
    const { error: err } = await supabase.from("credit_cards").insert({
      user_id: user.id,
      name: name.trim(),
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      <label className="field">
        <span className="field-label">Card name</span>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. HDFC Millennia"
          maxLength={40}
          autoFocus
          required
        />
      </label>
      <p className="text-[11px] font-semibold t-tertiary mb-4">
        Just a name to tag spends to — no card numbers needed.
      </p>

      {error && <p className="text-[12.5px] font-semibold t-red mb-3">{error}</p>}

      <button className="btn btn-primary w-full" disabled={busy || !name.trim()}>
        {busy ? "Saving…" : editing ? "Save changes" : "Add card"}
      </button>
    </form>
  );
}

/** Card add/edit sheet. Controlled — render the trigger yourself. */
export default function AddCardSheet({
  open,
  onClose,
  card,
}: {
  open: boolean;
  onClose: () => void;
  card?: Card | null;
}) {
  useEsc(open, onClose);
  if (!open) return null;
  return (
    <div
      className="sheet-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-card-title"
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="handle" />
        <div className="sheet-head">
          <h2 id="add-card-title">{card ? "Edit card" : "Add card"}</h2>
          <button type="button" className="close-btn" aria-label="Close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>
        <CardSheetBody card={card} onDone={onClose} />
      </div>
    </div>
  );
}

/** Header "+" button that opens the Add Card sheet (cards list page). */
export function AddCardButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="icon-btn"
        aria-label="Add card"
        onClick={() => setOpen(true)}
      >
        <IconPlus size={18} />
      </button>
      <AddCardSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}