import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatDayMonth } from "@/lib/format";
import type {
  Budget,
  Category,
  Project,
  ProjectMember,
  Transaction,
  UserRow,
} from "@/lib/types";
import { projectTransactions } from "@/lib/projects";
import ProjectDetailView, {
  type ProjectCatBudget,
  type ProjectPerson,
  type ProjectTxnRow,
} from "@/components/project-detail-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  return {
    title:
      data && "name" in data && data.name
        ? `${data.name} — Project — Family Purse`
        : "Project — Family Purse",
  };
}

function periodLabel(b: Budget): string {
  if (b.period === "monthly") return "Monthly";
  if (b.period === "one_time") return "One-time";
  if (b.start_date && b.end_date) {
    return `${formatDayMonth(b.start_date)} – ${formatDayMonth(b.end_date)}`;
  }
  return "Custom";
}

export default async function ProjectDetailPage({
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

  const [projectRes, meRes, membersRes, txnsRes, catsRes, usersRes, budgetsRes] =
    await Promise.all([
      supabase.from("projects").select("*").eq("id", id).maybeSingle(),
      supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("project_members").select("*"),
      supabase.from("transactions").select("*"),
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("users").select("*").order("name"),
      supabase.from("budgets").select("*"),
    ]);

  if (projectRes.error) {
    return (
      <div className="min-h-screen pb-24">
        <div className="flex items-center gap-3 px-5 pt-6 pb-4">
          <Link href="/app/projects" className="icon-btn" aria-label="Back">
            <span aria-hidden="true" className="text-[16px] leading-none">‹</span>
          </Link>
          <h1 className="text-[17px] font-bold">Projects</h1>
        </div>
        <div className="card mx-5 p-6 text-center">
          <p className="text-[13.5px] font-bold mb-1">Couldn&apos;t load this project</p>
          <p className="text-[12.5px] font-semibold t-secondary mb-4">
            {projectRes.error.message}
          </p>
          <Link href="/app/projects" className="btn btn-secondary w-full">
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  const project = projectRes.data as Project | null;
  if (!project) notFound(); // RLS hides foreign projects -> 404

  const me = meRes.data as UserRow | null;
  const members = (membersRes.data ?? []) as ProjectMember[];
  const txns = (txnsRes.data ?? []) as Transaction[];
  const cats = (catsRes.data ?? []) as Category[];
  const users = (usersRes.data ?? []) as UserRow[];
  const budgets = (budgetsRes.data ?? []) as Budget[];

  const projectMembers = members.filter((m) => m.project_id === project.id);
  const myRole = projectMembers.find((m) => m.user_id === user.id)?.role ?? null;
  const people: ProjectPerson[] = projectMembers.map((m) => ({
    user_id: m.user_id,
    name: users.find((u) => u.id === m.user_id)?.name ?? "Family member",
    role: m.role,
  }));

  const scoped = projectTransactions(txns, project.id).sort((a, b) =>
    a.date === b.date
      ? b.created_at.localeCompare(a.created_at)
      : b.date.localeCompare(a.date),
  );

  const catOf = (cid: string | null) => cats.find((c) => c.id === cid);

  const txnRows: ProjectTxnRow[] = scoped.map((t) => {
    const cat = catOf(t.category_id);
    const isExpense = t.type === "expense" || t.type === "interest_expense";
    return {
      key: t.id,
      date: t.date,
      categoryName: cat?.name ?? "Uncategorised",
      categoryColor: cat?.color ?? null,
      note: t.note,
      via: t.spent_through === "credit_card" ? "Credit Card" : "Manual",
      isExpense,
      amount: t.amount,
    };
  });

  const projectBudgets = budgets.filter(
    (b) => b.scope_type === "project" && b.scope_id === project.id,
  );
  const expenseOf = (catId: string): number =>
    scoped
      .filter(
        (t) =>
          t.category_id === catId &&
          (t.type === "expense" || t.type === "interest_expense"),
      )
      .reduce((s, t) => s + t.amount, 0);

  const catBudgets: ProjectCatBudget[] = projectBudgets.map((b) => {
    const cat = catOf(b.category_id);
    return {
      key: b.id,
      categoryName: cat?.name ?? "Uncategorised",
      categoryColor: cat?.color ?? null,
      period: periodLabel(b),
      amount: b.amount,
      spent: expenseOf(b.category_id ?? ""),
    };
  });

  return (
    <ProjectDetailView
      project={project}
      meId={user.id}
      myRole={myRole}
      isAdmin={me?.role === "admin"}
      people={people}
      catBudgets={catBudgets}
      txnRows={txnRows}
    />
  );
}