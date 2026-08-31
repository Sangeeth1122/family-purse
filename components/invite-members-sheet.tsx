"use client";

import { useState } from "react";
import { useEsc } from "@/components/use-esc";
import { useRouter } from "next/navigation";
import { IconCheck, IconLink, IconUserPlus, IconX } from "@tabler/icons-react";
import { initials } from "@/lib/format";
import type { UserRow } from "@/lib/types";

export default function InviteMembersSheet({
  familyName,
  inviteCode,
  members,
  onClose,
}: {
  familyName: string;
  inviteCode: string;
  members: UserRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const joinLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/setup`
      : `/setup`;

  async function copy(kind: "code" | "link") {
    const value = kind === "code" ? inviteCode : joinLink;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard may be unavailable; still confirm visually.
    }
    setCopied(kind);
    setTimeout(() => setCopied(null), 1600);
  }

  useEsc(true, onClose);

  return (
    <div
      className="sheet-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-members-title"
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="handle" />
        <div className="sheet-head">
          <h2 id="invite-members-title">Invite members</h2>
          <button type="button" className="close-btn" aria-label="Close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>

        <div className="flex items-start gap-3 px-5">
          <div className="avatar" style={{ width: 44, height: 44, fontSize: 14 }}>
            {initials(familyName)}
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-bold">{familyName}</div>
            <div className="text-[12.5px] font-semibold t-secondary leading-relaxed mt-0.5">
              Share the invite link or code. Anyone who joins becomes a{" "}
              <span className="t-primary">Member</span> — an admin can promote them
              later.
            </div>
          </div>
        </div>

        <div className="mx-5 mt-5">
          <div className="text-[11.5px] font-bold uppercase tracking-wide t-secondary mb-1.5">
            Invite link
          </div>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border"
            style={{ borderColor: "var(--border)" }}
            onClick={() => copy("link")}
          >
            <span className="text-[13.5px] font-bold text-left break-all leading-snug">
              {joinLink}
            </span>
            {copied === "link" ? (
              <span className="flex items-center gap-1 text-[12px] font-bold t-green shrink-0">
                <IconCheck size={14} /> Copied
              </span>
            ) : (
              <IconLink size={16} className="t-secondary shrink-0" />
            )}
          </button>
        </div>

        <div className="mx-5 mt-4">
          <div className="text-[11.5px] font-bold uppercase tracking-wide t-secondary mb-1.5">
            Or the code
          </div>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border"
            style={{ borderColor: "var(--border)" }}
            onClick={() => copy("code")}
          >
            <span className="text-[15px] font-bold tracking-wide num">{inviteCode}</span>
            {copied === "code" ? (
              <span className="flex items-center gap-1 text-[12px] font-bold t-green">
                <IconCheck size={14} /> Copied
              </span>
            ) : (
              <span className="text-[12px] font-bold t-secondary">Copy code</span>
            )}
          </button>
          <p className="field-hint">
            They open the set-up screen, paste the link or the code, and join
            {members.length > 0 ? ` — ${members.length} member${members.length === 1 ? "" : "s"} already in ${familyName}` : ""}.
          </p>
        </div>

        <div className="flex gap-2.5 px-5 mt-6">
          <button type="button" className="btn btn-secondary flex-1" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn btn-primary flex-1"
            onClick={() => {
              onClose();
              router.push("/app/family/members");
            }}
          >
            <IconUserPlus size={16} /> Manage members
          </button>
        </div>
      </div>
    </div>
  );
}