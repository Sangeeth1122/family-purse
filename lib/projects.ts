/**
 * Phase 5 — Project derivations (pure functions mirroring lib/balances.ts).
 *
 * Everything visible about a project is derived from the canonical records:
 *   * spent / revenue — P&L rows scoped to the project (settlements are
 *     always personal-scope, so none can appear here);
 *   * budget progress — from `projects.budget`, never from mockup totals;
 *   * membership roles — from `project_members`.
 */
import { round2 } from "@/lib/balances";
import type { ProjectMember, Transaction } from "@/lib/types";

export type ProjectProgress = {
  /** Sum of expense + interest_expense P&L rows for the project. */
  spent: number;
  /** Sum of revenue + interest_income P&L rows for the project. */
  revenue: number;
  /** spent − revenue. */
  net: number;
  /** The project's overall budget (or null when no budget was set). */
  budget: number | null;
  /** Round percentage of `budget` used, or null when there is no budget. */
  pctUsed: number | null;
  /** spent has exceeded the budget. */
  over: boolean;
};

export function projectTransactions(
  txns: Transaction[],
  projectId: string,
): Transaction[] {
  return txns.filter((t) => t.scope_type === "project" && t.scope_id === projectId);
}

function spendLike(t: Transaction): boolean {
  return t.kind === "pl" && (t.type === "expense" || t.type === "interest_expense");
}

function revenueLike(t: Transaction): boolean {
  return t.kind === "pl" && (t.type === "revenue" || t.type === "interest_income");
}

export function projectSpend(txns: Transaction[], projectId: string): number {
  return round2(
    projectTransactions(txns, projectId).reduce(
      (s, t) => (spendLike(t) ? s + t.amount : s),
      0,
    ),
  );
}

export function projectRevenue(txns: Transaction[], projectId: string): number {
  return round2(
    projectTransactions(txns, projectId).reduce(
      (s, t) => (revenueLike(t) ? s + t.amount : s),
      0,
    ),
  );
}

export function projectProgress(
  txns: Transaction[],
  projectId: string,
  budget: number | null,
): ProjectProgress {
  const scoped = projectTransactions(txns, projectId);
  const spent = round2(scoped.reduce((s, t) => (spendLike(t) ? s + t.amount : s), 0));
  const revenue = round2(scoped.reduce((s, t) => (revenueLike(t) ? s + t.amount : s), 0));
  const net = round2(spent - revenue);
  const pctUsed = budget !== null && budget > 0 ? Math.round((spent / budget) * 100) : null;
  return { spent, revenue, net, budget, pctUsed, over: budget !== null && spent > budget };
}

/** Look-up: user_id -> project role. */
export function memberRoleMap(members: ProjectMember[]): Map<string, ProjectMember["role"]> {
  return new Map(members.map((m) => [m.user_id, m.role]));
}