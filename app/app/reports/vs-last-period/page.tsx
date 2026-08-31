import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  loadReportData,
  type ReportData,
} from "@/lib/reports-data";
import VsLastPeriodView from "@/components/reports/vs-last-period-view";
import ReportError from "@/components/reports/report-error";

export default async function VsLastPeriodPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let data: ReportData | null = null;
  let failed = false;
  try {
    data = await loadReportData();
  } catch {
    failed = true;
  }
  if (failed || !data) return <ReportError />;
  return (
    <VsLastPeriodView categories={data.categories} txns={data.txns} />
  );
}