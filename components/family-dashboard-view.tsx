"use client";

import { useState } from "react";
import Link from "next/link";
import { IconUserPlus, IconUsers } from "@tabler/icons-react";
import { formatINR, formatFullDate, initials } from "@/lib/format";
import type { Family, UserRow } from "@/lib/types";
import type { FamilySpend } from "@/lib/family";
import InviteMembersSheet from "@/components/invite-members-sheet";

export default function FamilyDashboardView({
  me,
  family,
  members,
  spend,
  memberSpend,
  label,
  isAdmin,
}: {
  me: UserRow;
  family: Family;
  members: UserRow[];
  spend: FamilySpend;
  memberSpend: Record<string, number>;
  label: string;
  isAdmin: boolean;
}) {
  const [inviting, setInviting] = useState(false);

  const memberCount = members.length;
  const ownerId = family.owner_id;

  const pctOf = (v: number) =>
    spend.total > 0 ? Math.max(4, (v / spend.total) * 100) : 0;

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-6 pb-1">
        <div>
          <h1 className="text-[17px] font-bold tracking-tight">Family</h1>
          <div className="text-[12.5px] font-semibold t-secondary">{family.name}</div>
        </div>
        {isAdmin && (
          <button type="button" className="icon-btn" aria-label="Invite members" onClick={() => setInviting(true)}>
            <IconUserPlus size={19} />
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="px-5 mt-3">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold uppercase tracking-wide t-secondary">
              Spending · {label}
            </span>
            <span className="badge green">
              {memberCount} member{memberCount === 1 ? "" : "s"} · {spend.txnCount} txn
            </span>
          </div>
          <div className="text-[34px] font-bold num mt-1">{formatINR(spend.total)}</div>

          <div className="flex items-center gap-4 mt-4">
            <span className="flex items-center gap-1.5 text-[12.5px] font-bold t-primary">
              {formatINR(spend.personal)} <span className="t-tertiary font-semibold">personal</span>
            </span>
            <span className="flex items-center gap-1.5 text-[12.5px] font-bold t-primary">
              {formatINR(spend.projects)} <span className="t-tertiary font-semibold">projects</span>
            </span>
            <span className="flex items-center gap-1.5 text-[12.5px] font-bold t-primary">
              {formatINR(spend.loansPaid)} <span className="t-tertiary font-semibold">loans paid</span>
            </span>
          </div>
          <div className="bar-track" style={{ display: "flex" }}>
            <div
              className="bar-fill"
              style={{ width: `${pctOf(spend.personal)}%`, background: "var(--green)" }}
            />
            <div
              className="bar-fill"
              style={{ width: `${pctOf(spend.projects)}%`, background: "var(--red)", borderRadius: 0 }}
            />
            <div
              className="bar-fill"
              style={{ width: `${pctOf(spend.loansPaid)}%`, background: "#7A6FA8", borderRadius: 0 }}
            />
          </div>
        </div>
      </div>

      {/* Members */}
      <div className="px-5">
        <div className="flex items-center justify-between pt-5">
          <div className="text-[15px] font-bold">Members</div>
          <Link href="/app/family/members" className="text-[12px] font-bold t-secondary">
            Manage
          </Link>
        </div>
      </div>

      <div className="card mx-5 mt-3 p-1.5">
        {members.map((m, i) => {
          const spent = memberSpend[m.id] ?? 0;
          const isOwner = m.id === ownerId;
          const tag = m.id === me.id ? "You" : isOwner ? "Owner" : m.role === "admin" ? "Admin" : "Member";
          return (
            <Link
              key={m.id}
              href={`/app/family/${m.id}`}
              className={`flex items-center gap-3 rounded-lg px-3 py-3 ${i > 0 ? "border-t" : ""}`}
              style={{ borderColor: "var(--border)" }}
            >
              <div className="avatar" style={{ width: 38, height: 38, fontSize: 12 }}>
                {initials(m.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="txn-title">{m.name}</span>
                  <span className={`badge ${tag === "You" ? "green" : isOwner || m.role === "admin" ? "neutral" : ""}`}>
                    {tag}
                  </span>
                </div>
                <div className="txn-sub">Joined {formatFullDate(m.created_at)}</div>
              </div>
              <div className="text-right">
                <div className="text-[14px] font-bold num">{spent > 0 ? formatINR(spent) : "—"}</div>
                <div className="text-[10.5px] font-bold t-tertiary">this month</div>
              </div>
            </Link>
          );
        })}
      </div>

      {isAdmin && (
        <button
          type="button"
          onClick={() => setInviting(true)}
          className="card mx-5 mt-3 p-4 w-full flex items-center gap-3 dashed"
          style={{ borderStyle: "dashed" }}
        >
          <div className="txn-icon" style={{ color: "var(--green)" }}>
            <IconUsers size={17} />
          </div>
          <div className="text-left">
            <div className="text-[13.5px] font-bold">Invite someone to {family.name}</div>
            <div className="text-[11.5px] font-semibold t-secondary">Share the invite link or code</div>
          </div>
          <IconUserPlus size={18} className="ml-auto t-secondary" />
        </button>
      )}

      {inviting && (
        <InviteMembersSheet
          familyName={family.name}
          inviteCode={family.invite_code}
          members={members}
          onClose={() => setInviting(false)}
        />
      )}
    </div>
  );
}