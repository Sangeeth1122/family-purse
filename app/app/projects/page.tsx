import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Project, ProjectMember, Transaction, UserRow } from "@/lib/types";
import { projectProgress, projectTransactions } from "@/lib/projects";
import ProjectsView, { type ProjectCardData } from "@/components/projects-view";

export default async function ProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [meRes, projectsRes, membersRes, usersRes, txnsRes] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("projects").select("*").order("created_at"),
    supabase.from("project_members").select("*"),
    supabase.from("users").select("id, name").order("name"),
    supabase.from("transactions").select("*"),
  ]);

  if (meRes.error || projectsRes.error || membersRes.error || usersRes.error || txnsRes.error)
    throw new Error("Could not load projects.");

  const me = meRes.data as UserRow | null;
  const projects = (projectsRes.data ?? []) as Project[];
  const members = (membersRes.data ?? []) as ProjectMember[];
  const users = (usersRes.data ?? []) as { id: string; name: string }[];
  const txns = (txnsRes.data ?? []) as Transaction[];

  const cards: ProjectCardData[] = projects.map((p) => {
    const prog = projectProgress(txns, p.id, p.budget);
    const scoped = projectTransactions(txns, p.id);
    const projectMembers = members.filter((m) => m.project_id === p.id);
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      budget: p.budget,
      target_date: p.target_date,
      spent: prog.spent,
      pctUsed: prog.pctUsed,
      over: prog.over,
      txnCount: scoped.length,
      members: projectMembers.map((m) => ({
        name: users.find((u) => u.id === m.user_id)?.name ?? "Family member",
        role: m.role,
      })),
    };
  });

  return <ProjectsView projects={cards} isAdmin={me?.role === "admin"} />;
}