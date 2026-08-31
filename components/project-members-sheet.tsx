"use client";

import { useState } from "react";
import { useEsc } from "@/components/use-esc";
import { useRouter } from "next/navigation";
import { IconCrown, IconTrash, IconUserPlus, IconX } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/format";
import type { Project, ProjectMember, ProjectRole } from "@/lib/types";

const ROLE_LABEL: Record<ProjectRole, string> = {
  owner: "Owner",
  contributor: "Contributor",
  viewer: "Viewer",
};

/**
 * Project member management sheet — replace the membership set atomically
 * via `fp_set_project_members`. Only a family admin or the project owner
 * can open this (enforced at the caller); the RPC enforces the same rule
 * before replacing the set, and we keep the last owner guarded client-side.
 */
export default function ProjectMembersSheet({
  project,
  members,
  membersResolved,
  meId,
  myRole,
  onClose,
}: {
  project: Project;
  members: ProjectMember[];
  membersResolved: Map<string, { id: string; name: string }>;
  meId: string;
  myRole: ProjectRole | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<{ user: { id: string; name: string }; role: ProjectRole }[]>(
    members.map((m) => ({
      user: { id: m.user_id, name: membersResolved.get(m.user_id)?.name ?? "Unknown" },
      role: m.role,
    })),
  );
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const family = Array.from(membersResolved.values());
  const notAdded = family.filter((u) => !draft.some((d) => d.user.id === u.id));
  const ownerCount = draft.filter((d) => d.role === "owner").length;
  const iAmLastOwner =
    myRole === "owner" && ownerCount === 1 && draft[0]?.user.id === meId;

  function setRole(userId: string, role: ProjectRole) {
    setDraft((prev) => prev.map((d) => (d.user.id === userId ? { ...d, role } : d)));
  }

  function remove(userId: string) {
    setDraft((prev) => prev.filter((d) => d.user.id !== userId));
  }

  async function save() {
    if (draft.length === 0) {
      setError("A project needs at least one owner.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("fp_set_project_members", {
      p_project: project.id,
      p_members: draft.map((d) => ({ user_id: d.user.id, role: d.role })),
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.refresh();
    onClose();
  }

  useEsc(true, onClose);

  return (
    <div
      className="sheet-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-members-title"
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="handle" />
        <div className="sheet-head">
          <h2 id="project-members-title">Project team</h2>
          <button type="button" className="close-btn" aria-label="Close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>

        <div className="space-y-2 mb-4">
          {draft.map((d) => (
            <div
              key={d.user.id}
              className="flex items-center gap-3 rounded-lg p-2"
              style={{ background: "rgba(0,0,0,0.03)" }}
            >
              <div className="avatar" style={{ width: 34, height: 34, fontSize: 12 }}>
                {initials(d.user.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold truncate">
                  {d.user.name}
                  {d.user.id === meId ? " (you)" : ""}
                  {d.role === "owner" && (
                    <IconCrown
                      size={13}
                      style={{
                        color: "var(--blue)",
                        marginLeft: 6,
                        verticalAlign: -2,
                      }}
                    />
                  )}
                </p>
              </div>
              <select
                className="input"
                style={{ padding: "6px 8px", fontSize: 12, width: "auto" }}
                aria-label={`Role for ${d.user.name}`}
                value={d.role}
                onChange={(e) => setRole(d.user.id, e.target.value as ProjectRole)}
              >
                {(Object.keys(ROLE_LABEL) as ProjectRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label={`Remove ${d.user.name}`}
                className="close-btn"
                onClick={() => remove(d.user.id)}
              >
                <IconTrash size={15} />
              </button>
            </div>
          ))}
          {draft.length === 0 && (
            <p className="text-[12.5px] t-tertiary text-center py-3">
              No members yet — add someone below.
            </p>
          )}
        </div>

        {adding ? (
          <div className="space-y-2 mb-4">
            <p className="text-[12.5px] font-bold t-tertiary">Add a family member</p>
            {notAdded.map((u) => (
              <button
                key={u.id}
                type="button"
                className="flex items-center gap-3 w-full rounded-lg p-2 text-left"
                style={{ background: "rgba(0,0,0,0.03)" }}
                onClick={() => {
                  setDraft((prev) => [
                    ...prev,
                    { user: u, role: "contributor" },
                  ]);
                  setAdding(false);
                }}
              >
                <div className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>
                  {initials(u.name)}
                </div>
                <span className="text-[13px] font-semibold">{u.name}</span>
              </button>
            ))}
            {notAdded.length === 0 && (
              <p className="text-[12.5px] t-tertiary">
                Every family member is already on the project.
              </p>
            )}
          </div>
        ) : (
          notAdded.length > 0 && (
            <button
              type="button"
              className="btn btn-outline w-full mb-4"
              onClick={() => setAdding(true)}
            >
              <IconUserPlus size={15} /> Add person
            </button>
          )
        )}

        {iAmLastOwner && myRole === "owner" && (
          <p className="text-[12px] font-semibold t-red mb-3">
            You&apos;re the last owner — promote someone else before leaving.
          </p>
        )}

        {error && <p className="text-[12.5px] font-semibold t-red mb-3">{error}</p>}

        <button
          className="btn btn-primary w-full"
          disabled={busy || iAmLastOwner}
          onClick={save}
        >
          {busy ? "Saving…" : "Save team"}
        </button>
      </div>
    </div>
  );
}