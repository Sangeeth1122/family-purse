import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  loadReportData,
  type ReportData,
} from "@/lib/reports-data";
import IncomeVsExpenseView from "@/components/reports/income-vs-expense-view";
import ReportError from "@/components/reports/report-error";

export default async function IncomeVsExpensePage() {
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
    <IncomeVsExpenseView categories={data.categories} txns={data.txns} />
  );
}