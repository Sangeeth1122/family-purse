"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertCircle,
  IconBell,
  IconCalendarTime,
  IconChartPie,
  IconCreditCard,
  IconPercentage,
  IconX,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { formatFullDate, formatINR } from "@/lib/format";
import { useEsc } from "@/components/use-esc";
import type { Reminder } from "@/lib/types";

const TYPE_ICON: Record<Reminder["type"], typeof IconBell> = {
  card_payment_due: IconCreditCard,
  loan_interest_check: IconPercentage,
  loan_due: IconBell,
  budget_threshold: IconChartPie,
};

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function daysFrom(to: string): number {
  const today = new Date(`${todayKey()}T00:00:00`).getTime();
  const due = new Date(`${to}T00:00:00`).getTime();
  return Math.round((due - today) / 86400000);
}

function detailHref(r: Reminder): string | null {
  if (r.card_id) return `/app/cards/${r.card_id}`;
  if (r.loan_id) return `/app/loans/${r.loan_id}`;
  if (r.category_id) return "/app/budgets";
  return null;
}

export default function RemindersBell({
  reminders,
  isAdmin,
}: {
  reminders: Reminder[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Reminder[]>(reminders);

  useEsc(open, () => setOpen(false));

  const groups = useMemo(() => {
    const today = todayKey();
    const overdue: Reminder[] = [];
    const upcoming: Reminder[] = [];
    for (const r of items) {
      (r.due_date < today ? overdue : upcoming).push(r);
    }
    overdue.sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
    upcoming.sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
    return { overdue, upcoming };
  }, [items]);

  async function dismiss(id: string) {
    setItems((it) => it.filter((r) => r.id !== id));
    await createClient().from("reminders").update({ status: "dismissed" }).eq("id", id);
  }

  const pending = items.length;
  const today = todayKey();

  return (
    <>
      <button
        type="button"
        className="icon-btn relative"
        aria-label={`Notifications${pending > 0 ? `, ${pending} pending` : ""}`}
        onClick={() => setOpen(true)}
      >
        <IconBell size={20} />
        {pending > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#B0562F] text-white text-[10px] font-bold flex items-center justify-center">
            {pending}
          </span>
        )}
      </button>

      {open && (
        <div
          className="sheet-overlay"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reminders-title"
        >
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="handle" />
            <div className="sheet-head">
              <h2 id="reminders-title">Reminders</h2>
              <button
                type="button"
                className="close-btn"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <IconX size={16} />
              </button>
            </div>

            {pending === 0 ? (
              <p className="text-[12.5px] font-semibold t-tertiary text-center py-8">
                No reminders right now.
              </p>
            ) : (
              <div className="px-5">
                {groups.overdue.length > 0 && (
                  <>
                    <div className="flex items-center gap-1.5 px-1 pt-2 pb-2">
                      <IconAlertCircle size={14} className="t-secondary" />
                      <h3 className="text-[12px] font-bold uppercase tracking-wide t-secondary">
                        Overdue
                      </h3>
                      <span className="ml-auto text-[10.5px] font-bold t-red bg-[rgba(176,86,47,0.1)] px-2 py-0.5 rounded-full">
                        {groups.overdue.length}
                      </span>
                    </div>
                    <div className="card p-1.5 mb-1">
                      {groups.overdue.map((r) => (
                        <ReminderRow
                          key={r.id}
                          r={r}
                          overdueMeta={`Was due ${-daysFrom(r.due_date)} day${-daysFrom(r.due_date) === 1 ? "" : "s"} ago`}
                          today={today}
                          canDismiss={isAdmin}
                          onDismiss={() => dismiss(r.id)}
                          onOpen={() => {
                            const href = detailHref(r);
                            setOpen(false);
                            if (href) router.push(href);
                          }}
                        />
                      ))}
                    </div>
                  </>
                )}

                {groups.upcoming.length > 0 && (
                  <>
                    <div className="flex items-center gap-1.5 px-1 pt-3 pb-2">
                      <IconCalendarTime size={14} className="t-secondary" />
                      <h3 className="text-[12px] font-bold uppercase tracking-wide t-secondary">
                        Upcoming
                      </h3>
                      <span className="ml-auto text-[10.5px] font-bold t-secondary bg-[var(--card)] border px-2 py-0.5 rounded-full">
                        {groups.upcoming.length}
                      </span>
                    </div>
                    <div className="card p-1.5">
                      {groups.upcoming.map((r) => {
                        const inDays = daysFrom(r.due_date);
                        const meta =
                          inDays === 0
                            ? "Due today"
                            : `Due in ${inDays} days · ${formatFullDate(r.due_date)}`;
                        return (
                          <ReminderRow
                            key={r.id}
                            r={r}
                            overdueMeta={meta}
                            today={today}
                            canDismiss={isAdmin}
                            onDismiss={() => dismiss(r.id)}
                            onOpen={() => {
                              const href = detailHref(r);
                              setOpen(false);
                              if (href) router.push(href);
                            }}
                          />
                        );
                      })}
                    </div>
                  </>
                )}

                <p className="field-hint">
                  Reminders come from loan due dates, card payment dates, and
                  budgets crossing 90% — dismiss one here, or snooze it from the
                  loan/card/budget itself.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ReminderRow({
  r,
  overdueMeta,
  today,
  canDismiss,
  onDismiss,
  onOpen,
}: {
  r: Reminder;
  overdueMeta: string;
  today: string;
  canDismiss: boolean;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  const overdue = r.due_date < today;
  const Icon = TYPE_ICON[r.type] ?? IconBell;
  const amountTone =
    overdue || r.type === "budget_threshold" ? "t-secondary" : "t-primary";
  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${overdue ? "bg-[rgba(176,86,47,0.05)]" : ""}`}
    >
      <button
        type="button"
        className="flex items-center gap-3 flex-1 min-w-0 text-left"
        onClick={onOpen}
      >
        <span
          className={`h-9 w-9 rounded-[10px] flex items-center justify-center shrink-0 ${
            overdue
              ? "bg-[rgba(176,86,47,0.1)] t-red"
              : "bg-[var(--bg)] border t-secondary"
          }`}
          style={overdue ? undefined : { borderColor: "var(--border)" }}
        >
          <Icon size={16} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-bold truncate">{r.title}</span>
          <span
            className={`block text-[11px] font-semibold mt-0.5 ${overdue ? "t-red" : "t-tertiary"}`}
          >
            {overdueMeta}
          </span>
        </span>
        {r.amount !== null && (
          <span className={`text-[13px] font-bold num ${amountTone}`}>
            {formatINR(r.amount)}
          </span>
        )}
      </button>
      {canDismiss && (
        <button
          type="button"
          className="text-[15px] t-tertiary px-1"
          aria-label={`Dismiss ${r.title}`}
          onClick={onDismiss}
        >
          <IconX size={15} />
        </button>
      )}
    </div>
  );
}