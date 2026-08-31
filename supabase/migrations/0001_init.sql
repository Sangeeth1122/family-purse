-- Family Purse — Phase 1 schema
-- Enforces: loan model (Issue 1/3), budget uniqueness (Issue 2/9), family-scoped
-- categories (Issue 6), secure signup (Issue 7), role separation (Issue 5/8).

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- =====================================================================
-- Enums
-- =====================================================================

do $$ begin
  create type public.user_role           as enum ('admin', 'member');
  create type public.project_role        as enum ('owner', 'contributor', 'viewer');
  create type public.project_status      as enum ('active', 'archived');
  create type public.budget_scope_type   as enum ('personal', 'project');
  create type public.budget_period       as enum ('monthly', 'one_time', 'custom');
  create type public.credit_card_status  as enum ('active', 'closed');
  create type public.transaction_kind    as enum ('pl', 'settlement');
  create type public.transaction_type    as enum ('expense', 'revenue', 'interest_income', 'interest_expense', 'card_payment', 'loan_repayment', 'transfer');
  create type public.transaction_scope_type as enum ('personal', 'project');
  create type public.spent_through       as enum ('credit_card', 'manual');
  create type public.loan_direction      as enum ('given', 'taken');
  create type public.reminder_frequency  as enum ('monthly', 'none');
  create type public.loan_status         as enum ('active', 'closed');
  create type public.reminder_status     as enum ('pending', 'sent', 'dismissed');
  create type public.reminder_type       as enum ('card_payment_due', 'loan_interest_check', 'loan_due', 'budget_threshold');
exception when duplicate_object then null; end $$;

-- =====================================================================
-- Tables
-- =====================================================================

create table public.users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique,
  name       text not null,
  role       public.user_role not null default 'member',
  family_id  uuid,
  created_at timestamptz not null default now()
);
create index idx_users_family on public.users(family_id);
create index idx_users_role   on public.users(role);

create table public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null unique references public.users(id) on delete restrict,
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at  timestamptz not null default now()
);

-- Circular family ↔ user membership resolved via ALTER (both tables now exist).
alter table public.users
  add constraint users_family_id_fkey
  foreign key (family_id) references public.families(id) on delete set null;

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families(id) on delete cascade,
  name       text not null,
  color      text not null,
  system     boolean not null default false,
  sort_order integer not null default 0,
  constraint categories_family_unique unique (name, system, family_id)
);
create index idx_categories_family on public.categories(family_id);
create index idx_categories_system on public.categories(system);

create table public.projects (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families(id) on delete cascade,
  name       text not null,
  created_by uuid not null references public.users(id) on delete restrict,
  status     public.project_status not null default 'active',
  budget     numeric(10, 2) check (budget > 0),
  created_at timestamptz not null default now()
);
create index idx_projects_family on public.projects(family_id);
create index idx_projects_status on public.projects(status);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  role       public.project_role not null default 'contributor',
  primary key (project_id, user_id),
  unique (project_id, user_id)
);
create index idx_project_members_user on public.project_members(user_id);

