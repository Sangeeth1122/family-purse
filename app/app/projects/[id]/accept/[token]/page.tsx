import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProjectInvitation, ProjectRole } from "@/lib/types";
import AcceptInvitationButton from "@/components/accept-invitation-button";

const ROLE_LABEL: Record<ProjectRole, string> = {
  owner: "Owner",
  contributor: "Contributor",
  viewer: "Viewer",
};

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ id: string; token: string }>;
}) {
  const { id, token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [invRes, projectRes] = await Promise.all([
    supabase
      .from("project_invitations")
      .select("*")
      .eq("token", token)
      .eq("project_id", id)
      .maybeSingle(),
    supabase.from("projects").select("name, status").eq("id", id).maybeSingle(),
  ]);

  const invitation = invRes.data as ProjectInvitation | null;
  const project = projectRes.data as { name: string; status: string } | null;

  if (!invitation || !project) {
    return (
      <div className="min-h-screen pb-24 px-5 pt-24 text-center">
        <h1 className="text-[17px] font-bold mb-1">Invitation not found</h1>
        <p className="text-[12.5px] font-semibold t-secondary leading-relaxed mb-5">
          This invitation link is invalid or has been removed.
        </p>
        <Link href="/app/projects" className="btn btn-primary inline-flex">
          Back to projects
        </Link>
      </div>
    );
  }

  const isExpired = new Date(invitation.expires_at) < new Date();
  const isCancelled = invitation.status === "cancelled";
  const isAccepted = invitation.status === "accepted";
  const isInvalid = isExpired || isCancelled || isAccepted;

  if (!user) {
    redirect(`/login?next=/app/projects/${id}/accept/${token}`);
  }

  const isForMe = invitation.invitee_id === user.id;

  return (
    <div className="min-h-screen pb-24 px-5 pt-24 text-center">
      <div className="card mx-auto max-w-sm p-6">
        <h1 className="text-[17px] font-bold mb-1">{project.name}</h1>
        <p className="text-[13px] font-semibold t-secondary mb-4">
          You&apos;ve been invited as{" "}
          <span className="font-bold">{ROLE_LABEL[invitation.role]}</span>
        </p>

        {isInvalid ? (
          <p className="text-[12.5px] font-semibold t-red mb-4">
            {isExpired && "This invitation has expired."}
            {isCancelled && "This invitation has been cancelled."}
            {isAccepted && "This invitation has already been accepted."}
          </p>
        ) : !isForMe ? (
          <p className="text-[12.5px] font-semibold t-red mb-4">
            This invitation is not for your account.
          </p>
        ) : (
          <AcceptInvitationButton token={token} />
        )}

        <Link href="/app/projects" className="btn btn-secondary w-full mt-2">
          Back to projects
        </Link>
      </div>
    </div>
  );
}
