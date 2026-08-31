"use client";

import { useState } from "react";
import Link from "next/link";
import { IconUserPlus } from "@tabler/icons-react";
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
  isAdmin,
}: {
  me: UserRow;
  family: Family;
  members: UserRow[];
  spend: FamilySpend;
  memberSpend: Record<string, number>;
  isAdmin: boolean;
}) {
  const [inviting, setInviting] = useState(false);

  const memberCount = members.length;
  const ownerId = family.owner_id;

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <h1 className="text-[20px] font-bold" style={{ letterSpacing: "-0.01em" }}>{family.name}</h1>
        {isAdmin && (
          <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} aria-label="Invite members" onClick={() => setInviting(true)}>
            <IconUserPlus size={18} />
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="card mx-5 mt-3 p-5">
        <div className="text-[12px] font-semibold t-secondary uppercase" style={{ letterSpacing: "0.04em", marginBottom: 6 }}>
          Family spending this month
        </div>
        <div className="text-[26px] font-bold num">{formatINR(spend.total)}</div>
        <div className="text-[12.5px] font-semibold t-tertiary mt-1">
          Across {memberCount} {memberCount === 1 ? "member" : "members"} · {spend.txnCount} {spend.txnCount === 1 ? "transaction" : "transactions"}
        </div>

        <div className="flex gap-2.5 mt-4">
          <div className="flex-1">
            <div className="text-[11px] font-bold t-tertiary uppercase" style={{ letterSpacing: "0.04em", marginBottom: 4 }}>Personal</div>
            <div className="text-[15px] font-bold num">{formatINR(spend.personal)}</div>
          </div>
          <div className="flex-1">
            <div className="text-[11px] font-bold t-tertiary uppercase" style={{ letterSpacing: "0.04em", marginBottom: 4 }}>Projects</div>
            <div className="text-[15px] font-bold num">{formatINR(spend.projects)}</div>
          </div>
          <div className="flex-1">
            <div className="text-[11px] font-bold t-tertiary uppercase" style={{ letterSpacing: "0.04em", marginBottom: 4 }}>Loans paid</div>
            <div className="text-[15px] font-bold num">{formatINR(spend.loansPaid)}</div>
          </div>
        </div>
      </div>

      {/* Members */}
      <div className="section-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Members · {memberCount}</span>
        <Link href="/app/family/members" className="action">Manage</Link>
      </div>

      <div className="px-5 flex flex-col gap-2.5">
        {members.map((m) => {
          const spent = memberSpend[m.id] ?? 0;
          const isOwner = m.id === ownerId;
          const roleTag = isOwner ? "Owner" : m.role === "admin" ? "Admin" : "Member";
          const you = m.id === me.id ? "You · " : "";
          return (
            <Link
              key={m.id}
              href={`/app/family/${m.id}`}
              className="card px-4 py-3.5 flex items-center gap-3"
            >
              <div className="avatar" style={{ width: 42, height: 42, fontSize: 15 }}>
                {initials(m.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[14.5px] font-bold truncate">{m.name}</span>
                  <span className="role-tag">{roleTag}</span>
                </div>
                <div className="member-sub">
                  {you}Joined {formatFullDate(m.created_at)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[14.5px] font-bold num">{spent > 0 ? formatINR(spent) : "—"}</div>
                <div className="text-[10.5px] font-semibold t-tertiary">this month</div>
              </div>
            </Link>
          );
        })}
      </div>

      {isAdmin && (
        <button
          type="button"
          onClick={() => setInviting(true)}
          className="mx-5 mt-3 w-[calc(100%-40px)] flex items-center justify-center gap-2 px-4 py-3.5 border-2 border-dashed rounded-[8px]"
          style={{ borderColor: "rgba(0,0,0,0.15)", color: "var(--text-secondary)", fontWeight: 600, fontSize: 14 }}
        >
          <IconUserPlus size={16} /> Invite a family member
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