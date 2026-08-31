import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PageShell from "@/components/page-shell";

const configured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function ConfigNotice() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-10 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[rgba(0,0,0,0.06)] flex items-center justify-center mb-5 text-[22px]">
        💼
      </div>
      <h1 className="text-[17px] font-bold">Supabase isn’t configured</h1>
      <p className="text-[12.5px] font-semibold t-secondary leading-relaxed mt-2">
        Copy <b className="t-primary">.env.example</b> to{" "}
        <b className="t-primary">.env.local</b>, add your project URL and anon key, then run
        the migrations in <b className="t-primary">supabase/migrations/</b>.
      </p>
    </div>
  );
}

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!configured) {
    return <ConfigNotice />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, name, role, family_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/setup");
  if (!profile.family_id) redirect("/setup");

  return <PageShell>{children}</PageShell>;
}