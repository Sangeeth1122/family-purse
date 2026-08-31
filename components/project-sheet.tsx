"use client";

import { useEffect, useState } from "react";
import { useEsc } from "@/components/use-esc";
import { useRouter } from "next/navigation";
import {
  IconCrown,
  IconPlus,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { initials, parseINR, toINRInput } from "@/lib/format";
import type { Project, ProjectMember, ProjectRole, UserRow } from "@/lib/types";

const ROLE_LABEL: Record<ProjectRole, string> = {
  owner: "Owner",
  contributor: "Contributor",
  viewer: "Viewer",
};

type Selected = { user: UserRow; role: ProjectRole };

function ProjectSheetBody({
  project,
  members,
  onDone,
}: {
  project?: Project | null;
  members?: ProjectMember[];
  onDone: () => void;
}) {
  const router = useRouter();
  const editing = !!project;

  const [name, setName] = useState(project?.name ?? "");
  const [budget, setBudget] = useState(
    project?.budget != null ? String(project.budget) : "",
  );
  const [targetDate, setTargetDate] = useState(project?.target_date ?? "");
  const [status, setStatus] = useState<"active" | "archived">(
    project?.status ?? "active",
  );
  const [selected, setSelected] = useState<Selected[]>([]);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const me = userData.user?.id ?? null;
      const { data } = await supabase.from("users").select("*").order("name");
      if (!alive) return;
      setMeId(me);
      if (data) setUsers(data as UserRow[]);
      if (project) {
        setSelected(
          (data as UserRow[] | null)
            ?.filter((u) => members?.some((m) => m.user_id === u.id))
            .map((u) => ({
              user: u,
              role:
                members?.find((m) => m.user_id === u.id)?.role ??
                "contributor",
            })) ?? [],
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, [project, members]);

  const budgetNum = parseINR(budget);

  function validate(): string | null {
    if (!name.trim()) return "Project name is required.";
    if (name.trim().length > 80) return "Project name is too long.";
    if (budget.trim() && (budgetNum <= 0 || budgetNum > 100000000)) {
      return "Budget must be a positive amount.";
    }
    if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return "Invalid target date.";
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    const supabase = createClient();

    if (editing) {
      const { error: err } = await supabase.rpc("fp_update_project", {
        p_id: project!.id,
        p_payload: {
          name: name.trim(),
          budget: budget.trim() ? budgetNum : null,
          target_date: targetDate || null,
          status,
        },
      });
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
      onDone();
      router.refresh();
      return;
    }

    const members = selected.map((s) => ({
      user_id: s.user.id,
      role: s.role,
    }));
    const { error: err } = await supabase.rpc("fp_create_project", {
      p_payload: {
        name: name.trim(),
        budget: budget.trim() ? budgetNum : null,
        target_date: targetDate || null,
        members,
      },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    onDone();
    router.refresh();
  }

  const included = (id: string) => selected.some((s) => s.user.id === id);

  function toggle(user: UserRow) {
    setSelected((prev) =>
      included(user.id)
        ? prev.filter((s) => s.user.id !== user.id)
        : [...prev, { user, role: "contributor" }],
    );
  }

  function setRole(userId: string, role: ProjectRole) {
    setSelected((prev) =>
      prev.map((s) => (s.user.id === userId ? { ...s, role } : s)),
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <label className="field">
        <span className="field-label">Project name</span>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Goa Trip"
          maxLength={80}
          required
        />
      </label>

      <div className="field">
        <span className="field-label">Overall budget — optional</span>
        <div className="relative">
          <span
            className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold"
            style={{ color: "var(--text-secondary)" }}
          >
            ₹
          </span>
          <input
            className="input pl-8"
            aria-label="Overall project budget in rupees"
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(toINRInput(e.target.value))}
            placeholder="0"
          />
        </div>
        <p className="field-hint">
          Leave blank to run the project without an overall budget.
        </p>
      </div>

      <label className="field">
        <span className="field-label">Target date — optional</span>
        <input
          className="input"
          type="date"
          aria-label="Project target date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
      </label>

      {!editing && (
        <div className="field">
          <span className="field-label">
            Who&apos;s on the team <IconUsers size={13} />
          </span>
          <div className="avatar-row" style={{ overflowX: "auto" }}>
            {users.map((u) => (
              <div
                key={u.id}
                className={`avatar-chip ${included(u.id) ? "selected" : ""}`}
                style={{
                  flex: "0 0 auto",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  width: 60,
                }}
              >
                <button
                  type="button"
                  aria-pressed={included(u.id)}
                  aria-label={`Toggle ${u.name} on the team`}
                  className="avatar"
                  style={{ width: 48, height: 48, position: "relative" }}
                  onClick={() => toggle(u)}
                >
                  {initials(u.name)}
                  {u.id === meId && (
                    <IconCrown
                      size={13}
                      style={{
                        position: "absolute",
                        right: -4,
                        top: -4,
                        color: "var(--blue)",
                      }}
                    />
                  )}
                </button>
                <span>{u.name}</span>
              </div>
            ))}
          </div>
          <p className="field-hint">
            You&apos;re locked in as owner. Everyone else joins as contributor
            unless you change their role.
          </p>
          {selected.length > 0 && (
            <div className="mt-3 space-y-2">
              {selected.map((s) => (
                <div
                  key={s.user.id}
                  className="flex items-center gap-3 rounded-lg p-2"
                  style={{ background: "rgba(0,0,0,0.03)" }}
                >
                  <div
                    className="avatar"
                    style={{ width: 30, height: 30, fontSize: 11 }}
                  >
                    {initials(s.user.name)}
                  </div>
                  <span className="flex-1 text-[13px] font-semibold">
                    {s.user.name}
                    {s.user.id === meId ? " (you)" : ""}
                  </span>
                  <select
                    className="input"
                    style={{ padding: "6px 8px", fontSize: 12, width: "auto" }}
                    aria-label={`Role for ${s.user.name}`}
                    disabled={s.user.id === meId}
                    value={s.role}
                    onChange={(e) =>
                      setRole(s.user.id, e.target.value as ProjectRole)
                    }
                  >
                    {(Object.keys(ROLE_LABEL) as ProjectRole[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="field">
          <span className="field-label">Status</span>
          <div className="segmented">
            <button
              type="button"
              className={`seg ${status === "active" ? "active" : ""}`}
              onClick={() => setStatus("active")}
            >
              Active
            </button>
            <button
              type="button"
              className={`seg ${status === "archived" ? "active" : ""}`}
              onClick={() => setStatus("archived")}
            >
              Archived
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-[12.5px] font-semibold t-red mb-3">{error}</p>}

      <button className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Saving…" : editing ? "Save changes" : "Create Project"}
      </button>
    </form>
  );
}

/**
 * Project add/edit sheet. Members are chosen at creation (screen 15); the
 * owner/admin edits metadata + status here, and manages people separately.
 */
export default function ProjectSheet({
  open,
  onClose,
  project,
  members,
}: {
  open: boolean;
  onClose: () => void;
  project?: Project | null;
  members?: ProjectMember[];
}) {
  useEsc(open, onClose);
  if (!open) return null;
  return (
    <div
      className="sheet-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-sheet-title"
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="handle" />
        <div className="sheet-head">
          <h2 id="project-sheet-title">{project ? "Edit project" : "Add Project"}</h2>
          <button type="button" className="close-btn" aria-label="Close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>
        <ProjectSheetBody project={project} members={members} onDone={onClose} />
      </div>
    </div>
  );
}

/** Floating "+" Add Project button (projects list page, family admin only). */
export function AddProjectButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Add project"
        onClick={() => setOpen(true)}
        className="fixed left-1/2 -translate-x-1/2 z-40 w-[54px] h-[54px] rounded-full shadow-lg flex items-center justify-center"
        style={{
          background: "var(--text)",
          color: "var(--bg)",
          bottom: "104px",
        }}
      >
        <IconPlus size={22} stroke={2.5} />
      </button>
      <ProjectSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}