import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { cardOutstanding } from "@/lib/balances";
import type { Card, Category, Transaction, UserRow } from "@/lib/types";
import CardDetailView from "@/components/card-detail-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("credit_cards")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  return {
    title: data && "name" in data ? `${data.name} — Family Purse` : "Card — Family Purse",
  };
}

export default async function CardDetailPage({
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

  const [cardRes, meRes, txnsRes, catsRes, membersRes] = await Promise.all([
    supabase.from("credit_cards").select("*").eq("id", id).maybeSingle(),
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("transactions").select("*"),
    supabase.from("categories").select("*"),
    supabase.from("users").select("*"),
  ]);

  if (cardRes.error) {
    return (
      <div className="min-h-screen pb-24">
        <div className="flex items-center gap-3 px-5 pt-6 pb-4">
          <Link href="/app/cards" className="icon-btn" aria-label="Back">
            <span aria-hidden="true" className="text-[16px] leading-none">‹</span>
          </Link>
          <h1 className="text-[17px] font-bold">Card</h1>
        </div>
        <div className="card mx-5 p-6 text-center">
          <p className="text-[13.5px] font-bold mb-1">Couldn&apos;t load this card</p>
          <p className="text-[12.5px] font-semibold t-secondary mb-4">{cardRes.error.message}</p>
          <Link href="/app/cards" className="btn btn-secondary w-full">
            Back to cards
          </Link>
        </div>
      </div>
    );
  }

  const card = cardRes.data as Card | null;
  if (!card) notFound(); // RLS hides unauthorised/foreign cards -> 404

  const me = meRes.data as UserRow | null;
  const txns = (txnsRes.data ?? []) as Transaction[];
  const cats = (catsRes.data ?? []) as Category[];
  const members = (membersRes.data ?? []) as UserRow[];

  const outstanding = cardOutstanding([card], txns).get(card.id) ?? 0;
  const isAdmin = me?.role === "admin";
  const isOwner = card.user_id === user.id;

  const catOf = (cid: string | null) => cats.find((c) => c.id === cid);
  const ownerName = members.find((m) => m.id === card.user_id)?.name ?? "Family member";

  const cardTxns = txns
    .filter((t) => t.card_id === card.id)
    .sort((a, b) => (a.date === b.date ? b.created_at.localeCompare(a.created_at) : b.date.localeCompare(a.date)));

  const rows = cardTxns.map((t) => {
    const payment = t.kind === "settlement" && t.type === "card_payment";
    const cat = catOf(t.category_id);
    const writtenOff =
      !payment &&
      t.kind === "pl" &&
      t.type === "expense" &&
      t.spent_through === "manual" &&
      cat?.name === "Balance Write-off";
    return {
      id: t.id,
      amount: t.amount,
      date: t.date,
      note: writtenOff ? `Write off — ${t.note}` : t.note,
      categoryName: payment ? "Card payment" : cat?.name ?? "Uncategorised",
      categoryColor: payment ? null : (cat?.color ?? null),
      type: t.type,
      creatorName: "Family member",
      reduceBalance: payment || writtenOff,
    };
  });

  return (
    <CardDetailView
      card={card}
      ownerName={ownerName}
      outstanding={outstanding}
      isOwner={isOwner}
      isAdmin={isAdmin}
      rows={rows}
    />
  );
}