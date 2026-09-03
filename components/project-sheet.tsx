"use client";

import { useEffect, useState } from "react";
import { useEsc } from "@/components/use-esc";
import { useRouter } from "next/navigation";
import {
  IconCheck,
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

      <div className="flex gap-3">
        <div className="field flex-1">
          <span className="field-label">Budget (optional)</span>
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
        </div>

        <div className="field flex-1">
          <span className="field-label">Target date</span>
          <input
            className="input"
            type="date"
            aria-label="Project target date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </div>
      </div>

      {!editing && (
        <div className="field">
          <span className="field-label">
            Who&apos;s involved <IconUsers size={13} />
          </span>
          <div className="flex flex-col gap-2">
            {users.map((u) => {
              const isIn = included(u.id);
              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between rounded-lg border px-3.5 py-[11px]"
                  style={{ background: "var(--card)", borderColor: "var(--border)" }}
                >
                  <button
                    type="button"
                    onClick={() => toggle(u)}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                    aria-pressed={isIn}
                  >
                    <div
                      className="rounded-full flex items-center justify-center shrink-0"
                      style={{ width: 32, height: 32, fontSize: 12, fontWeight: 700, background: "rgba(0,0,0,0.08)", color: "var(--text-secondary)" }}
                    >
                      {initials(u.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold truncate">
                        {u.name}
                        {u.id === meId ? " (you)" : ""}
                      </div>
                      <div className="text-[11px] font-semibold t-tertiary">
                        {u.id === meId ? "Owner" : "Contributor"}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-2.5 shrink-0">
                    {isIn && u.id !== meId && (
                      <select
                        className="input"
                        style={{ padding: "6px 8px", fontSize: 12, width: "auto" }}
                        aria-label={`Role for ${u.name}`}
                        value={selected.find((s) => s.user.id === u.id)?.role ?? "contributor"}
                        onChange={(e) =>
                          setRole(u.id, e.target.value as ProjectRole)
                        }
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(Object.keys(ROLE_LABEL) as ProjectRole[]).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      aria-label={`Select ${u.name}`}
                      aria-pressed={isIn}
                      onClick={() => toggle(u)}
                      className="h-[22px] w-[22px] rounded-md flex items-center justify-center"
                      style={{
                        background: isIn ? "var(--text)" : "transparent",
                        color: isIn ? "var(--bg)" : "transparent",
                        border: "1.5px solid var(--border)",
                      }}
                    >
                      <IconCheck size={13} stroke={3} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="field-hint">
            You&apos;re locked in as owner. Transactions tagged to this project
            count toward every selected member&apos;s shared reports.
          </p>
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
        {busy ? "Saving…" : editing ? "Save changes" : "Create project"}
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
          <h2 id="project-sheet-title">{project ? "Edit project" : "New project"}</h2>
          <button type="button" className="close-btn" aria-label="Close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>
        <ProjectSheetBody project={project} members={members} onDone={onClose} />
      </div>
    </div>
  );
}

/** Header "+" Add Project button (projects list page) — matches AddCardButton style. */
export function AddProjectButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="icon-btn"
        aria-label="Add project"
        onClick={() => setOpen(true)}
      >
        <IconPlus size={18} />
      </button>
      <ProjectSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}