create table public.budgets (
  id          uuid primary key default gen_random_uuid(),
  scope_type  public.budget_scope_type not null,
  scope_id    uuid not null,
  category_id uuid not null references public.categories(id) on delete cascade,
  amount      numeric(10, 2) not null check (amount > 0),
  period      public.budget_period not null default 'monthly',
  start_date  date,
  end_date    date,
  constraint budgets_period_dates check (
    (period = 'custom' and start_date is not null and end_date is not null and start_date <= end_date)
    or (period <> 'custom' and start_date is null and end_date is null)
  )
);
create index idx_budgets_scope     on public.budgets(scope_type, scope_id);
create index idx_budgets_category  on public.budgets(category_id);
-- Issue 9: period-specific uniqueness
create unique index budgets_unique_monthly   on public.budgets(scope_type, scope_id, category_id) where period = 'monthly';
create unique index budgets_unique_one_time  on public.budgets(scope_type, scope_id, category_id) where period = 'one_time';
create unique index budgets_unique_custom    on public.budgets(scope_type, scope_id, category_id, start_date, end_date) where period = 'custom';
-- Custom periods must not overlap for the same scope/category.
alter table public.budgets
  add constraint budgets_no_custom_overlap
  exclude using gist (
    scope_type with =,
    scope_id   with =,
    category_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (period = 'custom');

create table public.credit_cards (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name    text not null,
  status  public.credit_card_status not null default 'active',
  created_at timestamptz not null default now()
);
create index idx_credit_cards_user   on public.credit_cards(user_id);
create index idx_credit_cards_status on public.credit_cards(status);

create table public.loans (
  id                  uuid primary key default gen_random_uuid(),
  direction           public.loan_direction not null,
  counterparty_user_id uuid references public.users(id) on delete set null,
  counterparty_name   text,
  principal_amount    numeric(10, 2) not null check (principal_amount > 0),
  interest_rate       numeric(5, 2) check (interest_rate > 0),
  start_date          date not null,
  due_date            date,
  reminder_frequency  public.reminder_frequency not null default 'none',
  status              public.loan_status not null default 'active',
  repayment_total     numeric(10, 2) not null default 0 check (repayment_total >= 0),
  created_by          uuid not null references public.users(id) on delete restrict,
  created_at          timestamptz not null default now(),
  constraint loans_counterparty check (counterparty_user_id is not null or (counterparty_name is not null and counterparty_name <> ''))
);
create index idx_loans_direction on public.loans(direction);
create index idx_loans_status    on public.loans(status);
create index idx_loans_counterparty on public.loans(counterparty_user_id);

create table public.transactions (
  id                  uuid primary key default gen_random_uuid(),
  kind                public.transaction_kind not null,
  type                public.transaction_type not null,
  scope_type          public.transaction_scope_type not null,
  scope_id            uuid not null,
  amount              numeric(10, 2) not null check (amount > 0),
  category_id         uuid references public.categories(id) on delete set null,
  spent_through       public.spent_through,
  card_id             uuid references public.credit_cards(id) on delete set null,
  date                date not null,
  note                text,
  created_by          uuid not null references public.users(id) on delete restrict,
  counterparty_user_id uuid references public.users(id) on delete set null,
  linked_loan_id      uuid references public.loans(id) on delete set null,
  transfer_group_id   uuid,
  created_at          timestamptz not null default now(),
  -- Issue 1 (loan model) + card/loan/transfer linkage
  constraint transactions_kind_type check (
    (kind = 'pl'         and type in ('expense', 'revenue', 'interest_income', 'interest_expense'))
    or (kind = 'settlement' and type in ('card_payment', 'loan_repayment', 'transfer'))
  ),
  constraint transactions_card_payment check (type <> 'card_payment' or card_id is not null),
  constraint transactions_loan_repayment check (type <> 'loan_repayment' or linked_loan_id is not null),
  constraint transactions_transfer check (type <> 'transfer' or counterparty_user_id is not null or transfer_group_id is not null)
);
create index idx_transactions_kind       on public.transactions(kind);
create index idx_transactions_type       on public.transactions(type);
create index idx_transactions_scope      on public.transactions(scope_type, scope_id);
create index idx_transactions_category   on public.transactions(category_id);
create index idx_transactions_card       on public.transactions(card_id);
create index idx_transactions_loan       on public.transactions(linked_loan_id);
create index idx_transactions_created_by on public.transactions(created_by);
create index idx_transactions_date       on public.transactions(date);

create table public.reminders (
  id          uuid primary key default gen_random_uuid(),
  loan_id     uuid references public.loans(id) on delete cascade,
  card_id     uuid references public.credit_cards(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  due_date    date not null,
  status      public.reminder_status not null default 'pending',
  type        public.reminder_type not null,
  title       text not null,
  amount      numeric(10, 2) check (amount > 0),
  created_at  timestamptz not null default now()
);
create index idx_reminders_loan on public.reminders(loan_id);
create index idx_reminders_status on public.reminders(status);
create index idx_reminders_type on public.reminders(type);

create table public.report_presets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  name       text not null,
  filters    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_report_presets_user on public.report_presets(user_id);
create index idx_report_presets_name on public.report_presets(name);

-- =====================================================================
-- Helpers / security
-- =====================================================================

-- Issue 5: application admin check. Never uses service_role / auth.role().
create or replace function public.is_family_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = p_user_id
      and u.role = 'admin'
  );
$$;

-- Same-family check for RLS policies. SECURITY DEFINER (runs as owner, RLS not
-- reapplied) so a policy on `users` can call it without self-recursion.
create or replace function public.user_in_family(p_user_id uuid, p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = p_user_id
      and u.family_id = p_family_id
  );
$$;

-- Issue 7: profile auto-creation from Supabase Auth; no public INSERT policy.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name, role, family_id, created_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'member',
    null,
    coalesce(new.created_at, now())
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Seed the six personal categories + three system categories for a family.
create or replace function public.create_default_categories(fid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (family_id, name, color, system, sort_order) values
    (fid, 'Food & Dining',     '#B0562F', false, 0),
    (fid, 'Travel',            '#7A6FA8', false, 1),
    (fid, 'Shopping',          '#C79A3A', false, 2),
    (fid, 'Groceries',         '#4A7A5E', false, 3),
    (fid, 'Utilities',         '#3E7CA6', false, 4),
    (fid, 'Others',            '#8A867C', false, 5),
    (fid, 'Interest Paid',     '#B0562F', true, 6),
    (fid, 'Interest Received', '#4A7A5E', true, 7),
    (fid, 'Balance Write-off', '#8A867C', true, 8)
  on conflict (name, system, family_id) do nothing;
end;
$$;

-- Onboarding RPCs (Issue 7). SECURITY DEFINER runs as the owner, bypassing RLS.
create or replace function public.create_family(family_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_family_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from public.users u where u.id = v_user_id) then
    raise exception 'User profile not found';
  end if;

  if exists (select 1 from public.users u where u.id = v_user_id and u.family_id is not null) then
    raise exception 'Already in a family';
  end if;

  insert into public.families (name, owner_id)
  values (trim(family_name), v_user_id)
  returning id into v_family_id;

  update public.users
  set family_id = v_family_id, role = 'admin'
  where id = v_user_id;

  perform public.create_default_categories(v_family_id);

  return v_family_id;
end;
$$;

create or replace function public.join_family(family_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_family_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from public.users u where u.id = v_user_id) then
    raise exception 'User profile not found';
  end if;

  if exists (select 1 from public.users u where u.id = v_user_id and u.family_id is not null) then
    raise exception 'Already in a family';
  end if;

  select id into v_family_id from public.families
  where upper(trim(family_code)) = invite_code;

  if v_family_id is null then
    raise exception 'Invalid family code';
  end if;

  update public.users
  set family_id = v_family_id
  where id = v_user_id;

  return v_family_id;
end;
$$;

-- =====================================================================
-- RLS
-- =====================================================================

alter table public.families enable row level security;

create policy families_select on public.families
  for select using (
    is_family_admin(auth.uid())
    or exists (select 1 from public.users u where u.id = auth.uid() and u.family_id = families.id)
  );
create policy families_insert on public.families
  for insert with check (false);
create policy families_update on public.families
  for update using (is_family_admin(auth.uid())) with check (is_family_admin(auth.uid()));
create policy families_delete on public.families
  for delete using (is_family_admin(auth.uid()));

alter table public.users enable row level security;

-- Issue 7: no broad INSERT; members see each other for full-visibility reporting (Issue 5/8).
create policy users_select on public.users
  for select using (
    auth.uid() = id
    or is_family_admin(auth.uid())
    or user_in_family(auth.uid(), family_id)
  );
create policy users_insert on public.users
  for insert with check (false);
create policy users_update on public.users
  for update using (auth.uid() = id or is_family_admin(auth.uid()))
  with check (auth.uid() = id or is_family_admin(auth.uid()));
create policy users_delete on public.users
  for delete using (false);

alter table public.categories enable row level security;

create policy categories_select on public.categories
  for select using (
    is_family_admin(auth.uid())
    or exists (select 1 from public.users u where u.id = auth.uid() and u.family_id = categories.family_id)
  );
create policy categories_insert on public.categories
  for insert with check (is_family_admin(auth.uid()));
create policy categories_update on public.categories
  for update using (is_family_admin(auth.uid())) with check (is_family_admin(auth.uid()));
create policy categories_delete on public.categories
  for delete using (is_family_admin(auth.uid()));

alter table public.projects enable row level security;

create policy projects_select on public.projects
  for select using (
    is_family_admin(auth.uid())
    or exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.family_id = projects.family_id
    )
  );
create policy projects_insert on public.projects
  for insert with check (is_family_admin(auth.uid()));
create policy projects_update on public.projects
  for update using (is_family_admin(auth.uid())) with check (is_family_admin(auth.uid()));
create policy projects_delete on public.projects
  for delete using (is_family_admin(auth.uid()));

alter table public.project_members enable row level security;

-- Issue 8: project roles (owner/contributor/viewer) are separate from family roles.
create policy project_members_select on public.project_members
  for select using (
    is_family_admin(auth.uid())
    or user_id = auth.uid()
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = project_members.project_id and pm.user_id = auth.uid()
    )
  );
