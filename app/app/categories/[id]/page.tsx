import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/format";
import type { Budget, Category, Transaction, UserRow } from "@/lib/types";
import TransactionRow from "@/components/transaction-row";

function monthBounds(d = new Date()) {
  const vm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const from = `${vm}-01`;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const to = `${vm}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

export default async function CategoryTransactionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isUncategorised = id === "uncategorised";

  let category: Category | null = null;
  if (!isUncategorised) {
    const { data } = await supabase
      .from("categories")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    category = (data as Category | null) ?? null;
    if (!category) notFound();
  }

  const { from, to } = monthBounds();

  const [txnsRes, catsRes, budgetsRes, membersRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .eq("kind", "pl")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("categories").select("*"),
    supabase.from("budgets").select("*"),
    supabase.from("users").select("*"),
  ]);

  const txns = (txnsRes.data ?? []) as Transaction[];
  const cats = (catsRes.data ?? []) as Category[];
  const budgets = (budgetsRes.data ?? []) as Budget[];
  const members = (membersRes.data ?? []) as UserRow[];

  const filtered = txns.filter((t) =>
    isUncategorised ? t.category_id === null : t.category_id === id,
  );

  const catName = (cid: string | null) => {
    const c = cats.find((c) => c.id === cid);
    return c ? { name: c.name, color: c.color } : null;
  };

  const spent = filtered.reduce(
    (s, t) => s + (t.type === "expense" || t.type === "interest_expense" ? t.amount : 0),
    0,
  );

  const myBudget = budgets.find(
    (b) => b.scope_type === "personal" && b.scope_id === user.id && b.category_id === id,
  );

  const rows = filtered.map((t) => ({
    id: t.id,
    amount: t.amount,
    date: t.date,
    note: t.note,
    categoryName: catName(t.category_id)?.name ?? "Uncategorised",
    categoryColor: catName(t.category_id)?.color ?? null,
    type: t.type,
    creatorName: members.find((m) => m.id === t.created_by)?.name ?? "Family member",
    showCreator: true,
  }));

  type Group = { label: string; items: typeof rows };
  const groups: Group[] = [];
  for (const r of rows) {
    const weekday = new Date(r.date).toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "short",
    });
    const last = groups[groups.length - 1];
    if (last && last.label === weekday) last.items.push(r);
    else groups.push({ label: weekday, items: [r] });
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="flex items-center gap-3 px-5 pt-6 pb-4">
        <Link href="/app/budgets" className="icon-btn" aria-label="Back">
          <span aria-hidden="true" className="text-[16px] leading-none">‹</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="dot" style={{ background: category?.color ?? "#8A867C" }} />
          <h1 className="text-[17px] font-bold">
            {category?.name ?? "Uncategorised"}
          </h1>
        </div>
      </div>

      <div className="card mx-5 p-5 flex items-center justify-between">
        <div>
          <div className="text-[11.5px] font-bold uppercase tracking-wide t-secondary">
            Spent this month
          </div>
          <div className="text-[26px] font-bold num mt-1">{formatINR(spent)}</div>
        </div>
        {myBudget && (
          <div className="text-right">
            <div className="text-[11.5px] font-bold uppercase tracking-wide t-secondary">
              Budget
            </div>
            <div className="text-[15px] font-bold num mt-1">{formatINR(myBudget.amount)}</div>
          </div>
        )}
      </div>

      <div className="px-5 flex flex-col gap-3 mt-5">
        {groups.length === 0 && (
          <div className="card p-6 text-center">
            <p className="text-[13.5px] font-bold mb-1">Nothing here yet</p>
            <p className="text-[12.5px] font-semibold t-secondary">
              Transactions in this category will show up here.
            </p>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.label}>
            <div className="text-[11px] font-bold uppercase tracking-wide t-tertiary mb-2 px-1">
              {g.label}
            </div>
            <div className="flex flex-col gap-2">
              {g.items.map((r) => (
                <TransactionRow key={r.id} t={r} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}