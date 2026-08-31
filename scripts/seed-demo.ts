#!/usr/bin/env tsx
/**
 * Creates Supabase Auth users for the seeded demo profiles so you can sign in
 * with a known password. The public.users rows already exist (from the seed
 * migration) and use deterministic ids; the trigger keeps them in sync.
 *
 * Usage:
 *   cp .env.example .env.local  # fill in a REAL project (hosted or `supabase start`)
 *   npm run db:migrate          # apply 0001_init.sql + 0002_seed.sql
 *   npm run db:seed-demo        # this script
 *
 * Demo sign-in (password set below):
 *   aravind@example.com / revathi@example.com / karthik@example.com
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRole) {
  console.error(
    "Missing env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "FamilyPurse#2026";

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

async function main() {
  console.log("Seeding demo auth users…");
  for (const u of DEMO_USERS) {
    await upsertUser(admin, u);
  }
  console.log("Done. Sign in with any demo email and the shared demo password.");
}

void main();