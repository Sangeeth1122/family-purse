"use client";

import { useState } from "react";
import Link from "next/link";
import { IconChevronRight } from "@tabler/icons-react";
import { formatINR, initials } from "@/lib/format";
import { AddProjectButton } from "@/components/project-sheet";
import type { ProjectRole } from "@/lib/types";

export type ProjectCardData = {
  id: string;
  name: string;
  status: "active" | "archived";
  budget: number | null;
  target_date: string | null;
  spent: number;
  pctUsed: number | null;
  over: boolean;
  txnCount: number;
  members: { name: string; role: ProjectRole }[];
};

const ROLE_LABEL: Record<ProjectRole, string> = {
  owner: "Owner",
  contributor: "Contributor",
  viewer: "Viewer",
};

function chipOf(p: ProjectCardData) {
  return (
    <span
      className={`badge ${p.status === "active" ? "green" : "neutral"}`}
      style={{ textTransform: "capitalize" }}
    >
      {p.status}
    </span>
  );
}

function ProgressArea({ p }: { p: ProjectCardData }) {
  if (p.budget === null || p.budget <= 0) {
    return (
      <p className="text-[12px] font-semibold t-secondary mt-2">
        {formatINR(p.spent)} spent · no budget set
      </p>
    );
  }
  const fill = Math.min(100, p.pctUsed ?? 0);
  return (
    <div className="mt-3">
      <div className="h-[7px] rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.07)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${fill}%`,
            background: p.over
              ? "var(--red)"
              : "linear-gradient(90deg,var(--blue),#5a8be0)",
          }}
        />
      </div>
      <p className={`text-[12px] font-semibold mt-1.5 ${p.over ? "t-red" : "t-secondary"}`}>
        {formatINR(p.spent)} of {formatINR(p.budget)}
        {p.pctUsed != null ? ` · ${p.pctUsed}% used` : ""}
        {p.over ? " · over budget" : ""}
      </p>
    </div>
  );
}

export default function ProjectsView({
  projects,
  isAdmin,
}: {
  projects: ProjectCardData[];
  isAdmin: boolean;
}) {
  const [filter, setFilter] = useState<"all" | "active" | "archived">("all");
  const shown = projects.filter((p) => filter === "all" || p.status === filter);
  const activeCount = projects.filter((p) => p.status === "active").length;
  const archivedCount = projects.length - activeCount;

  return (
    <div className="min-h-screen pb-28">
      <div className="flex items-center gap-3 px-5 pt-6 pb-4">
        <Link href="/app/dashboard" className="icon-btn" aria-label="Back">
          <span aria-hidden="true" className="text-[16px] leading-none">‹</span>
        </Link>
        <h1 className="text-[17px] font-bold">Projects</h1>
      </div>

      {projects.length > 0 && (
        <div className="px-5 flex gap-2 mb-4">
          {(
            [
              ["all", `All ${projects.length}`],
              ["active", activeCount ? `Active ${activeCount}` : "Active"],
              ["archived", archivedCount ? `Archived ${archivedCount}` : "Archived"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`chip ${filter === key ? "active" : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="card mx-5 p-6 text-center">
          <p className="text-[13.5px] font-bold mb-1">No projects yet</p>
          <p className="text-[12.5px] font-semibold t-secondary leading-relaxed">
            Start a family project — a trip, a wedding, a renovation — log its
            spending as its own budget track, and keep everyone on the team in the
            loop. Family admins can create projects.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <div className="card mx-5 p-6 text-center">
          <p className="text-[13px] font-bold mb-1">Nothing {filter} here</p>
          <p className="text-[12.5px] font-semibold t-secondary">
            No {filter} projects right now.
          </p>
        </div>
      ) : (
        <div className="px-5 space-y-3">
          {shown.map((p) => {
            const avatarMembers = p.members.slice(0, 3);
            const overflow = p.members.length - avatarMembers.length;
            return (
              <Link
                key={p.id}
                href={`/app/projects/${p.id}`}
                className="card p-4 block"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-[15px] font-bold truncate">{p.name}</h2>
                      {chipOf(p)}
                    </div>
                    <p className="text-[11.5px] font-semibold t-tertiary mt-1">
                      {p.txnCount} {p.txnCount === 1 ? "transaction" : "transactions"}
                      {p.target_date ? ` · target ${p.target_date}` : ""}
                    </p>
                  </div>
                  <IconChevronRight size={16} className="t-tertiary flex-shrink-0 mt-1" />
                </div>

                <ProgressArea p={p} />

                <div className="flex items-center mt-3">
                  <div className="flex -space-x-1.5">
                    {avatarMembers.map((m, i) => (
                      <div
                        key={`${p.id}-${i}`}
                        className="avatar"
                        style={{ width: 26, height: 26, fontSize: 10, border: "2px solid var(--bg)" }}
                        title={`${m.name} · ${ROLE_LABEL[m.role]}`}
                      >
                        {initials(m.name)}
                      </div>
                    ))}
                    {overflow > 0 && (
                      <div
                        className="avatar"
                        style={{
                          width: 26,
                          height: 26,
                          fontSize: 10,
                          border: "2px solid var(--bg)",
                          background: "var(--border)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        +{overflow}
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] font-semibold t-tertiary ml-2">
                    {p.members.length} {p.members.length === 1 ? "person" : "people"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {isAdmin && <AddProjectButton />}
    </div>
  );
}