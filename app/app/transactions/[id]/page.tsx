import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatINRExact, initials } from "@/lib/format";
import type { Category, Loan, Transaction, UserRow } from "@/lib/types";
import TransactionDetailView from "@/components/transaction-detail-view";

export default async function TransactionDetailPage({
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

  const [txnRes, catsRes, meRes] = await Promise.all([
    supabase.from("transactions").select("*").eq("id", id).maybeSingle(),
    supabase.from("categories").select("*"),
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
  ]);

  if (txnRes.error) throw new Error("Could not load this transaction.");

  const txn = txnRes.data as Transaction | null;
  if (!txn) notFound();

  const cats = (catsRes.data ?? []) as Category[];
  const me = meRes.data as UserRow | null;

  const category = txn.category_id ? cats.find((c) => c.id === txn.category_id) : null;

  let cardName: string | null = null;
  if (txn.card_id) {
    const { data } = await supabase
      .from("credit_cards")
      .select("name")
      .eq("id", txn.card_id)
      .maybeSingle();
    cardName = (data as { name: string } | null)?.name ?? null;
  }

  let loanName: string | null = null;
  if (txn.linked_loan_id) {
    const { data } = await supabase
      .from("loans")
      .select("direction, counterparty_user_id, counterparty_name")
      .eq("id", txn.linked_loan_id)
      .maybeSingle();
    const loan = data as Pick<Loan, "direction" | "counterparty_user_id" | "counterparty_name"> | null;
    if (loan) {
      let party = "External";
      if (loan.counterparty_user_id) {
        const { data: partyUser } = await supabase
          .from("users")
          .select("name")
          .eq("id", loan.counterparty_user_id)
          .maybeSingle();
        party = (partyUser as { name: string } | null)?.name ?? "Family member";
      } else if (loan.counterparty_name) {
        party = loan.counterparty_name;
      }
      loanName = `${party}${loan.direction === "taken" ? " (we owe)" : ""}`;
    }
  }

  let counterpartyName: string | null = null;
  if (txn.counterparty_user_id) {
    const { data } = await supabase
      .from("users")
      .select("name")
      .eq("id", txn.counterparty_user_id)
      .maybeSingle();
    counterpartyName = (data as { name: string } | null)?.name ?? null;
  }

  let creatorName = "Family member";
  if (txn.created_by) {
    const { data } = await supabase
      .from("users")
      .select("name")
      .eq("id", txn.created_by)
      .maybeSingle();
    creatorName = (data as { name: string } | null)?.name ?? creatorName;
  }

  const isYou = user.id === txn.created_by;
  const isAdmin = me?.role === "admin";
  const cancellable =
    txn.kind === "pl"
      ? (txn.scope_type === "personal" && txn.scope_id === user.id) || isAdmin
      : isAdmin;

  return (
    <TransactionDetailView
      txn={
        {
          ...txn,
          amount_formatted: formatINRExact(txn.amount),
        } as Transaction & { amount_formatted: string }
      }
      category={category ?? null}
      cardName={cardName}
      loanName={loanName}
      counterpartyName={counterpartyName}
      creatorName={creatorName}
      isYou={isYou}
      isAdmin={isAdmin}
      cancellable={cancellable}
      initialAvatar={initials(creatorName)}
    />
  );
}