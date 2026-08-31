#!/usr/bin/env tsx
/**
 * Seeds the canonical demo on a REAL Supabase project (also works against a
 * local `supabase start`).
 *
 * WHY THIS SCRIPT EXISTS:
 * public.users.id has FK -> auth.users(id), so the canonical demo rows can
 * never be inserted by a `supabase db push` migration — auth.users is managed
 * by GoTrue and holds no rows for those ids on a fresh project (SQLSTATE 23503).
 * The seed migration 0002_seed.sql therefore self-guards: it only runs its
 * dataset when the three canonical auth ids already exist.
 *
 * This script performs both steps in the only order the FK allows:
 *  1. Creates the three demo Auth users via the Admin API (deterministic ids).
 *     The on_auth_user_created trigger then auto-creates the public.users
 *     profiles (role member, family null, name from metadata).
 *  2. Applies supabase/migrations/0002_seed.sql over a direct database
 *     connection (DATABASE_URL). With the auth ids now present the guard
 *     passes, the canonical dataset lands, and the role/name patch settles
 *     the trigger-created profiles (Aravind → admin).
 *
 * Usage:
 *   cp .env.example .env.local  # fill in a REAL project (hosted or `supabase start`)
 *   supabase db push            # apply schema 0001–0009
 *   npm run db:seed-demo        # this script
 *
 * Demo sign-in (shared password below):
 *   aravind@example.com / revathi@example.com / karthik@example.com
 */
import * as dotenv from "dotenv";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";

// Load .env.local before any process.env reads (a standalone tsx script gets
// none of Next.js's env handling). dotenv loads `.env` by default, so we point
// it at `.env.local` explicitly. Real env vars already exported in the shell
// take precedence over the file.
dotenv.config({ path: join(process.cwd(), ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!url || !serviceRole) {
  console.error(
    "Missing env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}
if (!databaseUrl) {
  console.warn(
    "DATABASE_URL is not set — auth users will be created, but the canonical demo data will NOT be applied. Add the project's connection string to .env.local and re-run.",
  );
}

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "FamilyPurse#2026";

const SEED_FILE = join(process.cwd(), "supabase", "migrations", "0002_seed.sql");

const DEMO_USERS = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    email: "aravind@example.com",
    password: DEMO_PASSWORD,
    name: "Aravind",
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    email: "revathi@example.com",
    password: DEMO_PASSWORD,
    name: "Revathi",
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
    email: "karthik@example.com",
    password: DEMO_PASSWORD,
    name: "Karthik",
  },
];

const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });

async function upsertUser(supabase: SupabaseClient, u: (typeof DEMO_USERS)[number]) {
  const { data, error } = await supabase.auth.admin.createUser({
    id: u.id,
    email: u.email,
    password: u.password,
    email_confirm: true,
    user_metadata: { name: u.name },
  });
  if (error) {
    // Already exists — ensure password matches so it can be used for demo logins.
    if (error.message.toLowerCase().includes("already been registered")) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(u.id, {
        password: u.password,
        user_metadata: { name: u.name },
      });
      if (updateError) {
        console.error(`  ${u.email}: could not reset password — ${updateError.message}`);
        return;
      }
      console.log(`  ${u.email}: already registered (password synced)`);
      return;
    }
    console.error(`  ${u.email}: ${error.message}`);
    return;
  }
  console.log(`  ${u.email}: created ✓`);
  void data;
}

async function applyCanonicalSeed() {
  try {
    const sql = await readFile(SEED_FILE, "utf8");
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query(sql);
      console.log("Canonical demo dataset applied (0002_seed.sql) ✓");
    } finally {
      await client.end();
    }
  } catch (e) {
    console.error("Could not apply the canonical demo dataset:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

async function main() {
  console.log("Creating demo auth users…");
  for (const u of DEMO_USERS) {
    await upsertUser(admin, u);
  }
  if (databaseUrl) {
    await applyCanonicalSeed();
  }
  console.log("Done. Sign in with any demo email and the shared demo password.");
}

void main();