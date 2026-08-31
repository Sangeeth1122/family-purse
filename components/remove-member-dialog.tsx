"use client";

import { useState } from "react";
import { useEsc } from "@/components/use-esc";
import { useRouter } from "next/navigation";
import { IconAlertTriangle } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { formatINRExact } from "@/lib/format";
import { initials } from "@/lib/format";
import type { UserRow } from "@/lib/types";
import type { OpenBalance } from "@/lib/family";

export default function RemoveMemberDialog({
  member,
  meId,
  familyName,
  openBalance,
  onClose,
}: {
  member: UserRow;
  meId: string;
  familyName: string;
  openBalance: OpenBalance;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasBalance = openBalance.amount > 0;

  async function remove() {
    setError(null);
    setBusy(true);
    const { error: err } = await createClient().rpc("fp_remove_member", {
      p_user_id: member.id,
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
      aria-labelledby="remove-member-title"
    >
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div
          className="w-11 h-11 rounded-full mx-auto mb-3 flex items-center justify-center"
          style={{ background: hasBalance ? "rgba(176,86,47,0.12)" : "rgba(74,122,94,0.12)" }}
        >
          {hasBalance ? (
            <IconAlertTriangle size={20} className="t-red" />
          ) : (
            <span className="text-[18px] t-green">✓</span>
          )}
        </div>

        <div className="flex items-center justify-center gap-2.5 mb-2">
          <div className="avatar" style={{ width: 40, height: 40, fontSize: 13 }}>
            {initials(member.name)}
          </div>
          <h2 id="remove-member-title" className="text-[16px] font-bold">
            {hasBalance ? `Remove with an open balance?` : `Remove ${member.name}?`}
          </h2>
        </div>

        {hasBalance ? (
          <>
            <p className="text-[12.5px] font-semibold t-secondary leading-relaxed text-center mb-1">
              {member.name} still has{" "}
              <span className="t-red">{formatINRExact(openBalance.amount)}</span> outstanding
              across {openBalance.count} family{" "}
              {openBalance.count === 1 ? "loan" : "loans"}.
            </p>
            <p className="text-[12px] font-semibold t-tertiary leading-relaxed text-center mb-5">
              Settle the balance first so it stays clean. Removing anyway makes it
              read-only — the family can see it but can&apos;t change it once{" "}
              {member.name} leaves {familyName}.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={() => router.push("/app/loans")}
              >
                Settle balance first
              </button>
              <button
                type="button"
                className="btn btn-danger w-full"
                disabled={busy}
                onClick={remove}
              >
                {busy ? "Removing…" : "Remove anyway"}
              </button>
              <button type="button" className="btn btn-secondary w-full" onClick={onClose} disabled={busy}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[12.5px] font-semibold t-secondary leading-relaxed text-center mb-5">
              {member.name} will lose access to {familyName}: no project access, no
              family reports, no shared budgets. Their personal history stays with them.
            </p>
            <div className="flex gap-2.5">
              <button type="button" className="btn btn-secondary flex-1" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn btn-red flex-1" disabled={busy} onClick={remove}>
                {busy ? "Removing…" : "Remove member"}
              </button>
            </div>
          </>
        )}

        {error && <p className="text-[12.5px] font-semibold t-red mt-3 text-center">{error}</p>}
        {member.id === meId && (
          <p className="text-[11.5px] font-semibold t-tertiary mt-3 text-center">
            (You can&apos;t remove yourself.)
          </p>
        )}
      </div>
    </div>
  );
}