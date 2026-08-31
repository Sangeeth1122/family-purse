"use client";

import { useState } from "react";
import { useEsc } from "@/components/use-esc";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/format";
import type { UserRow } from "@/lib/types";

export default function ChangeRoleDialog({
  member,
  meId,
  onClose,
}: {
  member: UserRow;
  meId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [role, setRole] = useState<UserRow["role"]>(member.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options: { value: UserRow["role"]; title: string; sub: string }[] = [
    {
      value: "admin",
      title: "Admin",
      sub: "Full family management — invite, remove, roles, categories.",
    },
    {
      value: "member",
      title: "Member",
      sub: "Full family visibility with management kept with admins.",
    },
  ];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await createClient().rpc("fp_change_family_role", {
      p_user_id: member.id,
      p_role: role,
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
      aria-labelledby="change-role-title"
    >
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-1">
          <div className="avatar" style={{ width: 40, height: 40, fontSize: 13 }}>
            {initials(member.name)}
          </div>
          <div>
            <h2 id="change-role-title" className="text-[16px] font-bold">{member.name}</h2>
            <p className="text-[11.5px] font-semibold t-secondary">
              {member.id === meId ? "You" : "Member"} · change family role
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-4">
          <div className="flex flex-col gap-2">
            {options.map((o) => {
              const selected = role === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setRole(o.value)}
                  className="w-full text-left rounded-xl border px-4 py-3"
                  style={{
                    borderColor: selected ? "var(--text)" : "var(--border)",
                    background: selected ? "rgba(26,26,24,0.04)" : "var(--card)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-bold">
                      {o.title} {member.role === o.value && <span className="t-tertiary text-[12px]">(current)</span>}
                    </span>
                    <span
                      className="w-4.5 h-4.5 rounded-full border flex items-center justify-center"
                      style={{
                        width: 18,
                        height: 18,
                        borderColor: selected ? "var(--text)" : "var(--border)",
                      }}
                    >
                      {selected && <span className="w-2 h-2 rounded-full" style={{ background: "var(--text)" }} />}
                    </span>
                  </div>
                  <p className="text-[12px] font-semibold t-secondary mt-0.5">{o.sub}</p>
                </button>
              );
            })}
          </div>

          {error && <p className="text-[12.5px] font-semibold t-red mb-3 mt-2">{error}</p>}
          <div className="flex gap-2.5 mt-4">
            <button type="button" className="btn btn-secondary flex-1" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary flex-1" disabled={busy}>
              {busy ? "Updating…" : role === member.role ? "Update role" : role === "admin" ? "Make admin" : "Make member"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}