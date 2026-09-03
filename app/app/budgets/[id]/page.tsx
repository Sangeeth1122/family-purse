import { redirect } from "next/navigation";
import { IconWallet, IconCalendar, IconFolderOpen, IconLock, IconPencil, IconTrash, IconArrowLeft } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { formatINR, formatDayMonth } from "@/lib/format";
import Link from "next/link";
import { AddBudgetButton } from "@/components/add-budget-sheet";

export default async function BudgetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { id } = await params;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [meRes, detailRes] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    supabase.rpc("fp_get_budget_detail", { p_budget_id: id }),
  ]);

  const me = meRes.data as { role: string } | null;
  if (meRes.error || detailRes.error) redirect("/app/budgets");

  const detail = detailRes.data as {
    budget: {
      id: string;
      name: string;
      type: "monthly" | "project";
      total_amount: number;
      start_date: string;
      end_date: string;
      project_id: string | null;
      active: boolean;
      created_at: string;
    };
    allocations: Array<{
      id: string;
      category_id: string;
      amount: number;
      category_name: string;
      category_color: string;
      spent: number;
    }>;
    total_spent: number;
  } | null;

  if (!detail) redirect("/app/budgets");

  const { budget, allocations, total_spent } = detail;
  const remaining = budget.total_amount - total_spent;
  const over = remaining < 0;
  const pct = budget.total_amount > 0 ? (total_spent / budget.total_amount) * 100 : 0;
  const typeIcon = budget.type === "monthly" ? <IconCalendar size={14} /> : <IconFolderOpen size={14} />;
  const typeLabel = budget.type === "monthly" ? "Monthly" : "Project";
  const allocatedTotal = allocations.reduce((s, a) => s + a.amount, 0);
  const unallocated = budget.total_amount - allocatedTotal;

  return (
    <div className="min-h-screen pb-24">
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <Link href="/app/budgets" className="icon-btn" aria-label="Back">
          <IconArrowLeft size={18} stroke={1.8} />
        </Link>
        <div className="flex-1 text-center">
          <h1 className="text-[17px] font-bold">{budget.name}</h1>
        </div>
        {me?.role === "admin" && budget.active && (
          <AddBudgetButton />
        )}
      </div>

      <div className="card mx-5 p-4">
        <div className="flex items-center gap-2 mb-3">
          {typeIcon}
          <span className="text-[13px] font-semibold t-tertiary">{typeLabel}</span>
          {budget.type === "project" && (
            <>
              <span className="text-[11px] font-semibold t-tertiary">·</span>
              <span className="text-[11px] font-semibold t-tertiary">
                {formatDayMonth(budget.start_date)} – {formatDayMonth(budget.end_date)}
              </span>
            </>
          )}
          {budget.active ? <span className="badge green ml-auto">Active</span> : <span className="badge neutral ml-auto">Inactive</span>}
        </div>

        <div className="text-center mb-4">
          <div className="text-[28px] font-bold num" style={{ color: over ? "var(--red)" : "var(--text)" }}>
            {formatINR(total_spent)}
          </div>
          <div className="text-[13px] font-semibold t-tertiary mt-1">
            of {formatINR(budget.total_amount)} total budget
          </div>
        </div>

        <div className="h-[8px] rounded-full overflow-hidden mb-3" style={{ background: "rgba(0,0,0,0.06)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, Math.max(3, pct))}%`,
              background: over ? "var(--red)" : "var(--text)",
            }}
          />
        </div>

        <div className="flex items-center justify-between text-[12px] font-semibold t-tertiary mb-4">
          <span className={over ? "t-red" : ""}>
            {over ? `Over by ${formatINR(-remaining)}` : `${formatINR(remaining)} remaining`}
          </span>
          <span>{Math.round(pct)}% used</span>
        </div>

        {allocatedTotal > 0 && (
          <div className="text-[11px] font-semibold t-tertiary text-center mb-4">
            {formatINR(allocatedTotal)} allocated · {formatINR(unallocated)} unallocated
          </div>
        )}
      </div>

      <div className="section-label">Category Allocations</div>

      <div className="px-5 space-y-2">
        {allocations.length > 0 ? (
          allocations.map((a) => {
            const aRem = a.amount - a.spent;
            const aOver = aRem < 0;
            const aPct = a.amount > 0 ? (a.spent / a.amount) * 100 : 0;
            return (
              <div key={a.id} className="card p-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="flex items-center gap-2 text-[14px] font-bold min-w-0">
                    <span className="dot" style={{ background: a.category_color, width: 9, height: 9 }} />
                    <span className="truncate">{a.category_name}</span>
                  </span>
                  <span className="text-[14px] num flex-shrink-0">
                    <span className="font-bold t-primary">{formatINR(a.spent)}</span>
                    <span className="font-semibold t-tertiary"> / {formatINR(a.amount)}</span>
                  </span>
                </div>
                <div className="h-[4px] rounded-full overflow-hidden mb-1.5" style={{ background: "rgba(0,0,0,0.06)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, Math.max(3, aPct))}%`, background: aOver ? "var(--red)" : "var(--text)" }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10.5px] font-semibold t-tertiary">
                  <span className={aOver ? "t-red" : ""}>
                    {aOver ? `Over by ${formatINR(-aRem)}` : `${formatINR(aRem)} left`}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="card mx-5 p-6 text-center">
            <p className="text-[13.5px] font-bold mb-1">No category allocations</p>
            <p className="text-[12.5px] font-semibold t-secondary leading-relaxed">
              This budget has no category-level allocations. All spending counts toward the total.
            </p>
          </div>
        )}
      </div>

      {me?.role === "admin" && (
        <div className="px-5 mt-6 space-y-2">
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13.5px] font-bold mb-1">Budget Actions</div>
                <div className="text-[12px] font-semibold t-secondary">
                  Edit, deactivate, or view details.
                </div>
              </div>
              <Link
                href={`/app/budgets/${budget.id}/edit`}
                className="btn btn-secondary"
              >
                <IconPencil size={14} /> Edit
              </Link>
            </div>
          </div>

          {budget.active && (
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13.5px] font-bold mb-1 text-red">Deactivate Budget</div>
                  <div className="text-[12px] font-semibold t-secondary">
                    The budget will be hidden from the active list but kept for historical reporting.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-red"
                  onClick={async () => {
                    const supabase = await createClient();
                    await supabase.rpc("fp_set_budget_active", { p_budget_id: budget.id, p_active: false });
                    window.location.reload();
                  }}
                >
                  <IconTrash size={14} /> Deactivate
                </button>
              </div>
            </div>
          )}

          {!budget.active && (
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13.5px] font-bold mb-1 text-green">Reactivate Budget</div>
                  <div className="text-[12px] font-semibold t-secondary">
                    The budget will appear in the active list again.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={async () => {
                    const supabase = await createClient();
                    await supabase.rpc("fp_set_budget_active", { p_budget_id: budget.id, p_active: true });
                    window.location.reload();
                  }}
                >
                  Reactivate
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="text-center text-[11px] font-semibold t-tertiary pt-8 pb-2">
        Created {formatDayMonth(budget.created_at)} · {budget.active ? "Active" : "Inactive"}
      </div>
    </div>
  );
}