create policy project_members_insert on public.project_members
  for insert with check (
    is_family_admin(auth.uid())
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = project_members.project_id and pm.user_id = auth.uid() and pm.role = 'owner'
    )
  );
create policy project_members_update on public.project_members
  for update using (
    is_family_admin(auth.uid())
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = project_members.project_id and pm.user_id = auth.uid() and pm.role = 'owner'
    )
  ) with check (
    is_family_admin(auth.uid())
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = project_members.project_id and pm.user_id = auth.uid() and pm.role = 'owner'
    )
  );
create policy project_members_delete on public.project_members
  for delete using (
    is_family_admin(auth.uid())
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = project_members.project_id and pm.user_id = auth.uid() and pm.role = 'owner'
    )
  );

alter table public.budgets enable row level security;

create policy budgets_select on public.budgets
  for select using (
    is_family_admin(auth.uid())
    or scope_type = 'personal' and exists (
      select 1 from public.users me, public.users target
      where me.id = auth.uid() and target.id = budgets.scope_id
        and me.family_id is not null and me.family_id = target.family_id
    )
    or scope_type = 'project' and exists (
      select 1 from public.project_members pm
      where pm.project_id = budgets.scope_id and pm.user_id = auth.uid()
    )
  );
create policy budgets_insert on public.budgets
  for insert with check (
    (scope_type = 'personal' and scope_id = auth.uid())
    or is_family_admin(auth.uid())
  );
