import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  loadReportData,
  type ReportData,
} from "@/lib/reports-data";
import SavingsWaterfallView from "@/components/reports/savings-waterfall-view";
import ReportError from "@/components/reports/report-error";

export default async function SavingsWaterfallPage() {
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
    <SavingsWaterfallView
      categories={data.categories}
      txns={data.txns}
    />
  );
}