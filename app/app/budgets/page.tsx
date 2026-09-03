import Link from "next/link";
import { redirect } from "next/navigation";
import { IconWallet, IconLock, IconCalendar, IconFolderOpen } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { formatINR, formatDayMonth } from "@/lib/format";
import type { Budget } from "@/lib/types";
import { AddBudgetButton } from "@/components/add-budget-sheet";

export default async function BudgetsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [meRes, budgetsRes] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    supabase.rpc("fp_list_budgets", { p_active_only: true }),
  ]);

  const me = meRes.data as { role: string; family_id: string | null } | null;
  if (meRes.error || budgetsRes.error)
    throw new Error("Could not load budgets.");

  const budgets = (budgetsRes.data ?? []) as (Budget & { total_spent: number; total_allocated: number })[];

  return (
    <div className="min-h-screen pb-24">
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <span className="text-[20px] font-bold" style={{ letterSpacing: "-0.01em" }}>Budgets</span>
        </div>
        {me?.role === "admin" && <AddBudgetButton />}
      </div>

      {budgets.length === 0 ? (
        <div className="card mx-5 p-6 text-center">
          <IconWallet size={22} className="mx-auto mb-3 t-tertiary" />
          <p className="text-[13.5px] font-bold mb-1">No budgets yet</p>
          <p className="text-[12.5px] font-semibold t-secondary leading-relaxed mx-auto max-w-[280px]">
            Create a monthly or project budget to start tracking your spending.
          </p>
          {me?.role === "admin" && me?.family_id && (
            <AddBudgetButton className="mt-4" />
          )}
        </div>
      ) : (
        <div className="px-5 space-y-3 pt-2">
          {budgets.map((b) => {
            const pct = b.total_amount > 0 ? (b.total_spent / b.total_amount) * 100 : 0;
            const over = pct > 100;
            const typeIcon = b.type === "monthly" ? <IconCalendar size={14} /> : <IconFolderOpen size={14} />;
            const typeLabel = b.type === "monthly" ? "Monthly" : "Project";
            const unallocated = b.total_amount - (b.total_allocated ?? 0);

            return (
              <Link key={b.id} href={`/app/budgets/${b.id}`} className="card p-4 block">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-[15.5px] font-bold truncate">{b.name}</h2>
                    <div className="flex items-center gap-2 mt-0.5 text-[12px] font-semibold t-tertiary">
                      {typeIcon}
                      <span>{typeLabel}</span>
                      {b.type === "project" && (
                        <span>· {formatDayMonth(b.start_date)} – {formatDayMonth(b.end_date)}</span>
                      )}
                    </div>
                  </div>
                  {b.active ? (
                    <span className="badge green">Active</span>
                  ) : (
                    <span className="badge neutral">Inactive</span>
                  )}
                </div>

                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-[22px] font-bold num">{formatINR(b.total_spent)}</span>
                  <span className="text-[13px] font-semibold t-tertiary">of {formatINR(b.total_amount)}</span>
                </div>

                <div className="h-[6px] rounded-full overflow-hidden mb-2" style={{ background: "rgba(0,0,0,0.06)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(3, pct))}%`,
                      background: over ? "var(--red)" : "var(--text)",
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] font-semibold t-tertiary mb-2">
                  <span className={over ? "t-red" : ""}>
                    {over ? `Over by ${formatINR(b.total_spent - b.total_amount)}` : `${Math.round(pct)}% used`}
                  </span>
                  <span>
                    {b.total_allocated > 0
                      ? `${formatINR(b.total_allocated)} allocated · ${formatINR(unallocated)} unallocated`
                      : "No category allocations"}
                  </span>
                </div>

                {b.active && (
                  <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                    <span className="text-[12px] font-semibold t-secondary">
                      {b.type === "monthly" ? formatDayMonth(b.start_date) : "Project budget"}
                    </span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {me && (
        <div className="text-center text-[11px] font-semibold t-tertiary pt-8 pb-2">
          {me.role === "admin" ? "Admin" : "Member"} · {me.family_id ? "Family" : "No family"}
        </div>
      )}
    </div>
  );
}