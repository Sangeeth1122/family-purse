"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconPlus, IconX } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { parseINR, toINRInput } from "@/lib/format";
import { useEsc } from "@/components/use-esc";
import type { AccountType } from "@/lib/types";

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "bank", label: "Bank Account" },
  { value: "savings", label: "Savings Account" },
  { value: "cash", label: "Cash in Hand" },
  { value: "wallet", label: "Digital Wallet" },
];

export function AddAccountButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="icon-btn"
        aria-label="Add account"
        onClick={() => setOpen(true)}
      >
        <IconPlus size={18} stroke={2.2} />
      </button>
      {open && <AddAccountSheet onClose={() => setOpen(false)} />}
    </>
  );
}

export default function AddAccountSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("bank");
  const [openingBalance, setOpeningBalance] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEsc(true, onClose);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Enter an account name.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not logged in");

      const { data: profile } = await supabase
        .from("users")
        .select("family_id")
        .eq("id", user.user.id)
        .maybeSingle();

      if (!profile?.family_id) throw new Error("You must belong to a family");

      const balanceNum = parseINR(openingBalance);

      const { error: err } = await supabase.from("accounts").insert({
        family_id: profile.family_id,
        user_id: user.user.id,
        name: name.trim(),
        type,
        opening_balance: balanceNum,
        status: "active",
      });

      if (err) throw err;

      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="sheet-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-account-title"
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="handle" />
        <div className="sheet-head">
          <h2 id="add-account-title">Add Account</h2>
          <button type="button" className="close-btn" aria-label="Close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="px-5 pb-6">
          <label className="field">
            <span className="field-label">Account name</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. HDFC Salary, Emergency Savings, Cash Wallet"
              required
            />
          </label>

          <div className="field">
            <span className="field-label">Account type</span>
            <div className="segmented">
              {ACCOUNT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`seg ${type === t.value ? "active" : ""}`}
                  onClick={() => setType(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span className="field-label">Opening balance (₹)</span>
            <input
              className="input"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(toINRInput(e.target.value))}
              placeholder="0"
            />
            <div className="field-hint">
              Current balance in this bank or cash wallet to start tracking from.
            </div>
          </label>

          {error && <p className="text-[12.5px] font-semibold t-red mb-3">{error}</p>}

          <button type="submit" className="btn btn-primary w-full mt-4" disabled={busy}>
            {busy ? "Saving…" : "Add account"}
          </button>
        </form>
      </div>
    </div>
  );
}
