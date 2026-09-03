"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function SetupPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"create" | "join">("create");
  const [familyName, setFamilyName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    createClient()
      .auth.getUser()
      .then(async ({ data }) => {
        if (cancelled || !data.user) return;
        const { data: me } = await createClient()
          .from("users")
          .select("family_id")
          .eq("id", data.user.id)
          .maybeSingle();
        if (!cancelled && me?.family_id) {
          router.replace("/app/dashboard");
          router.refresh();
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onNext(path: string) {
    router.push(path);
    router.refresh();
  }

  async function onCreateFamily(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isSupabaseConfigured) {
      setError("Supabase is not configured. Add your project keys to .env.local first.");
      return;
    }

    const supabase = createClient();
    setBusy(true);
    const { data, error: err } = await supabase.rpc("create_family", {
      family_name: familyName,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (data) await onNext("/app/dashboard");
  }

  async function onJoinFamily(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isSupabaseConfigured) {
      setError("Supabase is not configured. Add your project keys to .env.local first.");
      return;
    }

    const supabase = createClient();
    setBusy(true);
    const { data, error: err } = await supabase.rpc("join_family", {
      family_code: code,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (data) await onNext("/app/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col px-6 pt-14 pb-8">
      <div className="flex flex-col items-center text-center mb-6">
        <img
          src="/logo-mark.png"
          alt=""
          aria-hidden="true"
          className="w-14 h-14"
          style={{ width: 52, height: 52 }}
        />
        <h1 className="text-[20px] font-bold">Set up your family</h1>
        <p className="text-[13px] font-semibold t-secondary leading-relaxed mt-2 px-2">
          Family Purse is shared across the people you trust with money. Start a new family, or
          join one with an invite link.
        </p>
      </div>

      <div className="segmented mb-6">
        <button
          type="button"
          className={`seg ${tab === "create" ? "active" : "inactive"}`}
          onClick={() => setTab("create")}
        >
          Create family
        </button>
        <button
          type="button"
          className={`seg ${tab === "join" ? "active" : "inactive"}`}
          onClick={() => setTab("join")}
        >
          Join family
        </button>
      </div>

      {tab === "create" ? (
        <form onSubmit={onCreateFamily}>
          <label className="field">
            <span className="field-label">Family name</span>
            <input
              className="input"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="e.g. The Ramans"
              required
            />
            <div className="field-hint">
              Just for you and the people you invite — shown on your Family Dashboard.
            </div>
          </label>
          {error && <p className="text-[12.5px] font-semibold t-red mb-3">{error}</p>}
          <button className="btn btn-primary w-full" style={{ padding: 15, fontSize: 15 }} disabled={busy}>
            {busy ? "Creating…" : "Create family"}
          </button>
        </form>
      ) : (
        <form onSubmit={onJoinFamily}>
          <label className="field">
            <span className="field-label">Invite link or code</span>
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste link or enter code"
              required
            />
            <div className="field-hint">
              Ask a family member to send this from their Profile → Invite members screen.
            </div>
          </label>
          {error && <p className="text-[12.5px] font-semibold t-red mb-3">{error}</p>}
          <button className="btn btn-primary w-full" style={{ padding: 15, fontSize: 15 }} disabled={busy}>
            {busy ? "Joining…" : "Join family"}
          </button>
        </form>
      )}

      <p className="text-center text-[12px] font-semibold t-tertiary mt-8">
        You can only belong to one family at a time.
      </p>
    </div>
  );
}