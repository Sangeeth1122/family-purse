"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { redirect } from "next/navigation";
import { IconWallet, IconCalendar, IconFolderOpen, IconLock, IconPencil, IconTrash, IconArrowLeft, IconPlus, IconX } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { formatINR, parseINR, toINRInput } from "@/lib/format";
import type { Category } from "@/lib/types";
import { useEsc } from "@/components/use-esc";

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

export default function BudgetEditPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{ role: string } | null>(null);
  const [budget, setBudget] = useState<{
    id: string;
    name: string;
    type: "monthly" | "project";
    total_amount: number;
    start_date: string;
    end_date: string;
    project_id: string | null;
    active: boolean;
  } | null>(null);
  const [allocations, setAllocations] = useState<{ id?: string; category_id: string; amount: string }[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<"monthly" | "project">("monthly");
  const [totalAmount, setTotalAmount] = useState("");
  const [month, setMonth] = useState("");
  const [projectId, setProjectId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);

  useEsc(true, () => router.back());

  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    (async () => {
      const [{ data: meRes }, { data: cats }, { data: projs }] = await Promise.all([
        supabase.from("users").select("role").eq("id", (await supabase.auth.getUser()).data.user?.id).maybeSingle(),
        supabase.from("categories").select("*").eq("system", false).order("sort_order"),
        supabase.from("projects").select("id, name").eq("status", "active"),
      ]);
      if (alive) {
        if (meRes) setMe(meRes as { role: string });
        if (cats) setCategories(cats as Category[]);
        if (projs) setProjects(projs as { id: string; name: string }[]);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.rpc("fp_get_budget_detail", { p_budget_id: id });
      if (alive && data) {
        const detail = data as {
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
          allocations: Array<{
            id: string;
            category_id: string;
            amount: number;
            category_name: string;
            category_color: string;
            spent: number;
          }>;
          total_spent: number;
        };
        setBudget(detail.budget);
        setName(detail.budget.name);
        setType(detail.budget.type);
        setTotalAmount(String(detail.budget.total_amount));
        if (detail.budget.type === "monthly") {
          setMonth(detail.budget.start_date.slice(0, 7));
        } else {
          setProjectId(detail.budget.project_id ?? "");
          setStartDate(detail.budget.start_date);
          setEndDate(detail.budget.end_date);
        }
        setAllocations(detail.allocations.map((a) => ({ id: a.id, category_id: a.category_id, amount: String(a.amount) })));
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  const totalAmountNum = parseINR(totalAmount);
  const allocatedTotal = allocations.reduce((s, a) => s + parseINR(a.amount), 0);
  const unallocated = totalAmountNum - allocatedTotal;
  const overAllocated = unallocated < 0;

  function validate(): string | null {
    if (!name.trim()) return "Enter a budget name.";
    if (totalAmountNum <= 0) return "Total budget must be greater than zero.";
    if (type === "monthly") {
      if (!month) return "Select a month.";
    } else {
      if (!projectId) return "Select a project.";
      if (!startDate) return "Select a start date.";
      if (!endDate) return "Select an end date.";
      if (endDate < startDate) return "End date cannot be before start date.";
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
      await supabase.rpc("fp_update_budget", {
        p_budget_id: id,
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
            p_budget_id: id,
            p_category_id: a.category_id,
            p_amount: parseINR(a.amount),
          });
        }
      }
      const existingIds = allocations.filter((a) => a.id).map((a) => a.id!);
      const keptIds = allocations.filter((a) => a.id).map((a) => a.id!);
      for (const aid of existingIds) {
        if (!keptIds.includes(aid)) {
          await supabase.rpc("fp_remove_budget_allocation", { p_allocation_id: aid });
        }
      }
      router.refresh();
      router.push(`/app/budgets/${id}`);
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

  if (loading) {
    return (
      <div className="min-h-screen pb-24 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!budget || !me) return null;
  if (me.role !== "admin") {
    return (
      <div className="min-h-screen pb-24 px-5 pt-24 text-center">
        <IconLock size={22} className="mx-auto mb-3 t-secondary" />
        <h1 className="text-[17px] font-bold mb-1">Admins only</h1>
        <p className="text-[12.5px] font-semibold t-secondary leading-relaxed mx-auto max-w-[280px]">
          Budget editing is kept with family admins.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="flex items-center gap-3 px-5 pt-5 pb-1">
        <button type="button" className="icon-btn" onClick={() => router.back()}>
          <IconArrowLeft size={18} stroke={1.8} />
        </button>
        <h1 className="text-[17px] font-bold">Edit Budget</h1>
      </div>

      <form onSubmit={onSubmit}>
        <div className="field">
          <span className="field-label">Budget Type</span>
          <div className="segmented">
            {BUDGET_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                className={`seg ${type === t.value ? "active" : ""}`}
                onClick={() => setType(t.value)}
                disabled
              >
                <t.icon size={14} stroke={1.8} className="mr-1" />
                {t.label}
              </button>
            ))}
          </div>
          <p className="field-hint">Budget type cannot be changed after creation.</p>
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
              disabled
            >
              <option value="">Select month</option>
              {monthOptions().map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <p className="field-hint">Monthly budget dates cannot be changed.</p>
          </div>
        )}

        {type === "project" && (
          <>
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
            <div className="field">
              <span className="field-label">Start Date</span>
              <input
                className="input"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <span className="field-label">End Date</span>
              <input
                className="input"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </>
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
              <div className="flex flex-wrap gap-2 mb-2">
                {allocations.map((a, i) => {
                  const cat = categories.find((c) => c.id === a.category_id);
                  return (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                      <span className="dot" style={{ background: cat?.color ?? "#888" }} />
                      <select
                        className="input flex-1 py-1.5 text-sm"
                        value={a.category_id}
                        onChange={(e) => updateAllocation(i, "category_id", e.target.value)}
                      >
                        {categories
                          .filter((c) => !allocations.some((aa, ii) => ii !== i && aa.category_id === c.id) || c.id === a.category_id)
                          .map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                      </select>
                      <input
                        className="input num w-24 py-1.5 text-sm"
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
          {busy ? "Saving…" : "Save Changes"}
        </button>
      </form>

      <div className="text-center text-[11px] font-semibold t-tertiary pt-8 pb-2">
        Editing {budget.name}
      </div>
    </div>
  );
}