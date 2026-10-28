import Link from "next/link";
import { redirect } from "next/navigation";
import { IconBuildingBank, IconCash, IconWallet } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/format";
import { accountBalances, round2 } from "@/lib/balances";
import type { Account, Transaction, UserRow } from "@/lib/types";
import { AddAccountButton } from "@/components/add-account-sheet";

function typeIcon(type: string) {
  if (type === "cash") return <IconCash size={17} />;
  if (type === "wallet") return <IconWallet size={17} />;
  return <IconBuildingBank size={17} />;
}

function typeLabel(type: string) {
  if (type === "cash") return "Cash in hand";
  if (type === "savings") return "Savings";
  if (type === "wallet") return "Digital wallet";
  return "Bank account";
}

export default async function AccountsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [meRes, accountsRes, txnsRes, membersRes] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("accounts").select("*").order("created_at"),
    supabase.from("transactions").select("*"),
    supabase.from("users").select("*").order("name"),
  ]);

  const me = meRes.data as UserRow | null;
  const accounts = (accountsRes.data ?? []) as Account[];
  const txns = (txnsRes.data ?? []) as Transaction[];
  const members = (membersRes.data ?? []) as UserRow[];
  const memberName = (id: string | null) =>
    members.find((m) => m.id === id)?.name ?? "Family account";

  const balances = accountBalances(accounts, txns);
  const totalBalance = round2(
    [...balances.values()].reduce((s, v) => s + v, 0),
  );

  return (
    <div className="min-h-screen pb-24">
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <Link href="/app/dashboard" className="icon-btn" aria-label="Back">
            <span aria-hidden="true" className="text-[16px] leading-none">‹</span>
          </Link>
          <h1 className="text-[17px] font-bold">Accounts</h1>
        </div>
        <AddAccountButton />
      </div>

      {accounts.length === 0 ? (
        <div className="card mx-5 p-6 text-center">
          <IconBuildingBank size={22} className="mx-auto mb-3 t-tertiary" />
          <p className="text-[13.5px] font-bold mb-1">No accounts added yet</p>
          <p className="text-[12.5px] font-semibold t-secondary leading-relaxed">
            Add your bank accounts, savings, and cash in hand to track the family&apos;s liquid balances in one place.
          </p>
        </div>
      ) : (
        <>
          <div className="card mx-5 p-5">
            <div className="text-[11.5px] font-bold uppercase tracking-wide t-secondary">
              Total liquid balance
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-[30px] font-bold num ${totalBalance >= 0 ? "t-green" : "t-red"}`}>
                {formatINR(totalBalance)}
              </span>
            </div>
            {accounts.length > 1 && (
              <div className="text-[11.5px] font-semibold t-tertiary mt-1">
                across {accounts.length} accounts
              </div>
            )}
          </div>

          <div className="section-label">Accounts · {accounts.length}</div>

          <div className="px-5 flex flex-col gap-2.5">
            {accounts.map((a) => {
              const bal = balances.get(a.id) ?? a.opening_balance;
              return (
                <div key={a.id} className="card p-4 block">
                  <div className="flex items-center gap-3">
                    <div className="txn-icon">
                      {typeIcon(a.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14.5px] font-bold truncate">{a.name}</span>
                        {a.status === "closed" && <span className="badge neutral">Closed</span>}
                      </div>
                      <div className="text-[12px] font-semibold t-tertiary mt-0.5">
                        {typeLabel(a.type)} · {memberName(a.user_id)}
                      </div>
                    </div>
                    <span
                      className={`text-[14px] font-bold num ${
                        bal >= 0 ? "t-green" : "t-red"
                      }`}
                    >
                      {formatINR(bal)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {me && (
        <div className="text-center text-[11px] font-semibold t-tertiary pt-8 pb-2">
          {me.name} · liquid family balances
        </div>
      )}
    </div>
  );
}
