"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

type Mode = "login" | "signup";
type Status = { kind: "error" | "info"; message: string } | null;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!cancelled && data.user) {
          router.replace("/app/dashboard");
          router.refresh();
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (!isSupabaseConfigured) {
      setStatus({
        kind: "info",
        message: "Supabase is not configured. Copy .env.example to .env.local and add your project keys.",
      });
      return;
    }

    const supabase = createClient();
    setBusy(true);

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) {
        setStatus({ kind: "error", message: error.message });
        setBusy(false);
        return;
      }
      router.push("/setup");
      router.refresh();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setStatus({ kind: "error", message: error.message });
      return;
    }
    router.push("/app/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col px-6 pt-14 pb-8">
      <h1 className="text-center text-[20px] font-bold">Family Purse</h1>
      <p className="text-center text-[13px] font-semibold t-secondary mt-1 mb-8">
        Track it together, decide with clarity
      </p>

      <div className="segmented mb-6">
        <button
          type="button"
          className={`seg ${mode === "login" ? "active" : "inactive"}`}
          onClick={() => setMode("login")}
        >
          Log in
        </button>
        <button
          type="button"
          className={`seg ${mode === "signup" ? "active" : "inactive"}`}
          onClick={() => setMode("signup")}
        >
          Sign up
        </button>
      </div>

      <form onSubmit={onSubmit}>
        {mode === "signup" && (
          <label className="field">
            <span className="field-label">Your name</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aravind Raman"
              required
            />
          </label>
        )}

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

        <label className="field">
          <span className="field-label">Password</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={6}
            required
          />
        </label>

        {mode === "login" && (
          <p className="text-right mb-6">
            <Link href="/forgot-password" className="text-[12px] font-semibold t-secondary">
              Forgot password?
            </Link>
          </p>
        )}

        {status && (
          <p
            className={`text-[12.5px] font-semibold mb-3 text-center leading-snug ${
              status.kind === "error" ? "t-red" : "t-secondary"
            }`}
          >
            {status.message}
          </p>
        )}

        <button className="btn btn-primary w-full mb-4" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>

      <div className="flex items-center gap-3 my-2 mb-5">
        <div className="flex-1 h-px" style={{ background: "rgba(0,0,0,0.08)" }} />
        <span className="text-[11px] font-semibold t-secondary">OR</span>
        <div className="flex-1 h-px" style={{ background: "rgba(0,0,0,0.08)" }} />
      </div>

      <p className="text-center text-[13px] font-semibold t-secondary">
        {mode === "login" ? (
          <>
            New here?{" "}
            <button
              type="button"
              className="font-bold t-primary"
              onClick={() => setMode("signup")}
            >
              Join your family&apos;s account
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              className="font-bold t-primary"
              onClick={() => setMode("login")}
            >
              Log in
            </button>
          </>
        )}
      </p>
    </div>
  );
}