"use client";

import { useState } from "react";
import Link from "next/link";
import { IconFilter } from "@tabler/icons-react";
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
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <h1 className="text-[20px] font-bold" style={{ letterSpacing: "-0.01em" }}>Projects</h1>
        <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} aria-label="Filter">
          <IconFilter size={18} />
        </button>
      </div>

      {projects.length > 0 && (
        <div className="px-5 pt-3 flex gap-2">
          {(
            [
              ["all", `All ${projects.length}`] as const,
              ["active", activeCount ? `Active ${activeCount}` : "Active"] as const,
              ["archived", archivedCount ? `Completed ${archivedCount}` : "Completed"] as const,
            ]
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
        <div className="px-5 space-y-2.5 pt-2.5">
          {shown.map((p) => {
            const avatarMembers = p.members.slice(0, 3);
            const overflow = p.members.length - avatarMembers.length;
            return (
              <Link
                key={p.id}
                href={`/app/projects/${p.id}`}
                className="card p-4 block"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-[15.5px] font-bold truncate">{p.name}</h2>
                    <p className="text-[12px] font-semibold t-tertiary mt-0.5">
                      {p.txnCount} {p.txnCount === 1 ? "transaction" : "transactions"}
                      {p.target_date ? ` · target ${p.target_date}` : ""}
                    </p>
                  </div>
                  {chipOf(p)}
                </div>

                {p.budget !== null && p.budget > 0 && (
                  <div className="bar-track mb-2.5">
                    <div
                      className="bar-fill"
                      style={{ width: `${Math.min(100, p.pctUsed ?? 0)}%` }}
                    />
                  </div>
                )}

                <div className="flex items-baseline justify-between">
                  <span className="text-[14.5px] font-bold num">
                    {formatINR(p.spent)}{" "}
                    <span className="text-[12px] font-semibold t-tertiary">
                      {p.budget !== null && p.budget > 0
                        ? `/ ${formatINR(p.budget)} budget${p.over ? " · over" : ""}`
                        : "no budget set"}
                    </span>
                  </span>
                  <div className="flex items-center">
                    {avatarMembers.map((m, i) => (
                      <span
                        key={`${p.id}-${i}`}
                        className="avatar"
                        style={{
                          width: 22,
                          height: 22,
                          fontSize: 9.5,
                          border: "2px solid var(--card)",
                          marginLeft: i === 0 ? 0 : -7,
                        }}
                        title={`${m.name} · ${ROLE_LABEL[m.role]}`}
                      >
                        {initials(m.name)}
                      </span>
                    ))}
                    {overflow > 0 && (
                      <span
                        className="avatar"
                        style={{
                          width: 22,
                          height: 22,
                          fontSize: 9.5,
                          marginLeft: -7,
                          border: "2px solid var(--card)",
                          background: "var(--border)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        +{overflow}
                      </span>
                    )}
                  </div>
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