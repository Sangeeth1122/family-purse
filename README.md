# Family Purse — App

Phase 1 (Auth + Family Foundation) of the Family Purse finance tracker for The Ramans.
Next.js (App Router) · TypeScript · Tailwind v4 · Supabase/PostgreSQL RLS · Supabase Auth · Tabler Icons · Figtree.

## Setup

1. **Create a Supabase project** (hosted, or `supabase start` for local) and copy its Project URL + keys.

2. **Configure the app:**
   ```bash
   cp .env.example .env.local
   ```
   Fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The service-role key and
   `DATABASE_URL` are only used by offline scripts.

3. **Apply the schema and seed data** (hosted → SQL Editor; local → `supabase db reset`):
   - `supabase/migrations/0001_init.sql` — full schema: enums, all tables, RLS on every table,
     `is_family_admin()` app-admin helper, onboarding RPCs (`create_family`, `join_family`),
     profile-creation trigger on `auth.users`, grants.
   - `supabase/migrations/0002_seed.sql` — canonical demo data (The Ramans, August 2026) with
     deterministic ids.

4. **Create the demo sign-in accounts** (this links real auth users to the seeded profiles):
   ```bash
   npm run db:seed-demo
   ```
   Sign in with `aravind@example.com` (or revathi/karthik) and the shared demo password
   (default `FamilyPurse#2026`, override via `DEMO_PASSWORD`).

5. **Run the app:**
   ```bash
   npm run dev
   ```

## Demo logins

| Role   | Email                |
|--------|----------------------|
| Admin  | aravind@example.com  |
| Member | revathi@example.com  |
| Member | karthik@example.com  |

All use the shared demo password. `aravind@example.com` is the seeded family admin.

## Phase 1 scope

Implemented now:
- Supabase Auth (login / sign up / forgot + reset password)
- Family onboarding: create a family (becomes admin) or join with an invite code
- Personal P&L transaction CRUD via the Add Transaction modal (Expense / Revenue)
  — Transfer tab is deliberately blocked until Phase 2
- Personal budgets & family categories (admin-managed categories)
- Personal Dashboard (net position, budget pace, reminders, category breakdown)
- Category transaction list, transaction detail with edit/delete
- Profile with invite code and member list

Deferred (placeholders link to later phases): cards & loans, reports.