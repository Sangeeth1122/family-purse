"use client";

import { useCallback, useEffect, useState } from "react";
import { useEsc } from "@/components/use-esc";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowNarrowRight,
  IconCheck,
  IconLock,
  IconTransfer,
  IconWallet,
  IconX,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { formatINRExact, initials, parseINR, toINRInput } from "@/lib/format";
import { cardOutstanding, loanBalanceOf, round2 } from "@/lib/balances";
import type { Category, Loan, Transaction, UserRow } from "@/lib/types";

type Tab = "expense" | "revenue" | "transfer";
type SubTab = "person" | "card" | "loan";
type NudgeOption = 1 | 2 | 3;

type PlWrite = {
  kind: "pl";
  type: "expense" | "revenue" | "interest_income" | "interest_expense";
  scope_type: "personal" | "project";
  scope_id: string;
  amount: number;
  category_id: string | null;
  spent_through: "credit_card" | "manual" | null;
  card_id: string | null;
  linked_loan_id: string | null;
  date: string;
  note: string | null;
};

type SettlementWrite = {
  kind: "settlement";
  type: "card_payment" | "loan_repayment" | "transfer";
  scope_type: "personal";
  amount: number;
  card_id?: string | null;
  linked_loan_id?: string | null;
  counterparty_user_id?: string | null;
  date: string;
  note: string | null;
};

type Write = PlWrite | SettlementWrite;

export type PaymentPrefill = {
  /** Card the payment is being made to — shown locked in a Transfer → To Card sheet. */
  cardId?: string;
  /** Card display name (resolved by the caller when the card is not reachable here). */
  cardName?: string | null;
  /** Live outstanding for the card, so the locked balance chip is exact. */
  outstanding?: number | null;
  /** Loan the repayment / interest is being recorded for — locked To Loan sheet. */
  loanId?: string;
  /** Loan display name (counterparty, not reachable here when the loan is inactive). */
  loanName?: string | null;
  /** Live balance for the loan, so the locked balance chip is exact. */
  loanBalance?: number | null;
  /** Direction of the loan, for the overpay interest label. */
  loanDirection?: "given" | "taken" | null;
  /** Project the P&L is logged against — locked Expense/Revenue sheet. */
  projectId?: string;
  /** Project display name (resolved by the caller). */
  projectName?: string | null;
};

