import Link from "next/link";
import { redirect } from "next/navigation";
import { IconCreditCard } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/format";
import { cardOutstanding, round2 } from "@/lib/balances";
import type { Card, Transaction, UserRow } from "@/lib/types";
import { AddCardButton } from "@/components/add-card-sheet";

function monthPrefix(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function CardsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [meRes, cardsRes, txnsRes, membersRes] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("credit_cards").select("*").order("created_at"),
    supabase.from("transactions").select("*"),
    supabase.from("users").select("*").order("name"),
  ]);

  const me = meRes.data as UserRow | null;
  if (meRes.error) {
    return <ErrorState message={meRes.error.message} />;
  }
  if (cardsRes.error) {
    return <ErrorState message={cardsRes.error.message} />;
  }
  if (txnsRes.error || membersRes.error) {
    return <ErrorState message="Could not load cards." />;
  }

  const cards = (cardsRes.data ?? []) as Card[];
  const txns = (txnsRes.data ?? []) as Transaction[];
  const members = (membersRes.data ?? []) as UserRow[];
  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "Family member";

  const outstanding = cardOutstanding(cards, txns);
  const total = round2([...outstanding.values()].reduce((s, v) => s + v, 0));

  const month = monthPrefix();
  const cardSpends = (cardId: string) =>
    txns.filter(
      (t) =>
        t.card_id === cardId &&
        t.kind === "pl" &&
        (t.type === "expense" || t.type === "interest_expense") &&
        t.date.startsWith(month),
    ).length;

  return (
    <div className="min-h-screen pb-24">
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <Link href="/app/dashboard" className="icon-btn" aria-label="Back">
            <span aria-hidden="true" className="text-[16px] leading-none">‹</span>
          </Link>
          <h1 className="text-[17px] font-bold">Cards</h1>
        </div>
        <AddCardButton />
      </div>

      {cards.length === 0 ? (
        <div className="card mx-5 p-6 text-center">
          <IconCreditCard size={22} className="mx-auto mb-3 t-tertiary" />
          <p className="text-[13.5px] font-bold mb-1">No cards yet</p>
          <p className="text-[12.5px] font-semibold t-secondary leading-relaxed">
            Add a credit card to tag spends to it. Each card&apos;s outstanding is
            worked out automatically from your transactions.
          </p>
        </div>
      ) : (
        <>
          <div className="card mx-5 p-5">
            <div className="text-[11.5px] font-bold uppercase tracking-wide t-secondary">
              Total outstanding
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-[30px] font-bold num t-red">{formatINR(total)}</span>
            </div>
            {cards.length > 1 && (
              <div className="text-[11.5px] font-semibold t-tertiary mt-1">
                across {cards.length} cards
              </div>
            )}
          </div>

          <div className="section-label">Cards · {cards.length}</div>

          <div className="px-5 flex flex-col gap-2.5">
            {cards.map((c) => {
              const balance = outstanding.get(c.id) ?? 0;
              const spends = cardSpends(c.id);
              return (
                <Link key={c.id} href={`/app/cards/${c.id}`} className="card p-4 block">
                  <div className="flex items-center gap-3">
                    <div className="txn-icon">
                      <IconCreditCard size={17} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14.5px] font-bold truncate">{c.name}</span>
                        {c.status === "closed" && <span className="badge neutral">Closed</span>}
                      </div>
                      <div className="text-[12px] font-semibold t-tertiary mt-0.5">
                        {spends === 1
                          ? "1 spend this month"
                          : `${spends} spends this month`}
                        {c.status === "closed" ? "" : ` · ${memberName(c.user_id)}`}
                      </div>
                    </div>
                    <span
                      className={`text-[14px] font-bold num ${
                        balance < 0 ? "t-green" : balance > 0 ? "t-red" : "t-primary"
                      }`}
                    >
                      {balance < 0 ? `${formatINR(balance)} credited` : formatINR(balance)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {me && (
        <div className="text-center text-[11px] font-semibold t-tertiary pt-8 pb-2">
          {memberName(user.id)} · outstanding derived from transactions
        </div>
      )}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen pb-24">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <Link href="/app/dashboard" className="icon-btn" aria-label="Back">
          <span aria-hidden="true" className="text-[16px] leading-none">‹</span>
        </Link>
        <h1 className="text-[17px] font-bold">Cards</h1>
      </div>
      <div className="card mx-5 p-6 text-center">
        <p className="text-[13.5px] font-bold mb-1">Couldn&apos;t load your cards</p>
        <p className="text-[12.5px] font-semibold t-secondary leading-relaxed mb-4">{message}</p>
        <Link href="/app/cards" className="btn btn-secondary w-full">
          Try again
        </Link>
      </div>
    </div>
  );
}