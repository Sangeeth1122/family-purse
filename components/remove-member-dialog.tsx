"use client";

import { useState } from "react";
import { useEsc } from "@/components/use-esc";
import { useRouter } from "next/navigation";
import { IconAlertTriangle } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { formatINRExact } from "@/lib/format";
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
          className="w-12 h-12 rounded-full mx-auto mb-3.5 flex items-center justify-center"
          style={{ background: hasBalance ? "rgba(176,86,47,0.1)" : "rgba(74,122,94,0.1)" }}
        >
          {hasBalance ? (
            <IconAlertTriangle size={22} className="t-red" />
          ) : (
            <span className="text-[20px] t-green">✓</span>
          )}
        </div>

        <h2 id="remove-member-title" className="text-[16px] font-bold mb-2">
          {hasBalance
            ? `Remove ${member.name} from the family?`
            : `Remove ${member.name}?`}
        </h2>

        {hasBalance ? (
          <>
            <p className="text-[13.5px] font-medium t-secondary leading-relaxed text-center mb-5">
              {member.name} still has an open loan balance of{" "}
              <b className="font-bold t-primary">{formatINRExact(openBalance.amount)}</b>
              {openBalance.count > 1
                ? ` across ${openBalance.count} loans`
                : ""}
              . Settle it first, or remove anyway and the balance becomes read-only.
            </p>
            <div className="flex flex-col gap-[9px]">
              <button
                type="button"
                className="btn btn-secondary w-full"
                onClick={() => router.push("/app/loans")}
              >
                Settle balance first
              </button>
              <button
                type="button"
                className="btn btn-red w-full"
                disabled={busy}
                onClick={remove}
              >
                {busy ? "Removing…" : "Remove anyway"}
              </button>
              <button
                type="button"
                className="w-full py-1.5 text-[13px] font-semibold"
                style={{ color: "var(--text-tertiary)", background: "transparent" }}
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[13.5px] font-medium t-secondary leading-relaxed text-center mb-5">
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