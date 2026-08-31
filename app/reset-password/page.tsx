"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const code = params.get("code");
    if (!code || !isSupabaseConfigured) return;
    createClient()
      .auth.exchangeCodeForSession(code)
      .catch(() => {});
  }, [params]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex flex-col items-center text-center mt-10">
        <div className="w-16 h-16 rounded-full bg-[rgba(74,122,94,0.12)] flex items-center justify-center mb-5">
          <span className="text-[24px]">✓</span>
        </div>
        <h2 className="text-[17px] font-bold mb-1">Password updated</h2>
        <p className="text-[13px] font-semibold t-secondary leading-relaxed">
          You can now log in with your new password.
        </p>
        <button
          className="btn btn-primary w-full mt-8"
          onClick={() => {
            router.push("/login");
            router.refresh();
          }}
        >
          Back to login
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="text-[13px] font-semibold t-secondary leading-relaxed mb-6">
        Choose a new password for your account.
      </p>
      <label className="field">
        <span className="field-label">New password</span>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••"
          autoComplete="new-password"
          minLength={6}
          required
        />
      </label>
      {error && <p className="text-[12.5px] font-semibold t-red mb-3">{error}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex flex-col px-6 pt-10 pb-8">
      <div className="flex items-center gap-3 mb-10">
        <Link href="/login" className="icon-btn">
          <IconArrowLeft size={18} />
        </Link>
        <h1 className="text-[17px] font-bold">Set new password</h1>
      </div>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}