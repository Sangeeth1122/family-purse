import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReportsHome from "@/components/reports/reports-home";

export default async function ReportsHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <ReportsHome />;
}