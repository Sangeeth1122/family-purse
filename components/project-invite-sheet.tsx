"use client";

import { useState } from "react";
import { useEsc } from "@/components/use-esc";
import { useRouter } from "next/navigation";
import { IconX } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/format";
import type { Project, ProjectMember, ProjectRole } from "@/lib/types";

const ROLE_LABEL: Record<ProjectRole, string> = {
  owner: "Owner",
  contributor: "Contributor",
  viewer: "Viewer",
};

export default function ProjectInviteSheet({
  project,
  existingMembers,
  familyMembers,
  onClose,
}: {
  project: Project;
  existingMembers: ProjectMember[];
  familyMembers: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const memberIds = new Set(existingMembers.map((m) => m.user_id));
  const available = familyMembers.filter((m) => !memberIds.has(m.id));
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [role, setRole] = useState<ProjectRole>("contributor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  async function send() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("fp_create_project_invitation", {
      p_project: project.id,
      p_invitee: selected.id,
      p_role: role,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    const token = data?.token as string | undefined;
    const link = token
      ? `${window.location.origin}/app/projects/${project.id}/accept/${token}`
      : null;
    setInviteLink(link);
    setDone(true);
    router.refresh();
  }

  useEsc(true, onClose);

  if (done) {
    return (
      <div className="sheet-overlay" onClick={onClose} role="dialog" aria-modal="true">
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="handle" />
          <div className="sheet-head">
            <h2>Invitation sent</h2>
            <button type="button" className="close-btn" aria-label="Close" onClick={onClose}>
              <IconX size={16} />
            </button>
          </div>
          <p className="text-[13px] font-semibold t-secondary mb-3">
            {selected?.name} will receive a <span className="text-[11px] uppercase font-bold t-tertiary">{ROLE_LABEL[role]}</span> invitation to <strong>{project.name}</strong>.
          </p>
          {inviteLink && (
            <div className="card p-3 mb-4">
              <p className="text-[11px] font-bold t-tertiary uppercase mb-1">Share link</p>
              <p className="text-[12.5px] font-semibold truncate">{inviteLink}</p>
            </div>
          )}
          <button className="btn btn-primary w-full" onClick={onClose}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="sheet-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="handle" />
        <div className="sheet-head">
          <h2>Invite to project</h2>
          <button type="button" className="close-btn" aria-label="Close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>

        {selected ? (
          <div className="mb-4">
            <div className="flex items-center gap-3 rounded-lg p-2" style={{ background: "rgba(0,0,0,0.03)" }}>
              <div className="avatar" style={{ width: 34, height: 34, fontSize: 12 }}>
                {initials(selected.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold truncate">{selected.name}</p>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setSelected(null)}
              >
                <IconX size={14} />
              </button>
            </div>

            <div className="mt-3 mb-3">
              <p className="text-[11px] font-bold t-tertiary uppercase mb-1.5">Role</p>
              <select
                className="input"
                style={{ fontSize: 13 }}
                value={role}
                onChange={(e) => setRole(e.target.value as ProjectRole)}
              >
                {(Object.keys(ROLE_LABEL) as ProjectRole[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </div>

            {error && <p className="text-[12.5px] font-semibold t-red mb-3">{error}</p>}

            <button className="btn btn-primary w-full" disabled={busy} onClick={send}>
              {busy ? "Sending…" : "Send invitation"}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {available.length === 0 ? (
              <p className="text-[12.5px] t-tertiary text-center py-4">
                Every family member is already on the project or has a pending invitation.
              </p>
            ) : (
              available.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="flex items-center gap-3 w-full rounded-lg p-2 text-left"
                  style={{ background: "rgba(0,0,0,0.03)" }}
                  onClick={() => setSelected(u)}
                >
                  <div className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>
                    {initials(u.name)}
                  </div>
                  <span className="text-[13px] font-semibold">{u.name}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
