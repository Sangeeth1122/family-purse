"use client";

import { useState, useEffect } from "react";
import { useEsc } from "@/components/use-esc";
import { useRouter } from "next/navigation";
import { IconPlus, IconX, IconCalendar, IconFolderOpen, IconTrash, IconChevronDown } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { formatINR, parseINR, toINRInput } from "@/lib/format";
import type { Category } from "@/lib/types";

const BUDGET_TYPES = [
  { value: "monthly" as const, label: "Monthly", icon: IconCalendar, desc: "A budget for a calendar month" },
  { value: "project" as const, label: "Project", icon: IconFolderOpen, desc: "A budget for a specific project" },
] as const;

function monthOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = -12; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-IN", { month: "long", year: "numeric" });
    opts.push({ value, label });
  }
  return opts;
}

function getMonthBounds(monthValue: string): { start: string; end: string } {
  const [year, month] = monthValue.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0);
  const end = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
  return { start, end };
}

export function AddBudgetButton({ className = "" }: { className?: string } = {}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`icon-btn ${className}`}
        aria-label="Add budget"
        onClick={() => setOpen(true)}
      >
        <IconPlus size={18} />
      </button>
      <AddBudgetSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export default function AddBudgetSheet({
  open,
  onClose,
  budget,
}: {
  open: boolean;
  onClose: () => void;
  budget?: BudgetDetail | null;
}) {
  const router = useRouter();
  const editing = !!budget;
  const [type, setType] = useState<"monthly" | "project">(budget?.budget?.type ?? "monthly");
  const [name, setName] = useState(budget?.budget?.name ?? "");
  const [totalAmount, setTotalAmount] = useState(budget?.budget?.total_amount ? String(budget.budget.total_amount) : "");
  const [month, setMonth] = useState(budget?.budget?.start_date ? budget.budget.start_date.slice(0, 7) : "");
  const [projectId, setProjectId] = useState(budget?.budget?.project_id ?? "");
  const [allocations, setAllocations] = useState<{ id?: string; category_id: string; amount: string }[]>(
    budget?.allocations?.map((a) => ({ id: a.id, category_id: a.category_id, amount: String(a.amount) })) ?? [],
  );
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; created_at: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);

  useEsc(true, onClose);

  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    (async () => {
      const [{ data: cats }, { data: projs }] = await Promise.all([
        supabase.from("categories").select("*").eq("system", false).order("sort_order"),
        supabase.from("projects").select("id, name, created_at").eq("status", "active"),
      ]);
      if (alive) {
        if (cats) setCategories(cats as Category[]);
        if (projs) setProjects(projs as { id: string; name: string; created_at: string }[]);
      }
    })();
    return () => { alive = false; };
  }, []);

  const totalAmountNum = parseINR(totalAmount);
  const allocatedTotal = allocations.reduce((s, a) => s + parseINR(a.amount), 0);
  const unallocated = totalAmountNum - allocatedTotal;
  const overAllocated = unallocated < 0;

  function getProjectDates(projectId: string): { start: string; end: string } {
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      const start = project.created_at.slice(0, 10);
      const end = "2099-12-31";
      return { start, end };
    }
    return { start: "", end: "2099-12-31" };
  }

  function validate(): string | null {
    if (!name.trim()) return "Enter a budget name.";
    if (totalAmountNum <= 0) return "Total budget must be greater than zero.";
    if (type === "monthly") {
      if (!month) return "Select a month.";
    } else {
      if (!projectId) return "Select a project.";
    }
    for (const a of allocations) {
      if (parseINR(a.amount) <= 0) return "Allocation amounts must be greater than zero.";
    }
    const cats = allocations.map((a) => a.category_id);
    if (new Set(cats).size !== cats.length) return "Same category cannot be added twice to the same budget.";
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
    try {
      const supabase = createClient();
      let budgetId: string;

      if (editing) {
        budgetId = budget!.budget.id;
        await supabase.rpc("fp_update_budget", {
          p_budget_id: budgetId,
          p_name: name.trim(),
          p_total_amount: totalAmountNum,
        });
        for (const a of allocations) {
          if (a.id) {
            await supabase.rpc("fp_update_budget_allocation", {
              p_allocation_id: a.id,
              p_amount: parseINR(a.amount),
            });
          } else {
            await supabase.rpc("fp_add_budget_allocation", {
              p_budget_id: budgetId,
              p_category_id: a.category_id,
              p_amount: parseINR(a.amount),
            });
          }
        }
        const existingIds = budget?.allocations?.map((a) => a.id) ?? [];
        const keptIds = allocations.filter((a) => a.id).map((a) => a.id!);
        for (const id of existingIds) {
          if (!keptIds.includes(id)) {
            await supabase.rpc("fp_remove_budget_allocation", { p_allocation_id: id });
          }
        }
      } else {
        let start: string, end: string;
        if (type === "monthly") {
          const bounds = getMonthBounds(month);
          start = bounds.start;
          end = bounds.end;
        } else {
          const bounds = getProjectDates(projectId);
          start = bounds.start;
          end = bounds.end;
        }
        const { data, error: err } = await supabase.rpc("fp_create_budget", {
          p_name: name.trim(),
          p_type: type,
          p_total_amount: totalAmountNum,
          p_start_date: start,
          p_end_date: end,
          p_project_id: type === "project" ? projectId : null,
        });
        if (err) throw new Error(err.message);
        budgetId = data;
        for (const a of allocations) {
          await supabase.rpc("fp_add_budget_allocation", {
            p_budget_id: budgetId,
            p_category_id: a.category_id,
            p_amount: parseINR(a.amount),
          });
        }
      }
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function addAllocation() {
    const available = categories.filter((c) => !allocations.some((a) => a.category_id === c.id));
    if (available.length > 0) {
      setAllocations([...allocations, { category_id: available[0].id, amount: "" }]);
    }
  }

  function removeAllocation(idx: number) {
    setAllocations(allocations.filter((_, i) => i !== idx));
  }

  function updateAllocation(idx: number, field: "category_id" | "amount", value: string) {
    setAllocations(allocations.map((a, i) => (i === idx ? { ...a, [field]: value } : a)));
  }

  if (!open) return null;

  return (
    <div
      className="sheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-budget-title"
    >
      <div className="sheet-wrap">
        <button type="button" className="sheet-close-float" aria-label="Close" onClick={onClose}>
          <IconX size={18} stroke={1.8} />
        </button>
        <div className="sheet">
          <div className="handle" />
          <div className="sheet-head">
            <h2 id="add-budget-title">{editing ? "Edit Budget" : "Create Budget"}</h2>
          </div>

        <form onSubmit={onSubmit}>
          <div className="field">
            <span className="field-label">Budget Type</span>
            <button
              type="button"
              className="input text-left"
              onClick={() => setShowTypePicker(!showTypePicker)}
            >
              <span className="flex items-center justify-between">
                <span>
                  {BUDGET_TYPES.find((t) => t.value === type)?.label}
                </span>
                <IconChevronDown size={15} className="t-secondary" style={{ transform: showTypePicker ? "rotate(180deg)" : "none" }} />
              </span>
            </button>
            {showTypePicker && (
              <div className="flex flex-wrap gap-2 mt-2">
                {BUDGET_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className={`chip ${type === t.value ? "active" : ""}`}
                    onClick={() => {
                      setType(t.value);
                      setShowTypePicker(false);
                    }}
                  >
                    <t.icon size={14} stroke={1.8} className="mr-1" />
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <span className="field-label">Name</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === "monthly" ? "e.g. September 2026" : "e.g. Goa Trip"}
              maxLength={60}
              required
            />
          </div>

          {type === "monthly" && (
            <div className="field">
              <span className="field-label">Month</span>
              <select
                className="input"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                required
              >
                <option value="">Select month</option>
                {monthOptions().map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {type === "project" && (
            <div className="field">
              <span className="field-label">Project</span>
              <select
                className="input"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                required
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="field">
            <span className="field-label">Total Budget</span>
            <div className="relative">
              <span
                className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold"
                style={{ color: "var(--text-secondary)" }}
              >
                ₹
              </span>
              <input
                className="input pl-8 num"
                inputMode="decimal"
                value={totalAmount}
                onChange={(e) => setTotalAmount(toINRInput(e.target.value))}
                placeholder="0"
                required
              />
            </div>
          </div>

          <div className="field">
            <span className="field-label">Category Allocations <span className="font-normal t-tertiary">(optional)</span></span>
            {allocations.length === 0 ? (
              <button
                type="button"
                className="btn btn-secondary w-full"
                onClick={addAllocation}
              >
                <IconPlus size={14} /> Add Category
              </button>
            ) : (
              <>
                <div className="flex flex-col gap-2 mb-2">
                  {allocations.map((a, i) => {
                    const cat = categories.find((c) => c.id === a.category_id);
                    return (
                      <div key={i} className="flex items-center gap-2 p-2.5 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                        <span className="dot" style={{ background: cat?.color ?? "#888" }} />
                        <div className="relative flex-1 min-w-0">
                          <select
                            className="category-select input w-full py-2 text-sm appearance-none"
                            value={a.category_id}
                            onChange={(e) => updateAllocation(i, "category_id", e.target.value)}
                          >
                            {categories
                              .filter((c) => !allocations.some((aa, ii) => ii !== i && aa.category_id === c.id) || c.id === a.category_id)
                              .map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                          </select>
                          <IconChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-[14px] t-secondary pointer-events-none" size={16} />
                        </div>
                        <input
                          className="input num w-16 py-2 text-sm"
                          inputMode="decimal"
                          value={a.amount}
                          onChange={(e) => updateAllocation(i, "amount", toINRInput(e.target.value))}
                          placeholder="₹0"
                        />
                        <button
                          type="button"
                          className="p-1.5 t-red"
                          onClick={() => removeAllocation(i)}
                        >
                          <IconTrash size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary w-full"
                  onClick={addAllocation}
                  disabled={allocations.length >= categories.length}
                >
                  <IconPlus size={14} /> Add Another Category
                </button>
                <div className="flex items-center justify-between mt-2 text-[11px] font-semibold t-tertiary">
                  <span>{allocatedTotal > 0 ? `${formatINR(allocatedTotal)} allocated` : "Nothing allocated yet"}</span>
                  <span className={overAllocated ? "t-red" : ""}>
                    {overAllocated ? `₹${formatINR(-unallocated)} over-allocated` : `₹${formatINR(unallocated)} unallocated`}
                  </span>
                </div>
              </>
            )}
          </div>

          {error && <p className="text-[12.5px] font-semibold t-red mb-3">{error}</p>}

          <button className="btn btn-primary w-full" disabled={busy}>
            {busy ? "Saving…" : editing ? "Save Changes" : "Create Budget"}
          </button>
        </form>
        </div>
      </div>
    </div>
  );
}

type BudgetDetail = {
  budget: {
    id: string;
    name: string;
    type: "monthly" | "project";
    total_amount: number;
    start_date: string;
    end_date: string;
    project_id: string | null;
    active: boolean;
  };
  allocations: { id: string; category_id: string; amount: number }[];
};