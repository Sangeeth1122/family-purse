import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatDayMonth, formatINR } from "@/lib/format";
import { loanBalanceOf, loanPartyName } from "@/lib/balances";
import type { Category, Loan, Reminder, Transaction, UserRow } from "@/lib/types";
import LoanDetailView, { type LoanHistoryRow } from "@/components/loan-detail-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("loans")
    .select("counterparty_name")
    .eq("id", id)
    .maybeSingle();
  return {
    title:
      data && "counterparty_name" in data && data.counterparty_name
        ? `${data.counterparty_name} — Loan — Family Purse`
        : "Loan — Family Purse",
  };
}

export default async function LoanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [loanRes, meRes, txnsRes, catsRes, membersRes, remindersRes] = await Promise.all([
    supabase.from("loans").select("*").eq("id", id).maybeSingle(),
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("transactions").select("*"),
    supabase.from("categories").select("*"),
    supabase.from("users").select("*"),
    supabase.from("reminders").select("*").eq("loan_id", id).eq("status", "pending").order("due_date"),
  ]);

  if (loanRes.error) {
    return (
      <div className="min-h-screen pb-24">
        <div className="flex items-center gap-3 px-5 pt-5 pb-4">
          <Link href="/app/loans" className="icon-btn" aria-label="Back">
            <span aria-hidden="true" className="text-[16px] leading-none">‹</span>
          </Link>
          <h1 className="text-[17px] font-bold">Loans</h1>
        </div>
        <div className="card mx-5 p-6 text-center">
          <p className="text-[13.5px] font-bold mb-1">Couldn&apos;t load this loan</p>
          <p className="text-[12.5px] font-semibold t-secondary mb-4">{loanRes.error.message}</p>
          <Link href="/app/loans" className="btn btn-secondary w-full">
            Back to loans
          </Link>
        </div>
      </div>
    );
  }

  const loan = loanRes.data as Loan | null;
  if (!loan) notFound(); // RLS hides unauthorised/foreign loans -> 404

  const me = meRes.data as UserRow | null;
  const txns = (txnsRes.data ?? []) as Transaction[];
  const cats = (catsRes.data ?? []) as Category[];
  const members = (membersRes.data ?? []) as UserRow[];
  const reminders = (remindersRes.data ?? []) as Reminder[];

  const isAdmin = me?.role === "admin";
  const memberName = (uid: string) => members.find((m) => m.id === uid)?.name ?? "Family member";
  const partyName = loanPartyName(loan, memberName);
  const balance = loanBalanceOf(loan, txns).balance;
  const isGiven = loan.direction === "given";

  const catName = (cid: string | null | undefined) => cats.find((c) => c.id === cid)?.name ?? null;

  const linked = txns
    .filter((t) => t.linked_loan_id === loan.id)
    .sort((a, b) => (a.date === b.date ? b.created_at.localeCompare(a.created_at) : b.date.localeCompare(a.date)));

  const rows: LoanHistoryRow[] = [];
  let hasActivity = 0;
  let hasLinkedTransfer = false;

  for (const t of linked) {
    const subtitle = t.note ?? null;
    if (t.kind === "settlement" && t.type === "loan_repayment") {
      rows.push({
        key: t.id,
        date: t.date,
        title: isGiven ? "Repayment received" : "Repayment made",
        subtitle,
        tone: isGiven ? "income" : "expense",
        display: `${isGiven ? "+" : "−"}${formatINR(t.amount)}`,
      });
      hasActivity++;
    } else if (t.kind === "pl" && t.type === "interest_income") {
      rows.push({
        key: t.id,
        date: t.date,
        title: "Interest received",
        subtitle,
        tone: "interest",
        display: `+${formatINR(t.amount)}`,
      });
      hasActivity++;
    } else if (t.kind === "pl" && t.type === "interest_expense") {
      rows.push({
        key: t.id,
        date: t.date,
        title: "Interest paid",
        subtitle,
        tone: "interest",
        display: `−${formatINR(t.amount)}`,
      });
      hasActivity++;
    } else if (t.kind === "pl" && (t.type === "expense" || t.type === "revenue") && catName(t.category_id) === "Balance Write-off") {
      rows.push({
        key: t.id,
        date: t.date,
        title: "Written off",
        subtitle,
        tone: "neutral",
        display: `−${formatINR(t.amount)}`,
      });
      hasActivity++;
    } else if (t.kind === "settlement" && t.type === "transfer") {
      rows.push({
        key: t.id,
        date: t.date,
        title: "Loan started — principal",
        subtitle,
        tone: "neutral",
        display: formatINR(t.amount),
      });
      hasLinkedTransfer = true;
    }
  }

  if (!hasLinkedTransfer) {
    rows.push({
      key: "loan-start",
      date: loan.start_date,
      title: "Loan started — principal",
      subtitle: loan.note ?? null,
      tone: "neutral",
      display: formatINR(loan.principal_amount),
    });
  }

  let reminder: { caption: string; value: string } | null = null;
  const pendingDue = reminders.filter((r) => r.due_date != null);
  if (pendingDue.length > 0) {
    const rm = pendingDue[0];
    reminder = {
      caption:
        rm.type === "loan_due"
          ? "Next installment due"
          : rm.type === "loan_interest_check"
            ? "Next interest reminder"
            : "Reminder",
      value: `${formatDayMonth(rm.due_date!)} · ${rm.title}`,
    };
  } else if (loan.reminder_frequency === "monthly") {
    const d = loan.due_date ?? loan.start_date;
    reminder = {
      caption: "Next interest reminder",
      value: `${formatDayMonth(d)} · monthly`,
    };
  }

  return (
    <LoanDetailView
      loan={loan}
      partyName={partyName}
      balance={balance}
      isAdmin={isAdmin}
      rows={rows}
      hasActivity={hasActivity}
      reminder={reminder}
    />
  );
}