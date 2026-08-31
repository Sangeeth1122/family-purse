"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoBack } from "@/components/use-go-back";
import {
  IconArchive,
  IconDots,
  IconFolder,
  IconLock,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUsers,
  IconWallet,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { formatINR, formatINRExact, initials } from "@/lib/format";
import type { Project, ProjectMember, ProjectRole } from "@/lib/types";
import AddTransactionSheet from "@/components/add-transaction-sheet";
import ProjectSheet from "@/components/project-sheet";
import ProjectMembersSheet from "@/components/project-members-sheet";

export type ProjectTxnRow = {
  key: string;
  date: string;
  categoryName: string;
  categoryColor: string | null;
  note: string | null;
  via: string;
  isExpense: boolean;
  amount: number;
};

export type ProjectCatBudget = {
  key: string;
  categoryName: string;
  categoryColor: string | null;
  period: string;
  amount: number;
  spent: number;
};

export type ProjectPerson = {
  user_id: string;
  name: string;
  role: ProjectRole;
};

const ROLE_LABEL: Record<ProjectRole, string> = {
  owner: "Owner",
  contributor: "Contributor",
  viewer: "Viewer",
};

function dateLabel(date: string): string {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ProjectDetailView({
  project,
  meId,
  myRole,
  isAdmin,
  people,
  catBudgets,
  txnRows,
}: {
  project: Project;
  meId: string;
  myRole: ProjectRole | null;
  isAdmin: boolean;
  people: ProjectPerson[];
  catBudgets: ProjectCatBudget[];
  txnRows: ProjectTxnRow[];
}) {
  const router = useRouter();
  const goBack = useGoBack("/app/projects");
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [managingMembers, setManagingMembers] = useState(false);
  const [addingTxn, setAddingTxn] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spent = txnRows.filter((r) => r.isExpense).reduce((s, r) => s + r.amount, 0);
  const revenue = txnRows.reduce((s, r) => s + (r.isExpense ? 0 : r.amount), 0);
  const budget = project.budget;
  const pct = budget != null && budget > 0 ? Math.round((spent / budget) * 100) : null;
  const over = budget != null && spent > budget;

  const canManageMembers = (myRole === "owner" || isAdmin) && project.status === "active";
  const canAddTxn = myRole !== null && myRole !== "viewer" && project.status === "active";

  const memberSetList: ProjectMember[] = people.map((p) => ({
    project_id: project.id,
    user_id: p.user_id,
    role: p.role,
  }));

  async function setStatus(status: "active" | "archived") {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("fp_update_project", {
      p_id: project.id,
      p_payload: { status },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.refresh();
    setMenuOpen(false);
  }

  async function onDelete() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("fp_delete_project", { p_id: project.id });
    setBusy(false);
    if (err) {
      setError(err.message);
      setConfirmDelete(false);
      return;
    }
    router.push("/app/projects");
    router.refresh();
  }

  return (
    <div className="min-h-screen pb-24">
      {/* ---------- Top bar ---------- */}
      <div className="flex items-center justify-between px-5 pt-6 pb-2">
        <button
          type="button"
          className="icon-btn"
          aria-label="Back"
          onClick={goBack}
        >
          <span className="text-[16px] leading-none">‹</span>
        </button>
        <h1 className="text-[17px] font-bold">Projects</h1>
        <div className="relative">
          {isAdmin && (
            <button
              type="button"
              className="icon-btn"
              aria-label="More options"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <IconDots size={20} />
            </button>
          )}
          {menuOpen && isAdmin && (
            <div className="absolute right-0 top-10 z-40 w-48 card p-1 shadow-lg">
              <button
                type="button"
                className="w-full text-left px-3.5 py-2.5 text-[13px] font-bold rounded-md hover:bg-[rgba(0,0,0,0.04)] flex items-center gap-2"
                onClick={() => {
                  setMenuOpen(false);
                  setEditing(true);
                }}
              >
                <IconPencil size={15} /> Edit project
              </button>
              <button
                type="button"
                className="w-full text-left px-3.5 py-2.5 text-[13px] font-bold rounded-md hover:bg-[rgba(0,0,0,0.04)] flex items-center gap-2"
                disabled={busy}
                onClick={() => setStatus(project.status === "active" ? "archived" : "active")}
              >
                {project.status === "active" ? (
                  <>
                    <IconArchive size={15} /> Archive project
                  </>
                ) : (
                  <>
                    <IconRefresh size={15} /> Restore project
                  </>
                )}
              </button>
              <button
                type="button"
                className="w-full text-left px-3.5 py-2.5 text-[13px] font-bold t-red rounded-md hover:bg-[rgba(0,0,0,0.04)] flex items-center gap-2"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmDelete(true);
                }}
              >
                <IconTrash size={15} /> Delete project
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ---------- Hero ---------- */}
      <div className="card mx-5 mt-3 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="txn-icon">
              <IconFolder size={18} />
            </div>
            <h2 className="text-[20px] font-bold tracking-tight truncate">{project.name}</h2>
          </div>
          <span
            className={`badge ${project.status === "active" ? "green" : "neutral"}`}
            style={{ textTransform: "capitalize" }}
          >
            {project.status}
          </span>
        </div>

        {project.target_date && (
          <p className="text-[11.5px] font-semibold t-tertiary mt-2">
            Target date · {dateLabel(project.target_date)}
          </p>
        )}

        <div className="mt-4">
          <div className="text-[11.5px] font-bold uppercase tracking-wide t-secondary">
            Budget used
          </div>
          {budget != null && budget > 0 ? (
            <>
              <div className="text-[30px] font-bold num mt-1">
                {formatINRExact(spent)}
              </div>
              <div className="text-[12px] font-semibold t-tertiary mt-1">
                of {formatINRExact(budget)} overall budget · {pct}% used
              </div>
              <div className="h-[7px] rounded-full overflow-hidden mt-3" style={{ background: "rgba(0,0,0,0.07)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, pct ?? 0)}%`,
                    background: over
                      ? "var(--red)"
                      : "linear-gradient(90deg,var(--blue),#5a8be0)",
                  }}
                />
              </div>
              {over && (
                <p className="text-[12px] font-bold t-red mt-2">
                  {formatINRExact(spent - budget)} over budget
                </p>
              )}
            </>
          ) : (
            <>
              <div className="text-[30px] font-bold num mt-1">
                {formatINRExact(spent)}
              </div>
              <div className="text-[12px] font-semibold t-tertiary mt-1">
                spent · no overall budget set
              </div>
            </>
          )}
        </div>

        <div className="flex items-stretch gap-4 mt-5 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="flex-1">
            <div className="text-[10.5px] font-bold uppercase tracking-wide t-tertiary mb-1">Spent</div>
            <div className="text-[13.5px] font-bold num t-red">{formatINR(spent)}</div>
          </div>
          <div className="w-px bg-[var(--border)]" />
          <div className="flex-1">
            <div className="text-[10.5px] font-bold uppercase tracking-wide t-tertiary mb-1">Received</div>
            <div className="text-[13.5px] font-bold num t-green">{formatINR(revenue)}</div>
          </div>
          <div className="w-px bg-[var(--border)]" />
          <div className="flex-1">
            <div className="text-[10.5px] font-bold uppercase tracking-wide t-tertiary mb-1">Net</div>
            <div className="text-[13.5px] font-bold num">{formatINR(spent - revenue)}</div>
          </div>
        </div>
      </div>

      {/* ---------- People ---------- */}
      <div className="section-label">People</div>
      <div className="mx-5 rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="flex -space-x-1.5">
            {people.map((p) => (
              <div
                key={p.user_id}
                className="avatar"
                style={{ width: 36, height: 36, fontSize: 12, border: "2px solid var(--bg)" }}
              >
                {initials(p.name)}
              </div>
            ))}
            {people.length === 0 && (
              <div className="avatar" style={{ width: 36, height: 36, fontSize: 12 }}>
                ?
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-semibold t-secondary">
              {people.map((p) => p.name).join(", ")}
            </p>
            <p className="text-[11px] font-semibold t-tertiary mt-0.5">
              {people.map((p) => `${p.name} · ${ROLE_LABEL[p.role]}`).join(" · ")}
            </p>
          </div>
          {canManageMembers && (
            <button
              type="button"
              className="text-[12px] font-bold flex items-center gap-1 px-2.5 py-1.5 rounded-full"
              style={{ background: "rgba(0,0,0,0.05)" }}
              onClick={() => setManagingMembers(true)}
            >
              <IconUsers size={13} /> Manage
            </button>
          )}
        </div>
      </div>

      {/* ---------- Category budgets ---------- */}
      {catBudgets.length > 0 && (
        <>
          <div className="section-label">Category budgets</div>
          <div className="mx-5 rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            {catBudgets.map((b, i) => {
              const fill = b.amount > 0 ? Math.min(100, Math.round((b.spent / b.amount) * 100)) : 0;
              const bust = b.amount > 0 && b.spent > b.amount;
              return (
                <div
                  key={b.key}
                  className={`px-4 py-3.5 ${i > 0 ? "border-t" : ""}`}
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="dot" style={{ background: b.categoryColor ?? "var(--border)" }} />
                    <span className="flex-1 text-[13px] font-bold truncate">{b.categoryName}</span>
                    <span className="text-[10.5px] font-semibold t-tertiary">{b.period}</span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-1.5">
                    <span className={`text-[13.5px] font-bold num ${bust ? "t-red" : ""}`}>
                      {formatINRExact(b.spent)}
                    </span>
                    <span className="text-[11px] font-semibold t-tertiary">
                      of {formatINRExact(b.amount)}
                    </span>
                  </div>
                  <div className="h-[5px] rounded-full overflow-hidden mt-1.5" style={{ background: "rgba(0,0,0,0.06)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${fill}%`,
                        background: bust ? "var(--red)" : "var(--text)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ---------- Add transaction ---------- */}
      {canAddTxn && (
        <button
          type="button"
          className="flex items-center gap-3 mx-5 mt-5 px-4 py-3.5 w-[calc(100%-40px)] border-2 border-dashed rounded-lg"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          onClick={() => setAddingTxn(true)}
        >
          <span
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.05)" }}
          >
            <IconPlus size={18} />
          </span>
          <span className="text-[13.5px] font-bold">Add transaction to this project</span>
        </button>
      )}

      {/* ---------- Transactions ---------- */}
      <div className="section-label">Transactions</div>

      {txnRows.length === 0 ? (
        <div className="card mx-5 p-6 text-center">
          <p className="text-[13.5px] font-bold mb-1">No spending yet</p>
          <p className="text-[12.5px] font-semibold t-secondary">
            Log expenses against this project to track its budget.
          </p>
        </div>
      ) : (
        <div className="mx-5 rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          {txnRows.map((r) => (
            <div
              key={r.key}
              className="flex items-center gap-3 px-4 py-3.5"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <span className="dot" style={{ background: r.categoryColor ?? "var(--border)" }} />
              <div className="flex-1 min-w-0">
                <div className="txn-title truncate">
                  {r.note ?? r.categoryName}
                </div>
                <div className="txn-sub">
                  {r.via} · {r.categoryName} · {dateLabel(r.date)}
                </div>
              </div>
              <span className={`text-[13.5px] font-bold num ${r.isExpense ? "t-red" : "t-green"}`}>
                {r.isExpense ? "−" : "+"}
                {formatINRExact(r.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {project.status === "archived" && (
        <p className="text-center text-[11.5px] font-semibold t-tertiary mt-4 px-8">
          This project is archived — its records stay but no new transactions or
          member changes are allowed.
        </p>
      )}

      {error && <p className="text-[12.5px] font-semibold t-red mx-5 mt-3">{error}</p>}

      {/* ---------- Sheets / dialogs ---------- */}
      {addingTxn && (
        <AddTransactionSheet
          prefill={{ projectId: project.id, projectName: project.name }}
          onClose={() => setAddingTxn(false)}
        />
      )}

      {editing && (
        <ProjectSheet open onClose={() => setEditing(false)} project={project} members={memberSetList} />
      )}

      {managingMembers && (
        <ProjectMembersSheet
          project={project}
          members={memberSetList}
          membersResolved={new Map(people.map((p) => [p.user_id, { id: p.user_id, name: p.name }]))}
          meId={meId}
          myRole={myRole}
          onClose={() => setManagingMembers(false)}
        />
      )}

      {confirmDelete && (
        <div className="dialog-overlay">
          <div className="dialog">
            <div className="w-11 h-11 rounded-full bg-[rgba(176,86,47,0.12)] flex items-center justify-center mx-auto mb-3">
              <IconTrash size={19} className="t-red" />
            </div>
            <h2 className="text-[16px] font-bold mb-1">Delete project?</h2>
            <p className="text-[12.5px] font-semibold t-secondary leading-relaxed mb-5">
              {txnRows.length > 0
                ? `${txnRows.length} recorded ${txnRows.length === 1 ? "transaction references" : "transactions reference"} this project, so it can&apos;t be deleted — archive it instead. The records stay as the audit trail.`
                : "This removes the project and its team. There are no recorded transactions, so nothing else changes in the ledger."}
            </p>
            {txnRows.length > 0 ? (
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={() => setConfirmDelete(false)}
              >
                Got it
              </button>
            ) : (
              <div className="flex gap-2.5">
                <button
                  type="button"
                  className="btn btn-secondary flex-1"
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep
                </button>
                <button
                  type="button"
                  className="btn btn-red flex-1"
                  disabled={busy}
                  onClick={onDelete}
                >
                  {busy ? "Deleting…" : "Delete"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-1.5 text-center text-[10.5px] font-semibold t-tertiary pt-6">
        <IconWallet size={11} /> Progress is always computed from transactions
        {myRole === "viewer" && (
          <>
            {" "}· <IconLock size={11} /> view only
          </>
        )}
      </div>
    </div>
  );
}