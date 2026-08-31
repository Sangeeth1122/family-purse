"use client";

import { useState, useRef, useEffect, createElement } from "react";
import Link from "next/link";
import { IconUserX, IconShield, IconDots, IconArrowUpRight } from "@tabler/icons-react";
import { formatSigned, initials } from "@/lib/format";
import { categoryIcon } from "@/lib/category-icons";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const isOwner = member.id === family.owner_id;
  const tag = member.id === me.id ? "You" : isOwner ? "Owner" : member.role === "admin" ? "Admin" : "Member";
  const isSelf = member.id === me.id;
  const canManage = isAdmin && !isSelf;

  const tagStyle =
    isOwner || member.role === "admin"
      ? { background: "rgba(0,0,0,0.06)", color: "var(--text-secondary)" }
      : { background: "rgba(0,0,0,0.06)", color: "var(--text-secondary)" };

  return (
    <div className="min-h-screen pb-24">
      <div className="flex items-center justify-between px-5 pt-5 pb-1">
        <div className="flex items-center gap-3">
          <Link href="/app/family" className="icon-btn" aria-label="Back">
            <span aria-hidden="true" className="text-[16px] leading-none">‹</span>
          </Link>
          <h1 className="text-[17px] font-bold">Member</h1>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="icon-btn"
            aria-label="More actions"
            onClick={() => canManage && setMenuOpen((v) => !v)}
          >
            <IconDots size={18} />
          </button>
          {menuOpen && canManage && (
            <div
              className="absolute right-0 top-10 z-30 w-44 rounded-xl border p-1.5"
              style={{ background: "var(--card)", borderColor: "var(--border)", boxShadow: "0 6px 24px rgba(0,0,0,0.08)" }}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold text-left hover:bg-black/5"
                onClick={() => { setMenuOpen(false); setChangingRole(true); }}
              >
                <IconShield size={16} /> Change role
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold text-left hover:bg-black/5"
                style={{ color: "var(--red)" }}
                onClick={() => { setMenuOpen(false); setRemoving(true); }}
              >
                <IconUserX size={16} /> Remove member
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Profile hero (horizontal) */}
      <div className="flex items-center gap-3.5 px-5 pt-2.5 pb-1">
        <div
          className="rounded-full flex items-center justify-center shrink-0"
          style={{ width: 56, height: 56, fontSize: 20, fontWeight: 700, background: "rgba(0,0,0,0.08)", color: "var(--text-secondary)" }}
        >
          {initials(member.name)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[17px] font-bold truncate">{member.name}</h2>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={tagStyle}
            >
              {tag}
            </span>
          </div>
          <p className="text-[12.5px] font-medium t-tertiary truncate mt-0.5">
            {member.email} · Joined{" "}
            {new Date(member.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="card mx-5 mt-4.5 p-[18px] flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide t-secondary">
            Spent this month
          </div>
          <div className="text-[22px] font-bold num mt-1">
            {spendThisMonth > 0 ? formatSigned(spendThisMonth) : "₹0"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[15px] font-bold num">{txnCount}</div>
          <div className="text-[11px] font-semibold t-tertiary">transactions</div>
        </div>
      </div>

      {/* Spending by category */}
      <div className="px-5">
        <div className="section-label" style={{ padding: "20px 0 8px" }}>
          Spending by category
        </div>
      </div>
      <div className="px-5 flex flex-col gap-2">
        {byCategory.length > 0 ? (
          byCategory.map((row) => (
            <div key={row.categoryId ?? "uncat"} className="card px-4 py-[13px] flex items-center justify-between">
              <span className="flex items-center gap-2.5 text-[14px] font-semibold">
                <span className="txn-icon">
                  {createElement(categoryIcon(row.name, "expense"), { size: 17, stroke: 1.8 })}
                </span>
                {row.name}
              </span>
              <span className="text-[14px] font-bold num">{formatSigned(row.amount)}</span>
            </div>
          ))
        ) : (
          <div className="card p-4 text-center">
            <p className="text-[12.5px] font-semibold t-secondary">
              No personal spending tracked this month.
            </p>
          </div>
        )}
      </div>

      {/* Admin actions */}
      {isAdmin && (
        <>
          {canManage ? (
            <div className="flex gap-2.5 px-5 mt-6">
              <button type="button" className="btn btn-secondary flex-1" onClick={() => setChangingRole(true)}>
                <IconShield size={17} /> Change role
              </button>
              <button type="button" className="btn btn-danger flex-1" onClick={() => setRemoving(true)}>
                <IconUserX size={17} /> Remove
              </button>
            </div>
          ) : (
            <div className="card mx-5 mt-5 p-4">
              <p className="flex items-center gap-2 text-[12.5px] font-semibold t-secondary leading-relaxed">
                <IconArrowUpRight size={15} className="shrink-0" />
                This is you — you can&apos;t change your own role or remove yourself.
                Ask another admin if needed.
              </p>
            </div>
          )}
        </>
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