create policy budgets_update on public.budgets
  for update using (
    (scope_type = 'personal' and scope_id = auth.uid())
    or is_family_admin(auth.uid())
  ) with check (
    (scope_type = 'personal' and scope_id = auth.uid())
    or is_family_admin(auth.uid())
  );
create policy budgets_delete on public.budgets
  for delete using (
    (scope_type = 'personal' and scope_id = auth.uid())
    or is_family_admin(auth.uid())
  );

alter table public.credit_cards enable row level security;

create policy credit_cards_select on public.credit_cards
  for select using (
    is_family_admin(auth.uid())
    or user_id = auth.uid()
    or exists (select 1 from public.users u where u.id = auth.uid() and u.family_id = (select owner.family_id from public.users owner where owner.id = credit_cards.user_id))
  );
create policy credit_cards_insert on public.credit_cards
  for insert with check (user_id = auth.uid() or is_family_admin(auth.uid()));
create policy credit_cards_update on public.credit_cards
  for update using (user_id = auth.uid() or is_family_admin(auth.uid()))
  with check (user_id = auth.uid() or is_family_admin(auth.uid()));
create policy credit_cards_delete on public.credit_cards
  for delete using (user_id = auth.uid() or is_family_admin(auth.uid()));

alter table public.transactions enable row level security;

-- Full visibility for reporting; editing restricted per member (Issue 5).
create policy transactions_select on public.transactions
  for select using (
    is_family_admin(auth.uid())
    or exists (
      select 1 from public.users viewer, public.users creator
      where viewer.id = auth.uid()
        and creator.id = transactions.created_by
        and viewer.family_id is not null
        and viewer.family_id = creator.family_id
    )
  );
