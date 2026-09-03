"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconArrowDown,
  IconGripVertical,
  IconPencil,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { formatINR } from "@/lib/format";
import type { Category } from "@/lib/types";
import EditCategorySheet from "@/components/edit-category-sheet";

export default function CategoryManagerView({
  categories,
  myBudget,
  tagged,
  familyId,
  meId,
}: {
  categories: Category[];
  myBudget: Record<string, number>;
  tagged: Record<string, number>;
  familyId: string;
  meId: string;
}) {
  const router = useRouter();
  const [order, setOrder] = useState<string[]>(() => categories.filter((c) => c.active).map((c) => c.id));
  const [prevCategoryIds, setPrevCategoryIds] = useState(() =>
    categories.filter((c) => c.active).map((c) => c.id).join(","),
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const activeCategories = categories.filter((c) => c.active);
  const inactiveCategories = categories.filter((c) => !c.active);

  const categoryIds = activeCategories.map((c) => c.id).join(",");
  if (categoryIds !== prevCategoryIds && dragIndex === null) {
    setPrevCategoryIds(categoryIds);
    setOrder(activeCategories.map((c) => c.id));
  }

  const byId = new Map(categories.map((c) => [c.id, c]));

  async function persist(next: string[]) {
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().rpc("fp_reorder_categories", {
      p_order: next.map((id) => ({ id })),
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      setOrder(activeCategories.map((c) => c.id));
      return;
    }
    router.refresh();
  }

  function onDropAt(index: number) {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const next = [...order];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    setOrder(next);
    setDragIndex(null);
    setOverIndex(null);
    void persist(next);
  }

  async function toggleActive(category: Category) {
    setToggling(category.id);
    setError(null);
    try {
      const { error: err } = await createClient()
        .from("categories")
        .update({ active: !category.active })
        .eq("id", category.id);
      if (err) throw new Error(err.message);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update category");
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="flex items-center gap-3 px-5 pt-5 pb-1">
        <Link href="/app/family" className="icon-btn" aria-label="Back">
          <span aria-hidden="true" className="text-[16px] leading-none">‹</span>
        </Link>
        <h1 className="text-[17px] font-bold">Categories</h1>
        <button
          type="button"
          className="icon-btn ml-auto"
          aria-label="Add category"
          onClick={() => setCreating(true)}
        >
          <IconPlus size={19} />
        </button>
      </div>

      <p className="mx-5 mt-3 text-[12px] font-semibold t-secondary leading-relaxed">
        Drag to reorder the family categories. This order shows up everywhere —
        in every member&apos;s expense picker and in reports.
        {busy && <span className="t-tertiary"> Reordering…</span>}
      </p>
      {error && <p className="mx-5 mt-2 text-[12.5px] font-semibold t-red">{error}</p>}

      <div className="card mx-5 mt-3 p-1.5">
        {order.map((id, i) => {
          const c = byId.get(id);
          if (!c) return null;
          const budget = myBudget[c.id] ?? 0;
          const count = tagged[c.id] ?? 0;
          return (
            <div
              key={c.id}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (overIndex !== i) setOverIndex(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                onDropAt(i);
              }}
              className={`flex items-center gap-2.5 px-3 py-3 rounded-lg transition-shadow ${
                i > 0 ? "border-t" : ""
              } ${overIndex === i && dragIndex !== null && dragIndex !== i ? "shadow-[0_2px_0_var(--text)]" : ""}`}
              style={i > 0 ? { borderColor: "var(--border)" } : undefined}
            >
              <IconGripVertical size={16} className="t-tertiary shrink-0" />
              <span className="dot" style={{ background: c.color }} />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold truncate">{c.name}</div>
                <div className="text-[11.5px] font-semibold t-tertiary">
                  {budget > 0 ? `${formatINR(budget)} / month` : "No budget set"}
                  {count > 0 && ` · ${count} txn${count === 1 ? "" : "s"}`}
                </div>
              </div>
              <button
                type="button"
                className="p-1.5 t-secondary"
                aria-label={`Edit ${c.name}`}
                onClick={() => setEditing(c)}
              >
                <IconPencil size={16} />
              </button>
              <button
                type="button"
                className="p-1.5 t-secondary"
                aria-label={`Deactivate ${c.name}`}
                onClick={() => toggleActive(c)}
                disabled={toggling === c.id}
              >
                {toggling === c.id ? <IconX size={16} /> : <IconTrash size={16} />}
              </button>
            </div>
          );
        })}
      </div>

      {inactiveCategories.length > 0 && (
        <div className="card mx-5 mt-3 p-1.5">
          <div className="flex items-center gap-2 px-3 py-3">
            <IconArrowDown size={16} className="t-tertiary" />
            <span className="text-[12.5px] font-bold uppercase tracking-wide t-secondary">
              Inactive ({inactiveCategories.length})
            </span>
          </div>
          {inactiveCategories.map((c) => {
            const budget = myBudget[c.id] ?? 0;
            const count = tagged[c.id] ?? 0;
            return (
              <div
                key={c.id}
                className={`flex items-center gap-2.5 px-3 py-3 rounded-lg transition-shadow border-t`}
                style={{ borderColor: "var(--border)", opacity: 0.5 }}
              >
                <span className="dot" style={{ background: c.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold truncate">{c.name}</div>
                  <div className="text-[11.5px] font-semibold t-tertiary">
                    {budget > 0 ? `${formatINR(budget)} / month` : "No budget set"}
                    {count > 0 && ` · ${count} txn${count === 1 ? "" : "s"}`}
                  </div>
                </div>
                <button
                  type="button"
                  className="p-1.5 t-green"
                  aria-label={`Reactivate ${c.name}`}
                  onClick={() => toggleActive(c)}
                  disabled={toggling === c.id}
                >
                  {toggling === c.id ? <IconX size={16} /> : <IconArrowDown size={16} />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className="card mx-5 mt-3 w-full p-4 flex items-center justify-center gap-2 text-[13.5px] font-bold t-secondary"
        style={{ borderStyle: "dashed" }}
        onClick={() => setCreating(true)}
      >
        <IconPlus size={17} /> Add a new category
      </button>

      <p className="mx-5 mt-5 text-[11.5px] font-semibold t-tertiary leading-relaxed">
        System categories such as &ldquo;Interest Paid&rdquo;, &ldquo;Interest
        Received&rdquo;, and &ldquo;Balance Write-off&rdquo; power the loan engine
        and stay fixed — they can&apos;t be renamed, recoloured, or deleted.
      </p>

      {creating && (
        <EditCategorySheet
          familyId={familyId}
          meId={meId}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <EditCategorySheet
          familyId={familyId}
          meId={meId}
          category={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}