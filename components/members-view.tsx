"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconDots, IconUserPlus, IconSearch } from "@tabler/icons-react";
import { formatFullDate, initials, formatINRExact } from "@/lib/format";
import type { Family, UserRow } from "@/lib/types";
import type { OpenBalance } from "@/lib/family";
import InviteMembersSheet from "@/components/invite-members-sheet";
import ChangeRoleDialog from "@/components/change-role-dialog";
import RemoveMemberDialog from "@/components/remove-member-dialog";

export default function MembersView({
  me,
  family,
  members,
  openBalances,
  isAdmin,
}: {
  me: UserRow;
  family: Family;
  members: UserRow[];
  openBalances: Record<string, OpenBalance>;
  isAdmin: boolean;
}) {
  const [query, setQuery] = useState("");
  const [inviting, setInviting] = useState(false);
  const [menuFor, setMenuFor] = useState<UserRow | null>(null);
  const [changingRole, setChangingRole] = useState<UserRow | null>(null);
  const [removing, setRemoving] = useState<UserRow | null>(null);

  const filtered = useMemo(
    () =>
      query.trim() === ""
        ? members
        : members.filter((m) =>
            m.name.toLowerCase().includes(query.trim().toLowerCase()),
          ),
    [members, query],
  );

  return (
    <div className="min-h-screen pb-24">
      <div className="px-5 pt-5 pb-1">
        <div className="flex items-center gap-3">
          <Link href="/app/family" className="icon-btn" aria-label="Back">
            <span aria-hidden="true" className="text-[16px] leading-none">‹</span>
          </Link>
          <h1 className="text-[17px] font-bold">Members</h1>
          {isAdmin && (
            <button type="button" className="ml-auto icon-btn" aria-label="Invite members" onClick={() => setInviting(true)}>
              <IconUserPlus size={19} />
            </button>
          )}
        </div>
      </div>

      <div className="px-5 mt-2">
        <span className="text-[12px] font-semibold t-tertiary">{members.length} members</span>
      </div>

      <div className="px-5 mt-3">
        <label className="relative block">
          <IconSearch
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 t-tertiary"
          />
          <input
            className="input pl-10"
            placeholder="Search members…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      <div className="card mx-5 mt-3 p-1.5">
        {filtered.length === 0 ? (
          <p className="text-center text-[12.5px] font-semibold t-secondary py-6">
            No members match &ldquo;{query}&rdquo;.
          </p>
        ) : (
          filtered.map((m, i) => {
            const isOwner = m.id === family.owner_id;
            const isSelf = m.id === me.id;
            const isAdminUser = m.role === "admin";
            const meta = isOwner || isAdminUser ? "Admin since family was created" : `Joined ${formatFullDate(m.created_at)}`;
            const balance = openBalances[m.id];
            return (
              <div
                key={m.id}
                className={`flex items-center gap-3 rounded-lg px-4 py-3.5 ${i > 0 ? "border-t" : ""}`}
                style={{ borderColor: "var(--border)" }}
              >
                <Link href={`/app/family/${m.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="avatar" style={{ width: 40, height: 40, fontSize: 14 }}>
                    {initials(m.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13.5px] font-bold">{m.name}</span>
                      {isSelf && (
                        <span className="text-[9.5px] font-bold t-tertiary bg-[var(--bg)] border px-1.5 py-[1px] rounded-full" style={{ borderColor: "var(--border)" }}>
                          You
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-medium t-tertiary truncate">
                      {meta}
                      {balance && balance.count > 0 && (
                        <span className="t-red"> · owes {formatINRExact(balance.amount)}</span>
                      )}
                    </div>
                  </div>
                </Link>
                <span
                  className="text-[11px] font-bold px-3 py-1.5 rounded-full flex-shrink-0"
                  style={
                    isAdminUser
                      ? { background: "var(--text)", color: "var(--bg)" }
                      : { background: "var(--bg)", color: "var(--text-secondary)", border: "1px solid var(--border)" }
                  }
                >
                  {isOwner ? "Owner" : isAdminUser ? "Admin" : "Member"}
                </span>
                {isAdmin && !isSelf ? (
                  <button
                    type="button"
                    className="p-1.5 -mr-1"
                    aria-label={`Actions for ${m.name}`}
                    onClick={() => setMenuFor(m)}
                  >
                    <IconDots size={18} className="t-secondary" />
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <p className="mx-5 mt-4 text-[11.5px] font-semibold t-tertiary leading-relaxed">
        Removing a member who still has an open loan balance with the family asks
        you to settle it first (the same balance-warning flow used everywhere).
        Members keep their personal history when they leave.
      </p>

      {/* Role / remove action menu */}
      {menuFor && isAdmin && menuFor.id !== me.id && (
        <div className="dialog-overlay" onClick={() => setMenuFor(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-1">
              <div className="avatar" style={{ width: 40, height: 40, fontSize: 13 }}>
                {initials(menuFor.name)}
              </div>
              <div>
                <h2 className="text-[16px] font-bold">{menuFor.name}</h2>
                <p className="text-[11.5px] font-semibold t-secondary">
                  {menuFor.role === "admin" ? "Admin" : "Member"} · {family.name}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 mt-4">
              <button
                type="button"
                className="btn btn-secondary w-full"
                onClick={() => {
                  const m = menuFor;
                  setMenuFor(null);
                  setChangingRole(m);
                }}
              >
                {menuFor.role === "admin" ? "Demote to member" : "Promote to admin"}
              </button>
              <button
                type="button"
                className="btn btn-danger w-full"
                onClick={() => {
                  const m = menuFor;
                  setMenuFor(null);
                  setRemoving(m);
                }}
              >
                Remove from family
              </button>
              <button type="button" className="btn btn-ghost w-full" onClick={() => setMenuFor(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {changingRole && (
        <ChangeRoleDialog member={changingRole} meId={me.id} onClose={() => setChangingRole(null)} />
      )}
      {removing && (
        <RemoveMemberDialog
          member={removing}
          meId={me.id}
          familyName={family.name}
          openBalance={openBalances[removing.id] ?? { amount: 0, count: 0 }}
          onClose={() => setRemoving(null)}
        />
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