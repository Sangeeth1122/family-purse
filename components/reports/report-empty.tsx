import Link from "next/link";
import { IconInbox } from "@tabler/icons-react";

/** Intentional empty state for a report with no matching transactions. */
export default function ReportEmpty({
  message = "No transactions match this period.",
  hint = "Pick another period, or add a transaction from the + button.",
}: {
  message?: string;
  hint?: string;
}) {
  return (
    <div className="card mx-5 mt-4 p-8 flex flex-col items-center text-center">
      <span className="h-11 w-11 rounded-xl flex items-center justify-center bg-black/5">
        <IconInbox size={20} stroke={1.8} className="t-tertiary" />
      </span>
      <p className="mt-3 text-[14px] font-bold">{message}</p>
      <p className="mt-1 text-[12.5px] font-semibold t-tertiary">{hint}</p>
      <Link
        href="/app/dashboard"
        className="btn btn-secondary mt-4 px-5"
      >
        Back to dashboard
      </Link>
    </div>
  );
}