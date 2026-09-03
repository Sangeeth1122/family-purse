"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconCalendar,
  IconChevronRight,
  IconHome,
  IconLink,
  IconLogout,
  IconMail,
  IconPencil,
  IconTags,
  IconUser,
  IconUserPlus,
} from "@tabler/icons-react";
import { initials } from "@/lib/format";
import type { Family, UserRow } from "@/lib/types";
import EditNameSheet from "@/components/edit-name-sheet";
import InviteMembersSheet from "@/components/invite-members-sheet";

export default function ProfileView({
  me,
  family,
  members,
  defaultEmail,
}: {
  me: UserRow;
  family: Family | null;
  members: UserRow[];
  defaultEmail: string;
}) {
  const router = useRouter();
  const [editingName, setEditingName] = useState(false);
  const [inviting, setInviting] = useState(false);

  const isAdmin = me.role === "admin";

  async function onLogout() {
    const { createClient } = await import("@/lib/supabase/client");
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="flex flex-col items-center pt-10 pb-6">
        <div className="relative">
          <div className="avatar" style={{ width: 76, height: 76, fontSize: 26 }}>
            {initials(me.name)}
          </div>
          <button
            type="button"
            aria-label="Edit name"
            className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-[var(--card)] border flex items-center justify-center t-secondary"
            style={{ borderColor: "var(--border)" }}
            onClick={() => setEditingName(true)}
          >
            <IconPencil size={12} />
          </button>
        </div>
        <h1 className="text-[17px] font-bold mt-3">{me.name}</h1>
        <p className="text-[12px] font-semibold t-tertiary mt-0.5">
          {me.role === "admin" ? "Admin" : "Member"}
          {family ? ` · ${family.name}` : ""}
        </p>
      </div>

      <div className="card mx-5 overflow-hidden">
        <Row leftIcon={<IconUser size={16} />} k="Name" v={me.name} onTap={() => setEditingName(true)} rightIcon={<IconPencil size={14} />} />
        <Row leftIcon={<IconMail size={16} />} k="Email" v={defaultEmail} rightIcon={<IconPencil size={14} />} />
      </div>

      {family && (
        <>
          <div className="section-label">Family Details</div>
          <div className="card mx-5 overflow-hidden">
            <Row leftIcon={<IconHome size={16} />} k="Family" v={family.name} />
            <Row
              leftIcon={<IconCalendar size={16} />}
              k="Member since"
              v={new Date(me.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            />
            <Row
              leftIcon={<IconUserPlus size={16} />}
              k="Members"
              v={`${members.length}`}
              onTap={() => router.push("/app/family/members")}
              rightIcon={<IconChevronRight size={14} />}
            />
          </div>
        </>
      )}

      {family && isAdmin && (
        <>
          <div className="mx-5 mt-3">
            <button
              type="button"
              className="card w-full p-4 flex items-center gap-3 text-left"
              style={{ borderColor: "var(--border)" }}
              onClick={() => setInviting(true)}
            >
              <span className="text-[16px] t-secondary flex-shrink-0">
                <IconLink size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[10.5px] font-bold t-tertiary uppercase tracking-[0.02em] mb-[3px]">
                  Family Invite Link
                </div>
                <div className="text-[13.5px] font-semibold">
                  Share link or code to invite members
                </div>
              </div>
              <span className="text-[14px] t-tertiary flex-shrink-0">
                <IconChevronRight size={14} />
              </span>
            </button>
          </div>
        </>
      )}

      {family && (
        <>
          <div className="section-label">Categories</div>
          <div className="card mx-5 overflow-hidden">
            <Row
              leftIcon={<IconTags size={16} />}
              k="Manage categories"
              v="Reorder, rename or deactivate"
              onTap={() => router.push("/app/family/categories")}
              rightIcon={<IconChevronRight size={14} />}
            />
          </div>
        </>
      )}

      <div className="mx-5 mt-6">
        <button type="button" className="btn btn-danger w-full" onClick={onLogout}>
          <IconLogout size={16} /> Log out
        </button>
        <p className="text-center text-[11px] font-semibold t-tertiary mt-5">
          Family Purse — self-hosted, no ads, no third parties.
        </p>
      </div>

      {editingName && (
        <EditNameSheet current={me.name} onClose={() => setEditingName(false)} />
      )}
      {inviting && family && (
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

function Row({
  leftIcon,
  k,
  v,
  rightIcon,
  onTap,
}: {
  leftIcon?: React.ReactNode;
  k: string;
  v: string;
  rightIcon?: React.ReactNode;
  onTap?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full flex items-center gap-3 px-4 py-3.5 border-t first:border-t-0 text-left disabled:opacity-100"
      style={{ borderColor: "var(--border)", cursor: onTap ? "pointer" : "default" }}
      disabled={!onTap}
    >
      {leftIcon && <span className="text-[16px] t-secondary flex-shrink-0">{leftIcon}</span>}
      <div className="flex-1 min-w-0">
        <div className="text-[10.5px] font-bold t-tertiary uppercase tracking-[0.02em] mb-[3px]">{k}</div>
        <div className="text-[13.5px] font-semibold">{v}</div>
      </div>
      {rightIcon && <span className="text-[14px] t-tertiary flex-shrink-0">{rightIcon}</span>}
    </button>
  );
}