"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconX } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/format";
import type { ProjectInvitation, ProjectRole } from "@/lib/types";

const ROLE_LABEL: Record<ProjectRole, string> = {
  owner: "Owner",
  contributor: "Contributor",
  viewer: "Viewer",
};

export default function PendingInvitations({
  invitations,
  nameMap,
}: {
  invitations: ProjectInvitation[];
  nameMap: Map<string, string>;
}) {
  const router = useRouter();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (invitations.length === 0) return null;

  async function cancel(id: string) {
    setBusy(true);
    setCancellingId(id);
    const supabase = createClient();
    const { error } = await supabase.rpc("fp_cancel_project_invitation", {
      p_invitation_id: id,
    });
    setBusy(false);
    setCancellingId(null);
    if (!error) router.refresh();
  }

  return (
    <div className="mx-5 mt-3">
      <div className="flex items-center gap-2 px-0 pb-2">
        <span className="text-[11px] font-bold uppercase tracking-wide t-tertiary">
          Pending invitations · {invitations.length}
        </span>
      </div>
      {invitations.map((inv) => (
        <div
          key={inv.id}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 mb-1.5"
          style={{ background: "rgba(0,0,0,0.03)" }}
        >
          <div className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>
            {initials(nameMap.get(inv.invitee_id) ?? "?")}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold truncate">{nameMap.get(inv.invitee_id) ?? "Unknown"}</p>
            <p className="text-[11px] font-semibold t-tertiary">
              {ROLE_LABEL[inv.role]} · invited {new Date(inv.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </p>
          </div>
          <button
            type="button"
            className="close-btn"
            style={{ width: 26, height: 26 }}
            aria-label={`Cancel invitation for ${nameMap.get(inv.invitee_id) ?? "Unknown"}`}
            disabled={busy && cancellingId === inv.id}
            onClick={() => cancel(inv.id)}
          >
            <IconX size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
