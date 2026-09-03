import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Family, UserRow } from "@/lib/types";
import ProfileView from "@/components/profile-view";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!me) redirect("/setup");

  const [familyRes, membersRes] = await Promise.all([
    supabase.from("families").select("*").eq("id", me.family_id).maybeSingle(),
    supabase.from("users").select("*").order("created_at"),
  ]);

  const family = me.family_id ? (familyRes.data as Family | null) : null;
  const members = (((membersRes.data ?? []) as UserRow[]) || []).filter(
    (m) => !family || m.family_id === family.id,
  );

  return (
    <ProfileView
      me={me as UserRow}
      family={family}
      members={members}
      defaultEmail={user.email ?? ""}
    />
  );
}