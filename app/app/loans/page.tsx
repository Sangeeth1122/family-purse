import Link from "next/link";
import { redirect } from "next/navigation";
import {
  IconArrowDownLeft,
  IconArrowUpRight,
  IconBan,
  IconBuildingBank,
  IconChevronRight,
  IconPercentage,
  IconScale,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { formatDayMonth, formatINR, initials } from "@/lib/format";
import {
  isInstitutionName,
  loanBalances,
  loanPartyName,
  round2,
} from "@/lib/balances";
import type { Loan, Transaction, UserRow } from "@/lib/types";
import { AddLoanButton } from "@/components/add-loan-sheet";

function loanMeta(loan: Loan): string {
  const rate =
    loan.interest_rate != null ? `${loan.interest_rate}% annual` : "Interest-free";
  const due = loan.due_date
    ? `due ${formatDayMonth(loan.due_date)}`
    : "no due date";
  return `${rate} · ${due}`;
}

function Avatar({ loan, name }: { loan: Loan; name: string }) {
  const external = loan.counterparty_user_id === null;
  if (external && isInstitutionName(name)) {
    return (
      <div className="avatar external">
        <IconBuildingBank size={16} />
      </div>
    );
  }
  return <div className={`avatar ${external ? "external" : ""}`}>{initials(name)}</div>;
}

function LoanRowLink({
  loan,
  name,
  balance,
}: {
  loan: Loan;
  name: string;
  balance: number;
}) {
  const isGiven = loan.direction === "given";
  return (
    <Link
      href={`/app/loans/${loan.id}`}
      className="flex items-center gap-3 px-4 py-3.5 border-b"
      style={{ borderColor: "var(--border)" }}
    >
      <Avatar loan={loan} name={name} />
      <div className="flex-1 min-w-0">
        <div className="txn-title truncate">{name}</div>
        <div className="text-[11.5px] font-semibold t-tertiary mt-0.5 flex items-center gap-1.5">
          {loan.interest_rate != null ? (
            <IconPercentage size={12} />
          ) : (
            <IconBan size={12} />
          )}
          {loanMeta(loan)}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className={`text-[14px] font-bold num ${isGiven ? "t-green" : "t-red"}`}>
          {formatINR(balance)}
        </div>
        <div className="text-[10.5px] font-semibold t-tertiary mt-0.5">
          of {formatINR(loan.principal_amount)}
        </div>
      </div>
      <IconChevronRight size={15} className="t-tertiary" />
    </Link>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-center gap-2 px-5 pt-5 pb-2">
        <span className="t-secondary">{icon}</span>
        <h2 className="text-[13px] font-bold uppercase tracking-wide t-secondary">
          {title}
        </h2>
      </div>
      <div className="mx-5 overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)" }}>
        {children}
      </div>
    </>
  );
}

export default async function LoansPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [meRes, loansRes, txnsRes, membersRes] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("loans").select("*").order("start_date"),
    supabase.from("transactions").select("*"),
    supabase.from("users").select("*").order("name"),
  ]);

  if (meRes.error || loansRes.error || txnsRes.error || membersRes.error) {
    return <ErrorState message={meRes.error?.message ?? loansRes.error?.message ?? txnsRes.error?.message ?? membersRes.error?.message ?? "Something went wrong."} />;
  }

  const me = meRes.data as UserRow | null;
  const loans = (loansRes.data ?? []) as Loan[];
  const txns = (txnsRes.data ?? []) as Transaction[];
  const members = (membersRes.data ?? []) as UserRow[];
  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "Family member";
  const partyName = (l: Loan) => loanPartyName(l, memberName);

  const balances = loanBalances(loans, txns);
  const given = loans.filter((l) => l.direction === "given");
  const taken = loans.filter((l) => l.direction === "taken");
  const givenTotal = round2(
    given.reduce((s, l) => s + (balances.get(l.id)?.balance ?? 0), 0),
  );
  const takenTotal = round2(
    taken.reduce((s, l) => s + (balances.get(l.id)?.balance ?? 0), 0),
  );
  const net = round2(givenTotal - takenTotal);

  const balanceOf = (l: Loan) => balances.get(l.id)?.balance ?? 0;

  return (
    <div className="min-h-screen pb-28">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <Link href="/app/dashboard" className="icon-btn" aria-label="Back">
          <span aria-hidden="true" className="text-[16px] leading-none">‹</span>
        </Link>
        <h1 className="text-[17px] font-bold">Loans</h1>
      </div>

      {loans.length === 0 ? (
        <div className="card mx-5 p-6 text-center">
          <IconScale size={22} className="mx-auto mb-3 t-tertiary" />
          <p className="text-[13.5px] font-bold mb-1">No loans yet</p>
          <p className="text-[12.5px] font-semibold t-secondary leading-relaxed">
            Add a loan to track what family and friends owe you — or what you
            owe — as a clear principal balance with repayments.
          </p>
        </div>
      ) : (
        <>
          <div className="card mx-5 p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11.5px] font-bold uppercase tracking-wide t-secondary">
                Net lending position
              </span>
              <span className={`text-[22px] font-bold num ${net >= 0 ? "t-green" : "t-red"}`}>
                {net >= 0 ? "+" : "−"}
                {formatINR(Math.abs(net))}
              </span>
            </div>
            <div className="flex items-stretch gap-4 mt-4">
              <div className="flex-1">
                <div className="text-[11px] font-semibold t-tertiary mb-1">
                  You&apos;re owed
                </div>
                <div className="text-[15px] font-bold num t-green">
                  {formatINR(givenTotal)}
                </div>
              </div>
              <div className="w-px bg-[var(--border)]" />
              <div className="flex-1">
                <div className="text-[11px] font-semibold t-tertiary mb-1">
                  You owe
                </div>
                <div className="text-[15px] font-bold num t-red">
                  {formatINR(takenTotal)}
                </div>
              </div>
            </div>
          </div>

          {given.length > 0 && (
            <Section title="Given" icon={<IconArrowUpRight size={15} />}>
              {given.map((l) => (
                <LoanRowLink key={l.id} loan={l} name={partyName(l)} balance={balanceOf(l)} />
              ))}
            </Section>
          )}

          {taken.length > 0 && (
            <Section title="Taken" icon={<IconArrowDownLeft size={15} />}>
              {taken.map((l) => (
                <LoanRowLink key={l.id} loan={l} name={partyName(l)} balance={balanceOf(l)} />
              ))}
            </Section>
          )}
        </>
      )}

      {me?.role === "admin" && <AddLoanButton />}

      {me && (
        <div className="text-center text-[11px] font-semibold t-tertiary pt-8 pb-2">
          {me.name} · balances derived from transactions
        </div>
      )}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen pb-28">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <Link href="/app/dashboard" className="icon-btn" aria-label="Back">
          <span aria-hidden="true" className="text-[16px] leading-none">‹</span>
        </Link>
        <h1 className="text-[17px] font-bold">Loans</h1>
      </div>
      <div className="card mx-5 p-6 text-center">
        <p className="text-[13.5px] font-bold mb-1">Couldn&apos;t load your loans</p>
        <p className="text-[12.5px] font-semibold t-secondary leading-relaxed mb-4">{message}</p>
        <Link href="/app/loans" className="btn btn-secondary w-full">
          Try again
        </Link>
      </div>
    </div>
  );
}