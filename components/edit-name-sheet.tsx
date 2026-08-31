"use client";

import { useState } from "react";
import { useEsc } from "@/components/use-esc";
import { useRouter } from "next/navigation";
import { IconX } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";

export default function EditNameSheet({
  current,
  onClose,
}: {
  current: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await createClient()
      .from("users")
      .update({ name: name.trim() })
      .eq("id", (await createClient().auth.getUser()).data.user?.id ?? "");
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
      className="sheet-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-name-title"
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="handle" />
        <div className="sheet-head">
          <h2 id="edit-name-title">Edit name</h2>
          <button type="button" className="close-btn" aria-label="Close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <div className="px-5">
            <label className="field">
              <span className="field-label">Name</span>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={40}
                required
              />
            </label>
            {error && <p className="text-[12.5px] font-semibold t-red mb-3">{error}</p>}
            <button className="btn btn-primary w-full" disabled={busy || !name.trim()}>
              {busy ? "Saving…" : "Save name"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}