create policy transactions_insert_personal on public.transactions
  for insert with check (
    kind = 'pl'
    and scope_type = 'personal'
    and scope_id = auth.uid()
    and created_by = auth.uid()
  );
create policy transactions_insert_project on public.transactions
  for insert with check (
    kind = 'pl'
    and scope_type = 'project'
    and created_by = auth.uid()
    and exists (select 1 from public.project_members pm where pm.project_id = scope_id and pm.user_id = auth.uid())
  );
create policy transactions_insert_settlement on public.transactions
  for insert with check (kind = 'settlement' and is_family_admin(auth.uid()));
create policy transactions_update_own on public.transactions
  for update using (
    kind = 'pl' and scope_type = 'personal' and scope_id = auth.uid() and created_by = auth.uid()
  ) with check (
    kind = 'pl' and scope_type = 'personal' and scope_id = auth.uid() and created_by = auth.uid()
  );
create policy transactions_update_admin on public.transactions
  for update using (is_family_admin(auth.uid())) with check (is_family_admin(auth.uid()));
create policy transactions_delete_own on public.transactions
  for delete using (kind = 'pl' and scope_type = 'personal' and scope_id = auth.uid() and created_by = auth.uid());
create policy transactions_delete_admin on public.transactions
  for delete using (is_family_admin(auth.uid()));

alter table public.loans enable row level security;

create policy loans_select on public.loans
  for select using (
    is_family_admin(auth.uid())
    or exists (
      select 1 from public.users viewer, public.users creator
      where viewer.id = auth.uid() and creator.id = loans.created_by
        and viewer.family_id is not null and viewer.family_id = creator.family_id
    )
  );
create policy loans_insert on public.loans
  for insert with check (is_family_admin(auth.uid()));
create policy loans_update on public.loans
  for update using (is_family_admin(auth.uid())) with check (is_family_admin(auth.uid()));
create policy loans_delete on public.loans
  for delete using (is_family_admin(auth.uid()));

alter table public.reminders enable row level security;

create policy reminders_select on public.reminders
  for select using (
    is_family_admin(auth.uid())
    or exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.family_id is not null
        and (
          exists (
            select 1 from public.loans l join public.users owner on owner.id = l.created_by
            where l.id = reminders.loan_id and owner.family_id = u.family_id
          )
          or exists (
            select 1 from public.credit_cards c join public.users owner on owner.id = c.user_id
            where c.id = reminders.card_id and owner.family_id = u.family_id
          )
          or exists (
            select 1 from public.categories ca
            where ca.id = reminders.category_id and ca.family_id = u.family_id
          )
        )
    )
  );
create policy reminders_insert on public.reminders
  for insert with check (is_family_admin(auth.uid()));
create policy reminders_update on public.reminders
  for update using (is_family_admin(auth.uid())) with check (is_family_admin(auth.uid()));
create policy reminders_delete on public.reminders
  for delete using (is_family_admin(auth.uid()));

alter table public.report_presets enable row level security;

create policy report_presets_select on public.report_presets
  for select using (user_id = auth.uid());
create policy report_presets_insert on public.report_presets
  for insert with check (user_id = auth.uid());
create policy report_presets_update on public.report_presets
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy report_presets_delete on public.report_presets
  for delete using (user_id = auth.uid());

-- =====================================================================
-- Grants
-- =====================================================================

grant usage on schema public to authenticated, anon, service_role;

grant select, insert, update, delete on
  public.families, public.users, public.categories, public.projects,
  public.project_members, public.budgets, public.credit_cards,
  public.transactions, public.loans, public.reminders, public.report_presets
  to authenticated;

grant execute on function public.is_family_admin(uuid) to authenticated, anon;
grant execute on function public.handle_new_user() to supabase_auth_admin;
grant execute on function public.create_family(text) to authenticated;
grant execute on function public.join_family(text) to authenticated;
grant execute on function public.create_default_categories(uuid) to authenticated;

revoke execute on function public.create_family(text) from public;
revoke execute on function public.join_family(text) from public;