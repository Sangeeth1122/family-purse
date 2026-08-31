"use client";

import { useRouter } from "next/navigation";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center text-[26px] font-black"
        style={{ background: "rgba(176,86,47,0.12)", color: "var(--red)" }}
        aria-hidden="true"
      >
        !
      </div>
      <h1 className="text-[20px] font-bold mt-5">Something went wrong</h1>
      <p className="text-[13px] font-semibold t-secondary mt-2 max-w-[280px] leading-relaxed">
        Family Purse hit an unexpected problem on this screen. Your balances are
        safe — check your connection and try again.
      </p>
      <div className="flex gap-3 mt-6 w-full max-w-[300px]">
        <button type="button" className="btn btn-secondary flex-1" onClick={() => reset()}>
          Try again
        </button>
        <button
          type="button"
          className="btn btn-primary flex-1"
          onClick={() => router.push("/app/dashboard")}
        >
          Go home
        </button>
      </div>
      {process.env.NODE_ENV === "production" ? null : (
        <p className="text-[11px] font-semibold t-tertiary mt-6 break-all max-w-[340px]">
          {error.message}
        </p>
      )}
    </div>
  );
}