"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AcceptInvitationButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function accept() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("fp_accept_project_invitation", {
      p_token: token,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    const projectId = data?.project_id as string | undefined;
    setDone(true);
    if (projectId) {
      setTimeout(() => router.push(`/app/projects/${projectId}`), 1200);
    }
  }

  if (done) {
    return (
      <p className="text-[13px] font-semibold t-green mb-4">
        Invitation accepted! Redirecting to project…
      </p>
    );
  }

  return (
    <div>
      {error && <p className="text-[12.5px] font-semibold t-red mb-3">{error}</p>}
      <button className="btn btn-primary w-full" disabled={busy} onClick={accept}>
        {busy ? "Accepting…" : "Accept invitation"}
      </button>
    </div>
  );
}