export default function AddTransactionSheet({
  initial,
  onClose,
  prefill,
}: {
  initial?: Transaction | null;
  onClose: () => void;
  prefill?: PaymentPrefill;
}) {
  const router = useRouter();
  const editing = !!initial;
  const isSettlementEdit = editing && initial!.kind === "settlement";
  const isInterestEdit =
    editing &&
    (initial!.type === "interest_income" || initial!.type === "interest_expense");

  const [tab, setTab] = useState<Tab>(() =>
    prefill?.projectId
      ? "expense"
      : prefill
        ? "transfer"
        : editing
          ? initial!.type === "revenue"
            ? "revenue"
            : "expense"
          : "expense",
  );
  const [subTab, setSubTab] = useState<SubTab>(() =>
    prefill?.loanId ? "loan" : prefill?.cardId ? "card" : "person",
  );

  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState<string | null>(initial?.category_id ?? null);
  const [spentVia, setSpentVia] = useState<"manual" | "credit_card">(
    initial?.spent_through === "credit_card" ? "credit_card" : "manual",
  );
  const [cardId, setCardId] = useState<string | null>(
    prefill?.cardId ?? initial?.card_id ?? null,
  );
  const [personId, setPersonId] = useState<string | null>(
    initial?.counterparty_user_id ?? null,
  );
  const [loanId, setLoanId] = useState<string | null>(initial?.linked_loan_id ?? null);
  const [openPicker, setOpenPicker] = useState<SubTab | null>(null);
  const [nudge, setNudge] = useState<NudgeOption | null>(null);
  const [writeoffNote, setWriteoffNote] = useState("");

  const [me, setMe] = useState<UserRow | null>(null);
  const [members, setMembers] = useState<UserRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<{ id: string; user_id: string; name: string }[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!alive || !user.user) return;

      const [meRes, membersRes, catsRes, cardsRes, loansRes, txnsRes, projectsRes] = await Promise.all([
        supabase.from("users").select("*").eq("id", user.user.id).maybeSingle(),
        supabase.from("users").select("*").neq("id", user.user.id).order("name"),
        supabase.from("categories").select("*").order("sort_order"),
        supabase.from("credit_cards").select("id, user_id, name").eq("status", "active"),
        supabase
          .from("loans")
          .select("*")
          .eq("status", "active")
          .order("start_date"),
        supabase.from("transactions").select("*"),
        supabase.from("projects").select("id, name"),
      ]);

      if (!alive) return;
      if (meRes.data) setMe(meRes.data as UserRow);
      if (membersRes.data) setMembers(membersRes.data as UserRow[]);
      if (catsRes.data) setCategories(catsRes.data as Category[]);
      if (cardsRes.data) setCards(cardsRes.data as { id: string; user_id: string; name: string }[]);
      if (loansRes.data) setLoans(loansRes.data as Loan[]);
      if (txnsRes.data) setTxns(txnsRes.data as Transaction[]);
      if (projectsRes.data) setProjects(projectsRes.data as { id: string; name: string }[]);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Interest / write-off system categories resolved by name.
  const interestPaidId = categories.find((c) => c.system && c.name === "Interest Paid")?.id ?? null;
  const interestReceivedId =
    categories.find((c) => c.system && c.name === "Interest Received")?.id ?? null;
  const balanceWriteoffId =
    categories.find((c) => c.system && c.name === "Balance Write-off")?.id ?? null;

  const isAdmin = me?.role === "admin";
  const projectMode = !!prefill?.projectId;
  const editingProject = editing && initial!.scope_type === "project";
  const lockedToProject = projectMode || editingProject;
  const outstandingByCard = cardOutstanding(cards, txns);
  if (prefill?.cardId && prefill.outstanding != null) {
    outstandingByCard.set(prefill.cardId, prefill.outstanding);
  }
  const cardNameOf = (id: string | null) => cards.find((c) => c.id === id)?.name ?? null;
  const loanNameOf = (id: string | null) => {
    const l = loans.find((x) => x.id === id);
    if (!l) return null;
    const member = members.find((m) => m.id === l.counterparty_user_id);
    const name = l.counterparty_user_id
      ? member?.name ?? "Family member"
      : l.counterparty_name ?? "External";
    return `${name} — ${l.direction === "taken" ? "we owe" : "owed to us"}`;
  };
  const memberNameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? null;
  const projectNameOf = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? prefill?.projectName ?? null;

  const amountNum = parseINR(amount);
  const settlementAmount = amountNum > 0 ? amountNum : 0;

  // Balance chips.
  function cardBalanceChip(id: string): string {
    const outstanding = outstandingByCard.get(id) ?? 0;
    return outstanding > 0
      ? `Outstanding ${formatINRExact(outstanding)}`
      : `Credit ${formatINRExact(Math.abs(outstanding))}`;
  }
  function loanBalanceChip(loan: Loan): string {
    const balance =
      prefill?.loanId === loan.id && prefill.loanBalance != null
        ? prefill.loanBalance
        : loanBalanceOf(loan, txns).balance;
    return balance > 0
      ? `Balance ${formatINRExact(balance)}`
      : `Settled (₹0)`;
  }
  function personBalanceChip(id: string): string {
    let net = 0;
    for (const t of txns) {
      if (t.kind === "settlement" && t.type === "transfer" && t.counterparty_user_id === id) {
        net += t.scope_id === me?.id ? t.amount : -t.amount;
      }
    }
    net = round2(net);
    if (net > 0) return `They owe you ${formatINRExact(net)}`;
    if (net < 0) return `You owe them ${formatINRExact(Math.abs(net))}`;
    return "Balances cleared";
  }

  // Overpay guard-rail triggers.
  const selectedCard = cardId ? cards.find((c) => c.id === cardId) : null;
  const cardOutstandingNow = cardId ? outstandingByCard.get(cardId) ?? 0 : 0;
  const overpayingCard =
    !!selectedCard && settlementAmount > 0 && cardOutstandingNow >= 0 && settlementAmount > cardOutstandingNow;
  const selectedLoan = loanId ? loans.find((l) => l.id === loanId) : null;
  const directionOfSelected =
    prefill?.loanId === loanId && prefill.loanDirection
      ? prefill.loanDirection
      : selectedLoan?.direction ?? "given";
  const loanBalanceNow =
    prefill?.loanId === loanId && prefill.loanBalance != null
      ? prefill.loanBalance
      : selectedLoan
        ? loanBalanceOf(selectedLoan, txns).balance
        : 0;
  const overpayingLoan =
    !!loanId && settlementAmount > 0 && loanBalanceNow >= 0 && settlementAmount > loanBalanceNow;

  const resetNudge = useCallback(() => setNudge(null), []);

  async function savePayload(payload: Write | Write[]) {
    const supabase = createClient();
    const { error: err } = await supabase.rpc("fp_create_transaction", {
      p_payload: payload,
    });
    return err;
  }

  function validateCreate(): string | null {
    if (settlementAmount <= 0) return "Enter a valid amount.";
    if (tab === "transfer") {
      if (subTab === "person" && !personId) return "Pick a family member.";
      if (subTab === "card" && !cardId) return "Pick a card.";
      if (subTab === "loan" && !loanId) return "Pick a loan.";
      return null;
    }
    if ((tab === "expense" || isInterestEdit) && !categoryId) return "Pick a category.";
    if (tab === "expense" && spentVia === "credit_card" && !cardId) {
      return "Pick a card.";
    }
    return null;
  }

  function buildCreatePayload(): Write | Write[] {
    // ---- Transfer: To Card -------------------------------------------------
    if (tab === "transfer" && subTab === "card" && cardId) {
      const diff = round2(settlementAmount - cardOutstandingNow);
      const cardPayment: SettlementWrite = {
        kind: "settlement",
        type: "card_payment",
        scope_type: "personal",
        amount: settlementAmount,
        card_id: cardId,
        date,
        note: note.trim() || null,
      };
      if (!overpayingCard) return cardPayment;
      if (nudge === 1) {
        // Log the difference as card interest; payment clears outstanding.
        const interest: PlWrite = {
          kind: "pl",
          type: "interest_expense",
          scope_type: "personal",
          scope_id: me!.id,
          amount: diff,
          category_id: interestPaidId,
          spent_through: "credit_card",
          card_id: cardId,
          linked_loan_id: null,
          date,
          note: note.trim() || null,
        };
        return [{ ...cardPayment, amount: cardOutstandingNow }, interest];
      }
      if (nudge === 3) {
        // Write the difference off to zero (requires a note).
        const writeoff: PlWrite = {
          kind: "pl",
          type: "expense",
          scope_type: "personal",
          scope_id: me!.id,
          amount: diff,
          category_id: balanceWriteoffId,
          spent_through: "manual",
          card_id: null,
          linked_loan_id: null,
          date,
          note: writeoffNote.trim() || null,
        };
        return [{ ...cardPayment, amount: cardOutstandingNow }, writeoff];
      }
      if (nudge === 2) return cardPayment; // save as-is — charge the credit balance
      return []; // overpaying but no option chosen yet
    }

    // ---- Transfer: To Loan -------------------------------------------------
    if (tab === "transfer" && subTab === "loan" && loanId) {
      const diff = round2(settlementAmount - loanBalanceNow);
      const repayment: SettlementWrite = {
        kind: "settlement",
        type: "loan_repayment",
        scope_type: "personal",
        amount: settlementAmount,
        linked_loan_id: loanId,
        date,
        note: note.trim() || null,
      };
      if (!overpayingLoan) return repayment;
      const giving = directionOfSelected === "given";
      const interestType = giving ? "interest_income" : "interest_expense";
      const interestCat = giving ? interestReceivedId : interestPaidId;
      if (nudge === 1) {
        const interest: PlWrite = {
          kind: "pl",
          type: interestType,
          scope_type: "personal",
          scope_id: me!.id,
          amount: diff,
          category_id: interestCat,
          spent_through: null,
          card_id: null,
          linked_loan_id: loanId,
          date,
          note: note.trim() || null,
        };
        return [{ ...repayment, amount: loanBalanceNow }, interest];
      }
      if (nudge === 3) {
        const writeoff: PlWrite = {
          kind: "pl",
          type: "expense",
          scope_type: "personal",
          scope_id: me!.id,
          amount: diff,
          category_id: balanceWriteoffId,
          spent_through: "manual",
          card_id: null,
          linked_loan_id: null,
          date,
          note: writeoffNote.trim() || null,
        };
        return [{ ...repayment, amount: loanBalanceNow }, writeoff];
      }
      if (nudge === 2) return repayment;
      return []; // overpaying but no option chosen yet
    }

    // ---- Person transfer -------------------------------- (engine pairs it)
    if (tab === "transfer" && subTab === "person") {
      return {
        kind: "settlement",
        type: "transfer",
        scope_type: "personal",
        amount: settlementAmount,
        counterparty_user_id: personId,
        date,
        note: note.trim() || null,
      } as SettlementWrite;
    }

    // ---- P&L --------------------------------------------------------------
    const expenseish = tab === "expense" || isInterestEdit;
    const plType: PlWrite["type"] = isInterestEdit
      ? initial!.type === "interest_income"
        ? "interest_income"
        : "interest_expense"
      : tab === "revenue"
        ? "revenue"
        : "expense";
    return {
      kind: "pl",
      type: plType,
      scope_type: projectMode ? "project" : "personal",
      scope_id: projectMode ? prefill!.projectId! : me!.id,
      amount: settlementAmount,
      category_id: isInterestEdit ? (initial!.type === "interest_income" ? interestReceivedId : interestPaidId) : categoryId,
      spent_through: expenseish ? spentVia : null,
      card_id: expenseish && spentVia === "credit_card" ? cardId : null,
      linked_loan_id: isInterestEdit ? loanId : null,
      date,
      note: note.trim() || null,
    } as PlWrite;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (editing && isSettlementEdit) {
      if (settlementAmount <= 0) {
        setError("Enter a valid amount.");
        return;
      }
      setBusy(true);
      const supabase = createClient();
      const { error: err } = await supabase.rpc("fp_update_transaction", {
        p_id: initial!.id,
        p_payload: { amount: settlementAmount, date, note: note.trim() || null },
      });
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
      setSaved(true);
      setTimeout(() => {
        router.refresh();
        onClose();
      }, 650);
      return;
    }

    if (editing) {
      setBusy(true);
      const supabase = createClient();
      const { error: err } = await supabase.rpc("fp_update_transaction", {
        p_id: initial!.id,
        p_payload: {
          amount: settlementAmount,
          date,
          note: note.trim() || null,
          category_id: isInterestEdit
            ? initial!.type === "interest_income"
              ? interestReceivedId
              : interestPaidId
            : categoryId,
          spent_through: initial!.type === "revenue" || isInterestEdit ? undefined : spentVia,
          card_id:
            initial!.type === "revenue"
              ? undefined
              : spentVia === "credit_card"
                ? cardId
                : null,
          linked_loan_id: isInterestEdit ? loanId : null,
        },
      });
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
      setSaved(true);
      setTimeout(() => {
        router.refresh();
        onClose();
      }, 650);
      return;
    }

    const invalid = validateCreate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    const templates = buildCreatePayload();
    if (Array.isArray(templates) && templates.length === 0) {
      setBusy(false);
      return; // awaiting a nudge choice — user must pick an option
    }
    const err = await savePayload(templates);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSaved(true);
    setTimeout(() => {
      router.refresh();
      onClose();
    }, 650);
  }

  const onAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(toINRInput(e.target.value));
  }, []);

  const awaitingNudge =
    !editing &&
    tab === "transfer" &&
    ((subTab === "card" && overpayingCard && !nudge) ||
      (subTab === "loan" && overpayingLoan && !nudge));

  useEsc(true, onClose);

  return (
    <div
      className="sheet-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-txn-title"
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="handle" />
        <div className="sheet-head">
          <h2 id="add-txn-title">
            {saved
              ? "Saved"
              : editing
                ? "Edit transaction"
                : "Add transaction"}
          </h2>
          <button type="button" className="close-btn" aria-label="Close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>

        {saved ? (
          <div className="card p-8 text-center">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ background: "rgba(74,122,94,0.14)", color: "var(--green)" }}
            >
              <IconCheck size={22} />
            </div>
            <p className="text-[14px] font-bold t-secondary">Transaction saved to the family records.</p>
          </div>
        ) : (
          <>
            {!isSettlementEdit && !lockedToProject && !projectMode && (
              <div className="segmented mb-5">
                <button
                  type="button"
                  className={`seg ${tab === "expense" ? "active expense" : ""}`}
                  onClick={() => setTab("expense")}
                >
                  <IconWallet size={14} />
                  Expense
                </button>
                <button
                  type="button"
                  className={`seg ${tab === "revenue" ? "active revenue" : ""}`}
                  onClick={() => setTab("revenue")}
                >
                  <IconArrowNarrowRight size={14} />
                  Revenue
                </button>
                <button
                  type="button"
                  className={`seg ${tab === "transfer" ? "active" : ""}`}
                  onClick={() => setTab("transfer")}
                >
                  <IconTransfer size={14} />
                  Transfer
                </button>
              </div>
            )}

            {projectMode && (
              <div className="segmented mb-5">
                <button
                  type="button"
                  className={`seg ${tab === "expense" ? "active expense" : ""}`}
                  onClick={() => setTab("expense")}
                >
                  <IconWallet size={14} />
                  Expense
                </button>
                <button
                  type="button"
                  className={`seg ${tab === "revenue" ? "active revenue" : ""}`}
                  onClick={() => setTab("revenue")}
                >
                  <IconArrowNarrowRight size={14} />
                  Revenue
                </button>
              </div>
            )}

            {lockedToProject && (
              <div className="locked-chip mb-5">
                <IconLock size={15} className="t-secondary" />
                <span className="flex-1">
                  Project · {prefill?.projectName ?? projectNameOf(initial?.scope_id ?? null)}
                </span>
                <span className="text-[11px] font-semibold t-tertiary">
                  {editingProject ? "locked" : "locked"}
                </span>
              </div>
            )}

            {isSettlementEdit && initial && (
              <div className="locked-chip mb-5">
                <IconLock size={15} className="t-secondary" />
                <span className="flex-1">
                  {TYPE_FULL[initial.type]} ·{" "}
                  {initial.type === "card_payment"
                    ? cardNameOf(initial.card_id)
                    : initial.type === "loan_repayment"
                      ? loanNameOf(initial.linked_loan_id)
                      : initial.counterparty_user_id
                        ? memberNameOf(initial.counterparty_user_id)
                        : "Loan principal"}
                </span>
                <span className="text-[11px] font-semibold t-tertiary">
                  {isAdmin ? "admin edit" : "read only"}
                </span>
              </div>
            )}

            {isSettlementEdit && !isAdmin && (
              <div className="nudge mb-5">
                <div className="nudge-head">
                  <IconAlertTriangle size={15} />
                  <p>Only a family admin can edit settlements.</p>
                </div>
              </div>
            )}

            <form onSubmit={onSubmit}>
              {/* ---------- Amount ---------- */}
              <div className="amt-field">
                <span className="curr">₹</span>
                <input
                  className={`amt-input ${tab === "revenue" ? "revenue" : "expense"}`}
                  aria-label="Amount in rupees"
                  inputMode="decimal"
                  value={amount}
                  onChange={onAmountChange}
                  placeholder="0"
                  autoFocus
                  disabled={isSettlementEdit && !isAdmin}
                />
              </div>

              {tab === "transfer" && !editing && !prefill && (
                <>
                  <div className="sub-chips">
                    <button
                      type="button"
                      className={`sub-chip ${subTab === "person" ? "active" : ""}`}
                      onClick={() => {
                        setSubTab("person");
                        resetNudge();
                      }}
                    >
                      To Person
                    </button>
                    <button
                      type="button"
                      className={`sub-chip ${subTab === "card" ? "active" : ""}`}
                      onClick={() => {
                        setSubTab("card");
                        resetNudge();
                      }}
                    >
                      To Card
                    </button>
                    <button
                      type="button"
                      className={`sub-chip ${subTab === "loan" ? "active" : ""}`}
                      onClick={() => {
                        setSubTab("loan");
                        resetNudge();
                      }}
                    >
                      To Loan
                    </button>
                  </div>

                  {!isAdmin && (
                    <p className="text-[12px] font-semibold t-secondary mb-3">
                      Settlements are managed by the family admin.
                    </p>
                  )}
                </>
              )}

              {tab === "transfer" && !editing && subTab === "person" && (
                <Picker
                  label="Family member"
                  placeholder="Choose a family member"
                  open={openPicker === "person"}
                  onToggle={() =>
                    setOpenPicker(openPicker === "person" ? null : "person")
                  }
                  tiles={members.map((m) => ({
                    id: m.id,
                    label: m.name,
                    sub: m.role === "admin" ? "admin" : undefined,
                    avatar: initials(m.name),
                  }))}
                  selectedId={personId}
                  onPick={(id) => {
                    setPersonId(id);
                    setOpenPicker(null);
                  }}
                  balanceChip={personId ? personBalanceChip(personId) : null}
                />
              )}

              {tab === "transfer" && !editing && subTab === "card" && (
                prefill ? (
                  <>
                    <div className="locked-chip mb-1">
                      <IconLock size={15} className="t-secondary" />
                      <span className="flex-1">
                        Card payment · {prefill.cardName ?? cardNameOf(cardId)}
                      </span>
                      <span className="text-[11px] font-semibold t-tertiary">locked</span>
                    </div>
                    <p className="text-[12px] font-semibold t-secondary mb-3">
                      {cardBalanceChip(prefill.cardId!)}
                    </p>
                  </>
                ) : (
                  <Picker
                  label="Credit card"
                  placeholder="Choose a card"
                  open={openPicker === "card"}
                  onToggle={() => setOpenPicker(openPicker === "card" ? null : "card")}
                  tiles={cards.map((c) => ({
                    id: c.id,
                    label: c.name,
                    sub: cardBalanceChip(c.id),
                    avatar: "CC",
                  }))}
                  selectedId={cardId}
                  onPick={(id) => {
                    setCardId(id);
                    setOpenPicker(null);
                    resetNudge();
                  }}
                  balanceChip={cardId ? cardBalanceChip(cardId) : null}
                />
                )
              )}

              {tab === "transfer" && !editing && subTab === "loan" && prefill?.loanId && (
                <>
                  <div className="locked-chip mb-1">
                    <IconLock size={15} className="t-secondary" />
                    <span className="flex-1">
                      Loan repayment ·{" "}
                      {prefill.loanName ?? loanNameOf(loanId)}
                    </span>
                    <span className="text-[11px] font-semibold t-tertiary">locked</span>
                  </div>
                  <p className="text-[12px] font-semibold t-secondary mb-3">
                    {prefill.loanBalance != null
                      ? prefill.loanBalance > 0
                        ? `Balance ${formatINRExact(prefill.loanBalance)}`
                        : "Settled (₹0)"
                      : selectedLoan
                        ? loanBalanceChip(selectedLoan)
                        : ""}
                  </p>
                </>
              )}

              {tab === "transfer" && !editing && subTab === "loan" && !prefill?.loanId && (
                <Picker
                  label="Loan"
                  placeholder="Choose a loan"
                  open={openPicker === "loan"}
                  onToggle={() => setOpenPicker(openPicker === "loan" ? null : "loan")}
                  tiles={loans.map((l) => ({
                    id: l.id,
                    label:
                      (l.counterparty_user_id
                        ? memberNameOf(l.counterparty_user_id) ?? "Family member"
                        : l.counterparty_name) ?? "External",
                    sub: `${l.direction === "taken" ? "we owe · " : "owed to us · "}${loanBalanceChip(l)}`,
                    avatar: "₹",
                  }))}
                  selectedId={loanId}
                  onPick={(id) => {
                    setLoanId(id);
                    setOpenPicker(null);
                    resetNudge();
                  }}
                  balanceChip={loanId && selectedLoan ? loanBalanceChip(selectedLoan) : null}
                />
              )}

              {/* ---------- Expense / Revenue category etc. ---------- */}
              {(editing ? isInterestEdit || initial!.type === "expense" || initial!.type === "revenue" : true) &&
                tab !== "transfer" && (
                  <>
                    <div className="field">
                      <span className="field-label">
                        {tab === "revenue" ? "Category (optional)" : "Category"}
                      </span>
                      {isInterestEdit ? (
                        <div className="flex gap-2">
                          <span className="chip active" style={{ background: "#B0562F", borderColor: "#B0562F", color: "#fff" }}>
                            {initial!.type === "interest_income" ? "Interest Received" : "Interest Paid"}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {tab === "revenue" && (
                            <button
                              type="button"
                              className={`chip ${categoryId === null ? "active" : ""}`}
                              onClick={() => setCategoryId(null)}
                            >
                              Uncategorised
                            </button>
                          )}
                          {categories.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className={`chip ${categoryId === c.id ? "active" : ""}`}
                              style={
                                categoryId === c.id
                                  ? { background: c.color, borderColor: c.color, color: "#fff" }
                                  : undefined
                              }
                              onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {(isInterestEdit ||
                      (categoryId === interestPaidId && tab === "expense") ||
                      (categoryId === interestReceivedId && tab === "revenue")) && (
                      <SelectBox
                        label="Linked loan (optional)"
                        placeholder="No loan linked"
                        value={loanId ? loanNameOf(loanId) : null}
                        options={loans
                          .filter((l) =>
                            categoryId === interestReceivedId || initial?.type === "interest_income"
                              ? l.direction === "given" || l.counterparty_user_id !== null
                              : true,
                          )
                          .map((l) => ({
                            id: l.id,
                            label: `${(l.counterparty_user_id ? memberNameOf(l.counterparty_user_id) ?? "Family member" : l.counterparty_name) ?? "External"}`,
                          }))}
                        onPick={(id) => setLoanId(id)}
                      />
                    )}

                    {tab === "expense" && !editing && categoryId !== interestPaidId && (
                      <div className="field">
                        <span className="field-label">Paid via</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className={`chip ${spentVia === "manual" ? "active" : ""}`}
                            onClick={() => setSpentVia("manual")}
                          >
                            Manual
                          </button>
                          <button
                            type="button"
                            className={`chip ${spentVia === "credit_card" ? "active" : ""}`}
                            onClick={() => setSpentVia("credit_card")}
                          >
                            Credit card
                          </button>
                        </div>
                        {spentVia === "credit_card" && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {cards.length === 0 && (
                              <span className="text-[12px] font-semibold t-tertiary">
                                No active cards yet
                              </span>
                            )}
                            {cards.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                className={`chip ${cardId === c.id ? "active" : ""}`}
                                onClick={() => setCardId(cardId === c.id ? null : c.id)}
                              >
                                {c.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {editing &&
                      !isSettlementEdit &&
                      tab === "expense" &&
                      initial!.type === "expense" && (
                        <div className="field">
                          <span className="field-label">Paid via</span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className={`chip ${spentVia === "manual" ? "active" : ""}`}
                              onClick={() => setSpentVia("manual")}
                            >
                              Manual
                            </button>
                            <button
                              type="button"
                              className={`chip ${spentVia === "credit_card" ? "active" : ""}`}
                              onClick={() => setSpentVia("credit_card")}
                            >
                              Credit card
                            </button>
                          </div>
                          {spentVia === "credit_card" && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {cards.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  className={`chip ${cardId === c.id ? "active" : ""}`}
                                  onClick={() => setCardId(cardId === c.id ? null : c.id)}
                                >
                                  {c.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                  </>
                )}

              {/* ---------- Overpay guard rails ---------- */}
              {!editing &&
                tab === "transfer" &&
                subTab === "card" &&
                overpayingCard &&
                !nudge && (
                  <Nudge
                    title={
                      <>
                        This is <b>{formatINRExact(round2(settlementAmount - cardOutstandingNow))}</b> more
                        than the card&apos;s outstanding by <b>{formatINRExact(cardOutstandingNow)}</b>. How should the
                        difference be handled?
                      </>
                    }
                    options={[
                      {
                        id: 1,
                        label: `Log ${formatINRExact(round2(settlementAmount - cardOutstandingNow))} as Interest Paid`,
                        kind: "primary",
                      },
                      { id: 2, label: "Save as is — carry credit balance", kind: "secondary" },
                      { id: 3, label: "Write the difference off to zero", kind: "tertiary" },
                    ]}
                    onPick={setNudge}
                  />
                )}

              {!editing &&
                tab === "transfer" &&
                subTab === "card" &&
                overpayingCard &&
                nudge === 3 && (
                  <input
                    className="input mb-4"
                    aria-label="Write-off note"
                    placeholder="Note why this amount is being written off (required)"
                    value={writeoffNote}
                    onChange={(e) => setWriteoffNote(e.target.value)}
                    required
                  />
                )}

              {!editing &&
                tab === "transfer" &&
                subTab === "loan" &&
                overpayingLoan &&
                !nudge && (
                  <Nudge
                    title={
                      <>
                        The repayment is <b>{formatINRExact(round2(settlementAmount - loanBalanceNow))}</b> more
                        than the loan balance of <b>{formatINRExact(loanBalanceNow)}</b>. How should the
                        difference be handled?
                      </>
                    }
                    options={[
                      {
                        id: 1,
                        label: `Log ${formatINRExact(round2(settlementAmount - loanBalanceNow))} as ${directionOfSelected === "given" ? "Interest Received" : "Interest Paid"}`,
                        kind: "primary",
                      },
                      { id: 2, label: "Save as is — carry credit balance", kind: "secondary" },
                      { id: 3, label: "Write the difference off to zero", kind: "tertiary" },
                    ]}
                    onPick={setNudge}
                  />
                )}

              {!editing &&
                tab === "transfer" &&
                subTab === "loan" &&
                overpayingLoan &&
                nudge === 3 && (
                  <input
                    className="input mb-4"
                    aria-label="Write-off note"
                    placeholder="Note why this amount is being written off (required)"
                    value={writeoffNote}
                    onChange={(e) => setWriteoffNote(e.target.value)}
                    required
                  />
                )}

              {/* ---------- Date & note ---------- */}
              <div className="field">
                <span className="field-label">Date</span>
                <input
                  className="input"
                  type="date"
                  aria-label="Date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>

              <label className="field">
                <span className="field-label">Note (optional)</span>
                <input
                  className="input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What was this for?"
                />
              </label>

              {error && <p className="text-[12.5px] font-semibold t-red mb-3">{error}</p>}

              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={
                  busy ||
                  awaitingNudge ||
                  (nudge === 3 && !writeoffNote.trim())
                }
              >
                {busy
                  ? "Saving…"
                  : editing
                    ? "Save changes"
                    : tab === "transfer"
                      ? subTab === "person"
                        ? "Send transfer"
                        : "Log settlement"
                      : "Add"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const TYPE_FULL: Record<string, string> = {
  expense: "Expense",
  revenue: "Revenue",
  interest_income: "Interest received",
  interest_expense: "Interest paid",
  card_payment: "Card payment",
  loan_repayment: "Loan repayment",
  transfer: "Family transfer",
};

// ---------------------------------------------------------------------------
// ---- small building blocks ------------------------------------------------
// ---------------------------------------------------------------------------

function Picker({
  label,
  placeholder,
  open,
  onToggle,
  tiles,
  selectedId,
  onPick,
  balanceChip,
}: {
  label: string;
  placeholder: string;
  open: boolean;
  onToggle: () => void;
  tiles: { id: string; label: string; sub?: string; avatar: string }[];
  selectedId: string | null;
  onPick: (id: string) => void;
  balanceChip: string | null;
}) {
  const selected = tiles.find((t) => t.id === selectedId);
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <button type="button" className="input text-left" onClick={onToggle}>
        <span className="flex items-center justify-between">
          <span>
            {selected ? (
              <span className="flex items-center gap-2">
                <span className="avatar" style={{ width: 22, height: 22, fontSize: 9 }}>
                  {selected.avatar}
                </span>
                <span className="text-[13px]">{selected.label}</span>
              </span>
            ) : (
              <span className="text-[13px] t-tertiary">{placeholder}</span>
            )}
          </span>
          <IconArrowNarrowRight size={15} className="t-secondary" />
        </span>
      </button>
      {balanceChip && (
        <p className="text-[12px] font-semibold t-secondary mt-1.5">{balanceChip}</p>
      )}
      {open && (
        <div className="flex flex-wrap gap-2 mt-2">
          {tiles.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`chip ${selectedId === t.id ? "active" : ""}`}
              onClick={() => onPick(t.id)}
            >
              {t.label}
              {t.sub ? <span className="opacity-70 text-[11px]"> · {t.sub}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SelectBox({
  label,
  placeholder,
  value,
  options,
  onPick,
}: {
  label: string;
  placeholder: string;
  value: string | null;
  options: { id: string; label: string }[];
  onPick: (id: string | null) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <select
        className="input"
        value={value ?? ""}
        onChange={(e) => onPick(e.target.value || null)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Nudge({
  title,
  options,
  onPick,
}: {
  title: React.ReactNode;
  options: { id: number; label: string; kind: "primary" | "secondary" | "tertiary" }[];
  onPick: (n: NudgeOption) => void;
}) {
  return (
    <div className="nudge">
      <div className="nudge-head">
        <IconAlertTriangle size={15} />
        <p>{title}</p>
      </div>
      <div className="nudge-options">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`nudge-btn ${o.kind}`}
            onClick={() => onPick(o.id as NudgeOption)}
          >
            {o.label}
            <IconArrowNarrowRight size={14} />
          </button>
        ))}
      </div>
    </div>
  );
}