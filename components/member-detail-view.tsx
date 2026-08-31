"use client";

import { useState } from "react";
import Link from "next/link";
import { IconArrowUpRight, IconUserX, IconShield } from "@tabler/icons-react";
import { formatINR, formatFullDate, initials } from "@/lib/format";
import type { Family, UserRow } from "@/lib/types";
import type { OpenBalance } from "@/lib/family";
import ChangeRoleDialog from "@/components/change-role-dialog";
import RemoveMemberDialog from "@/components/remove-member-dialog";

export type MemberCategory = {
  categoryId: string | null;
  name: string;
  color: string;
  amount: number;
};

export default function MemberDetailView({
  me,
  member,
  family,
  spendThisMonth,
  txnCount,
  byCategory,
  openBalance,
  isAdmin,
}: {
  me: UserRow;
  member: UserRow;
  family: Family;
  spendThisMonth: number;
  txnCount: number;
  byCategory: MemberCategory[];
  openBalance: OpenBalance;
  isAdmin: boolean;
}) {
  const [changingRole, setChangingRole] = useState(false);
  const [removing, setRemoving] = useState(false);

  const isOwner = member.id === family.owner_id;
  const tag = member.id === me.id ? "You" : isOwner ? "Owner" : member.role === "admin" ? "Admin" : "Member";
  const isSelf = member.id === me.id;
  const canManage = isAdmin && !isSelf;

  return (
    <div className="min-h-screen pb-24">
      <div className="flex items-center gap-3 px-5 pt-6 pb-1">
        <Link href="/app/family" className="icon-btn" aria-label="Back">
          <span aria-hidden="true" className="text-[16px] leading-none">‹</span>
        </Link>
        <h1 className="text-[17px] font-bold">Member</h1>
      </div>

      {/* Hero */}
      <div className="flex flex-col items-center pt-4 pb-6">
        <div className="avatar" style={{ width: 74, height: 74, fontSize: 24 }}>
          {initials(member.name)}
        </div>
        <div className="flex items-center gap-2 mt-3">
          <h2 className="text-[19px] font-bold">{member.name}</h2>
          <span className={`badge ${tag === "You" ? "green" : "neutral"}`}>{tag}</span>
        </div>
        <p className="text-[12.5px] font-semibold t-secondary mt-1">{member.email}</p>
        <p className="text-[11.5px] font-semibold t-tertiary mt-0.5">Joined {formatFullDate(member.created_at)}</p>
      </div>

      {/* Summary */}
      <div className="card mx-5 p-5">
        <div className="flex items-center justify-between">
          <span className="text-[11.5px] font-bold uppercase tracking-wide t-secondary">
            Spent · this month
          </span>
          <span className="badge neutral">{txnCount} txn</span>
        </div>
        <div className="text-[30px] font-bold num mt-1">
          {spendThisMonth > 0 ? formatINR(spendThisMonth) : "₹0"}
        </div>
        <div className="flex items-center gap-3 mt-3 text-[12px] font-semibold t-secondary leading-snug">
          Personal spending only — shared project and loan payments live with the
          family.
        </div>
      </div>

      {/* Spending by category */}
      <div className="px-5">
        <div className="section-label" style={{ padding: "20px 0 8px" }}>
          Spending by category
        </div>
      </div>
      <div className="card mx-5 p-5">
        {byCategory.length > 0 ? (
          byCategory.map((row, i) => (
            <div key={row.categoryId ?? "uncat"} className={i > 0 ? "flex items-center justify-between mt-3.5" : "flex items-center justify-between"}>
              <span className="flex items-center gap-2 text-[13.5px] font-bold">
                <span className="dot" style={{ background: row.color }} />
                {row.name}
              </span>
              <span className="text-[13.5px] font-bold num">{formatINR(row.amount)}</span>
            </div>
          ))
        ) : (
          <p className="text-[12.5px] font-semibold t-secondary text-center py-2">
            No personal spending tracked this month.
          </p>
        )}
      </div>

      {/* Admin actions */}
      {isAdmin && (
        <div className="px-5 mt-6 flex flex-col gap-2.5">
          <div className="text-[11.5px] font-bold uppercase tracking-wide t-secondary">
            Manage member
          </div>
          {canManage ? (
            <>
              <button type="button" className="btn btn-secondary w-full" onClick={() => setChangingRole(true)}>
                <IconShield size={16} /> Change role
              </button>
              <button type="button" className="btn btn-danger w-full" onClick={() => setRemoving(true)}>
                <IconUserX size={16} /> Remove from family
              </button>
            </>
          ) : (
            <div className="card p-4">
              <p className="flex items-center gap-2 text-[12.5px] font-semibold t-secondary leading-relaxed">
                <IconArrowUpRight size={15} className="shrink-0" />
                This is you — you can&apos;t change your own role or remove yourself.
                Ask another admin if needed.
              </p>
            </div>
          )}
          <p className="field-hint">
            Removing a member with an open loan balance asks you to settle it first —
            balances with {family.name} become read-only after they leave.
          </p>
        </div>
      )}

      {changingRole && canManage && (
        <ChangeRoleDialog member={member} meId={me.id} onClose={() => setChangingRole(false)} />
      )}
      {removing && canManage && (
        <RemoveMemberDialog
          member={member}
          meId={me.id}
          familyName={family.name}
          openBalance={openBalance}
          onClose={() => setRemoving(false)}
        />
      )}
    </div>
  );
}