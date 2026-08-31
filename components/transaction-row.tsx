import Link from "next/link";
import { formatINR, formatDayMonth } from "@/lib/format";

export type TxnRowDatum = {
  id: string;
  amount: number;
  date: string;
  note: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  type: string;
  creatorName: string;
  showCreator?: boolean;
  /** Balance-reducing entry shown as a green "+" (card payments, write-offs). */
  reduceBalance?: boolean;
};

export default function TransactionRow({
  t,
  href = `/app/transactions/${t.id}`,
  sign = "auto",
}: {
  t: TxnRowDatum;
  href?: string;
  sign?: "auto" | "out" | "in" | "neutral";
}) {
  const derivedOut = t.type === "expense" || t.type === "interest_expense";
  const derivedIn = t.type === "revenue" || t.type === "interest_income";
  const isOut = sign === "out" ? true : sign === "in" ? false : derivedOut;
  const isIn = sign === "in" ? true : sign === "out" ? false : derivedIn;
  const neutral = !isOut && !isIn;

  return (
    <Link href={href} className="txn-row">
      <div className="txn-icon">
        <span className="dot" style={{ background: t.categoryColor ?? "#8A867C" }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="txn-title truncate">
          {t.note || t.categoryName || t.type}
          <span className="ml-1 t-tertiary font-medium text-[12px]">
            {t.showCreator ? `· ${t.creatorName}` : ""}
          </span>
        </div>
        <div className="txn-sub">
          {t.categoryName ?? "Uncategorised"} · {formatDayMonth(t.date)}
        </div>
      </div>
      <span
        className={`txn-amt ${isIn ? "pos" : ""}`}
        style={neutral ? { color: "var(--text)" } : undefined}
      >
        {isOut ? "−" : isIn ? "+" : ""} {formatINR(t.amount)}
      </span>
    </Link>
  );
}