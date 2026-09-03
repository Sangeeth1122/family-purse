"use client";

import { useState } from "react";
import Link from "next/link";
import { IconArrowLeft, IconMailCheck } from "@tabler/icons-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isSupabaseConfigured) {
      setError("Supabase is not configured. Add your project keys to .env.local first.");
      return;
    }
    setBusy(true);
    const { error: err } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="min-h-screen flex flex-col px-1 pt-0 pb-8">
      <div className="flex justify-center mb-5">
        <img
          src="/logo-mark.png"
          alt=""
          aria-hidden="true"
          className="h-8 w-auto"
          style={{ height: "40px" }}
        />
      </div>
      <div className="flex items-center gap-3 mb-7">
        <Link href="/login" className="icon-btn">
          <IconArrowLeft size={18} />
        </Link>
        <h1 className="text-[17px] font-bold">Reset password</h1>
      </div>

      {sent ? (
        <div className="flex flex-col items-center text-center mt-10">
          <div className="w-14 h-14 rounded-2xl bg-[rgba(74,122,94,0.1)] flex items-center justify-center mb-4">
            <IconMailCheck size={26} className="t-green" />
          </div>
          <h2 className="text-[16px] font-bold mb-1.5">Check your email</h2>
          <p className="text-[13px] font-semibold t-secondary leading-relaxed">
            We&apos;ve sent a reset link to <b className="t-primary">{email}</b>. It&apos;ll
            expire in 30 minutes.
          </p>
          <Link href="/login" className="btn btn-primary w-full mt-6">
            Back to login
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <p className="text-[13px] font-semibold t-secondary leading-relaxed mb-6">
            Enter the email for your Family Purse account and we&apos;ll send you a reset link.
          </p>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>
          {error && <p className="text-[12.5px] font-semibold t-red mb-3">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </div>
  );
}