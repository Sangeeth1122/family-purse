"use client";

import { useEffect, useState } from "react";
import { useEsc } from "@/components/use-esc";
import { useRouter } from "next/navigation";
import {
  IconArrowUpRight,
  IconArrowDownLeft,
  IconBell,
  IconBellOff,
  IconBuildingBank,
  IconPlus,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { initials, parseINR, toINRInput } from "@/lib/format";
import type { Loan, UserRow } from "@/lib/types";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function LoanSheetBody({
  loan,
  hasActivity,
  onDone,
}: {
  loan?: Loan | null;
  hasActivity?: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const editing = !!loan;

  const [direction, setDirection] = useState<"given" | "taken">(
    loan?.direction ?? "given",
  );
  const [memberId, setMemberId] = useState<string | null>(
    loan?.counterparty_user_id ?? null,
  );
  const [externalName, setExternalName] = useState(
    loan && !loan.counterparty_user_id ? (loan.counterparty_name ?? "") : "",
  );
  const [principal, setPrincipal] = useState(
    loan ? String(loan.principal_amount) : "",
  );
  const [rate, setRate] = useState(
    loan?.interest_rate != null ? String(loan.interest_rate) : "",
  );
  const [startDate, setStartDate] = useState(loan?.start_date ?? today());
  const [dueDate, setDueDate] = useState(loan?.due_date ?? "");
  const [reminders, setReminders] = useState<"monthly" | "none">(
    loan?.reminder_frequency ?? "monthly",
  );
  const [notes, setNotes] = useState(loan?.note ?? "");

  const [members, setMembers] = useState<UserRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counterpartyType, setCounterpartyType] = useState<"external" | "family">(
    loan?.counterparty_user_id ? "family" : "external",
  );

  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.from("users").select("*").order("name");
      if (alive && data) setMembers(data as UserRow[]);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const principalNum = parseINR(principal);
  const rateNum = rate.trim() ? parseFloat(toINRInput(rate)) : 0;

  function validate(): string | null {
    if (counterpartyType === "family" && !memberId) {
      return "Pick a family member.";
    }
    if (counterpartyType === "external" && !externalName.trim()) {
      return "Enter an external name.";
    }
    if (principalNum <= 0) return "Enter a valid principal amount.";
    if (rate.trim() && (rateNum <= 0 || rateNum > 100)) {
      return "Interest rate must be between 0 and 100.";
    }
    if (!startDate) return "Choose a start date.";
    if (dueDate && dueDate < startDate) {
      return "The due date can't be before the start date.";
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    const supabase = createClient();

    if (editing) {
      const { error: err } = await supabase.rpc("fp_update_loan", {
        p_id: loan!.id,
        p_payload: {
          direction,
          counterparty_user_id: memberId,
          counterparty_name: memberId ? null : externalName.trim(),
          interest_rate: rate.trim() ? rateNum : null,
          start_date: startDate,
          due_date: dueDate || null,
          reminder_frequency: reminders,
          note: notes.trim() || null,
        },
      });
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
      onDone();
      router.refresh();
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      setError("You need to sign in again.");
      return;
    }

    const { error: err } = await supabase.rpc("fp_create_loan", {
      p_payload: {
        direction,
        counterparty_user_id: memberId,
        counterparty_name: memberId ? null : externalName.trim(),
        principal_amount: principalNum,
        interest_rate: rate.trim() ? rateNum : null,
        start_date: startDate,
        due_date: dueDate || null,
        reminder_frequency: reminders,
        note: notes.trim() || null,
      },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    onDone();
    router.refresh();
  }

  const directionLocked = editing && hasActivity;

  return (
    <form onSubmit={onSubmit}>
      <div className="field">
        <span className="field-label">Direction</span>
        <div className="segmented">
          <button
            type="button"
            className={`seg ${direction === "given" ? "active" : ""}`}
            onClick={() => setDirection("given")}
            disabled={directionLocked}
          >
            <IconArrowUpRight size={14} /> Given (lent out)
          </button>
          <button
            type="button"
            className={`seg ${direction === "taken" ? "active" : ""}`}
            onClick={() => setDirection("taken")}
            disabled={directionLocked}
          >
            <IconArrowDownLeft size={14} /> Taken (borrowed)
          </button>
        </div>
        {directionLocked && (
          <p className="field-hint">
            Direction is locked — this loan already has recorded activity.
          </p>
        )}
      </div>

      <div className="field">
        <span className="field-label">Counterparty</span>
        <div className="segmented">
          <button
            type="button"
            className={`seg ${counterpartyType === "family" ? "active" : ""}`}
            onClick={() => {
              setCounterpartyType("family");
              if (!memberId && members.length > 0) setMemberId(members[0].id);
              setExternalName("");
            }}
          >
            <IconUser size={14} /> Family member
          </button>
          <button
            type="button"
            className={`seg ${counterpartyType === "external" ? "active" : ""}`}
            onClick={() => {
              setCounterpartyType("external");
              setMemberId(null);
            }}
          >
            <IconBuildingBank size={14} /> External
          </button>
        </div>
      </div>

      {counterpartyType === "family" && members.length > 0 && (
        <div className="field">
          <span className="field-label">Family member</span>
          <div className="avatar-row" style={{ overflowX: "auto" }}>
            {members.map((m) => (
              <div
                key={m.id}
                className={`avatar-chip ${memberId === m.id ? "selected" : ""}`}
                style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 60 }}
              >
                <button
                  type="button"
                  aria-pressed={memberId === m.id}
                  aria-label={`Loan with ${m.name}`}
                  className={`avatar`}
                  style={{ width: 48, height: 48 }}
                  onClick={() => setMemberId(memberId === m.id ? null : m.id)}
                >
                  {initials(m.name)}
                </button>
                <span>{m.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {counterpartyType === "external" && (
        <div className="field">
          <span className="field-label">External name</span>
          <input
            className="input"
            aria-label="External name"
            placeholder="External name — e.g. HDFC Personal Loan"
            value={externalName}
            onChange={(e) => setExternalName(e.target.value)}
            maxLength={80}
          />
          <p className="field-hint">Enter the name of the person, bank, or institution outside the family.</p>
        </div>
      )}

      {counterpartyType === "family" && members.length === 0 && (
        <p className="text-[12.5px] font-semibold t-tertiary">
          No other family members to select. Add members first, or choose External.
        </p>
      )}

      <label className="field">
        <span className="field-label">Principal amount</span>
        <div className="relative">
          <span
            className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold"
            style={{ color: "var(--text-secondary)" }}
          >
            ₹
          </span>
          <input
            className="input pl-8"
            inputMode="decimal"
            value={principal}
            onChange={(e) => setPrincipal(toINRInput(e.target.value))}
            placeholder="0"
            disabled={editing}
            required
          />
        </div>
        {editing && (
          <p className="field-hint">
            Principal is set when the loan is created and stays fixed.
          </p>
        )}
      </label>

      <label className="field">
        <span className="field-label">Interest rate (annual %) — optional</span>
        <input
          className="input"
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(toINRInput(e.target.value))}
          placeholder="e.g. 8"
        />
        <p className="field-hint">Leave blank for an interest-free loan.</p>
      </label>

      <div className="field">
        <span className="field-label">Dates</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <input
            className="input"
            type="date"
            aria-label="Start date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <input
            className="input"
            type="date"
            aria-label="Due date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            placeholder="Due date"
          />
        </div>
      </div>

      <div className="field">
        <span className="field-label">Reminders</span>
        <div className="segmented">
          <button
            type="button"
            className={`seg ${reminders === "monthly" ? "active" : ""}`}
            onClick={() => setReminders("monthly")}
          >
            <IconBell size={14} /> Monthly
          </button>
          <button
            type="button"
            className={`seg ${reminders === "none" ? "active" : ""}`}
            onClick={() => setReminders("none")}
          >
            <IconBellOff size={14} /> None
          </button>
        </div>
      </div>

      <label className="field">
        <span className="field-label">Notes — optional</span>
        <input
          className="input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. for the Goa trip"
          maxLength={200}
        />
      </label>

      {!editing && (
        <p className="field-hint" style={{ margin: "0 0 16px" }}>
          Saving this creates the loan and logs the principal as a one-time
          transfer automatically — you won&apos;t need to enter it again.
        </p>
      )}

      {error && <p className="text-[12.5px] font-semibold t-red mb-3">{error}</p>}

      <button className="btn btn-primary w-full" disabled={busy || (editing && directionLocked)}>
        {busy ? "Saving…" : editing ? "Save changes" : "Add Loan"}
      </button>
    </form>
  );
}

/**
 * Loan add/edit sheet. Controlled — render the trigger yourself.
 * `hasActivity` (any repayments / interest / write-offs recorded) locks the
 * direction toggle on edit — the engine enforces the same rule.
 */
export default function AddLoanSheet({
  open,
  onClose,
  loan,
  hasActivity,
}: {
  open: boolean;
  onClose: () => void;
  loan?: Loan | null;
  hasActivity?: boolean;
}) {
  useEsc(open, onClose);
  if (!open) return null;
  return (
    <div
      className="sheet-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-loan-title"
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="handle" />
        <div className="sheet-head">
          <h2 id="add-loan-title">{loan ? "Edit loan" : "Add Loan"}</h2>
          <button type="button" className="close-btn" aria-label="Close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>
        <LoanSheetBody
          loan={loan}
          hasActivity={hasActivity}
          onDone={onClose}
        />
      </div>
    </div>
  );
}

/** Header "+" Add Loan button (loans list page) — matches AddCardButton style. */
export function AddLoanButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="icon-btn"
        aria-label="Add loan"
        onClick={() => setOpen(true)}
      >
        <IconPlus size={18} />
      </button>
      <AddLoanSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}