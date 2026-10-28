-- =====================================================================
-- 0014_enhancements.sql
-- Functional enhancements:
-- 1. Allow all family members to log, edit, and delete their own transfers.
-- 2. Audit tracking: updated_at, updated_by on transactions.
-- 3. Accounts module: accounts table and transaction linking.
-- 4. Recurring bills table.
-- 5. Budget rollover and threshold alerts support.
-- =====================================================================

-- 1. Accounts Table
create type public.account_type as enum ('bank', 'savings', 'cash', 'wallet');

create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families(id) on delete cascade,
  user_id         uuid references public.users(id) on delete set null,
  name            text not null,
  type            public.account_type not null default 'bank',
  opening_balance numeric(12, 2) not null default 0,
  status          text not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_accounts_family on public.accounts(family_id);
create index if not exists idx_accounts_user on public.accounts(user_id);

alter table public.accounts enable row level security;

create policy accounts_select on public.accounts
  for select using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.family_id = accounts.family_id
    )
  );

create policy accounts_insert on public.accounts
  for insert with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.family_id = accounts.family_id
    )
  );

create policy accounts_update on public.accounts
  for update using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.family_id = accounts.family_id
    )
  ) with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.family_id = accounts.family_id
    )
  );

-- 2. Recurring Bills Table
create table if not exists public.recurring_bills (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families(id) on delete cascade,
  name            text not null,
  amount          numeric(12, 2) not null check (amount > 0),
  category_id     uuid references public.categories(id) on delete set null,
  due_day         integer not null check (due_day >= 1 and due_day <= 31),
  frequency       text not null default 'monthly',
  active          boolean not null default true,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_recurring_bills_family on public.recurring_bills(family_id);

alter table public.recurring_bills enable row level security;

create policy recurring_bills_select on public.recurring_bills
  for select using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.family_id = recurring_bills.family_id
    )
  );

create policy recurring_bills_insert on public.recurring_bills
  for insert with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.family_id = recurring_bills.family_id
    )
  );

create policy recurring_bills_update on public.recurring_bills
  for update using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.family_id = recurring_bills.family_id
    )
  ) with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.family_id = recurring_bills.family_id
    )
  );

-- 3. Audit fields and account link on transactions
alter table public.transactions add column if not exists account_id uuid references public.accounts(id) on delete set null;
alter table public.transactions add column if not exists updated_at timestamptz default now();
alter table public.transactions add column if not exists updated_by uuid references public.users(id) on delete set null;

-- 4. Update fp_record_transfer to allow ANY member to record family transfers
create or replace function public.fp_record_transfer(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_family uuid;
  v_kind text := lower(p_payload->>'kind');
  v_type text := lower(p_payload->>'type');
  v_scope_type text := lower(coalesce(p_payload->>'scope_type', 'personal'));
  v_scope_id uuid;
  v_amount numeric(10, 2) := (p_payload->>'amount')::numeric(10, 2);
  v_category_id uuid := nullif(p_payload->>'category_id', '')::uuid;
  v_spent_through text := lower(p_payload->>'spent_through');
  v_card_id uuid := nullif(p_payload->>'card_id', '')::uuid;
  v_account_id uuid := nullif(p_payload->>'account_id', '')::uuid;
  v_date text := coalesce(nullif(p_payload->>'date', ''), current_date::text);
  v_note text := nullif(btrim(coalesce(p_payload->>'note', '')), '');
  v_counterpart uuid := nullif(p_payload->>'counterparty_user_id', '')::uuid;
  v_linked_loan uuid := nullif(p_payload->>'linked_loan_id', '')::uuid;
  v_group uuid;
  v_id uuid;
  v_mirror_id uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;
  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'No family — create or join one first';
  end if;

  if v_kind is null or v_kind not in ('pl', 'settlement') then
    raise exception 'Invalid transaction kind';
  end if;
  if v_kind = 'pl' and v_type not in ('expense', 'revenue', 'interest_income', 'interest_expense') then
    raise exception 'Invalid type for a P&L transaction';
  end if;
  if v_kind = 'settlement' and v_type not in ('card_payment', 'loan_repayment', 'transfer') then
    raise exception 'Invalid type for a settlement transaction';
  end if;

  if v_amount is null or v_amount <= 0 or v_amount > 100000000 then
    raise exception 'Amount must be positive';
  end if;
  if v_date is null or v_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Invalid date';
  end if;

  if v_kind = 'pl' then
    if v_scope_type = 'personal' then
      v_scope_id := nullif(p_payload->>'scope_id', '')::uuid;
      if v_scope_id is null or v_scope_id is distinct from v_actor then
        raise exception 'You can only record your own personal transactions';
      end if;
    elsif v_scope_type = 'project' then
      v_scope_id := nullif(p_payload->>'scope_id', '')::uuid;
      if not public.fp_same_family_project(v_scope_id, v_family) then
        raise exception 'Project is not in your family';
      end if;
      if not public.fp_is_project_member(v_scope_id, v_actor) then
        raise exception 'You must be a project member to log its expenses';
      end if;
      if public.fp_is_project_viewer(v_scope_id, v_actor) then
        raise exception 'Project viewers are read-only';
      end if;
      if not public.fp_project_is_active(v_scope_id) then
        raise exception 'Archived projects are read-only';
      end if;
    else
      raise exception 'Invalid scope';
    end if;

    if v_type in ('expense', 'interest_expense') then
      if v_category_id is null then
        raise exception 'P&L expenses require a category';
      end if;
      if not public.fp_category_of_family(v_category_id, v_family) then
        raise exception 'Category is not in your family';
      end if;
      v_spent_through := coalesce(v_spent_through, 'manual');
      if v_spent_through = 'credit_card' then
        if v_card_id is null then
          raise exception 'Pick a card for credit-card spending';
        end if;
        if not public.fp_same_family_card(v_card_id, v_family) then
          raise exception 'Card is not in your family';
        end if;
      elsif v_spent_through <> 'manual' then
        raise exception 'Invalid spent_through';
      end if;
    else
      v_spent_through := null;
      v_card_id := null;
    end if;

    if v_type in ('interest_income', 'interest_expense') then
      if not public.fp_is_system_category(
        v_category_id,
        case when v_type = 'interest_income' then 'Interest Received' else 'Interest Paid' end
      ) then
        raise exception 'Interest rows must use the Interest Received / Interest Paid category';
      end if;
    end if;

    if v_linked_loan is not null and not public.fp_same_family_loan(v_linked_loan, v_family) then
      raise exception 'Loan is not in your family';
    end if;

    insert into public.transactions
      (kind, type, scope_type, scope_id, amount, category_id, spent_through, card_id,
       date, note, created_by, counterparty_user_id, linked_loan_id, transfer_group_id, account_id, updated_at, updated_by)
    values
      (v_kind::public.transaction_kind, v_type::public.transaction_type, v_scope_type::public.transaction_scope_type,
       v_scope_id, v_amount, v_category_id, v_spent_through::public.spent_through, v_card_id,
       v_date::date, v_note, v_actor, null, v_linked_loan, null, v_account_id, now(), v_actor)
    returning id into v_id;

    return jsonb_build_object('id', v_id, 'kind', v_kind, 'type', v_type);
  end if;

  -- settlements:
  -- Admin can log any settlement. Any family member can log a member transfer where they are the sender!
  if v_type <> 'transfer' and not public.fp_is_admin(v_actor) then
    raise exception 'Only a family admin can log card and loan settlements';
  end if;

  if v_scope_type is distinct from 'personal' then
    raise exception 'Settlements are personal-scope movements';
  end if;
  v_category_id := null;
  v_spent_through := null;

  if v_type = 'card_payment' then
    if v_card_id is null then
      raise exception 'A card payment requires a card';
    end if;
    if not public.fp_same_family_card(v_card_id, v_family) then
      raise exception 'Card is not in your family';
    end if;
    v_scope_id := (select user_id from public.credit_cards where id = v_card_id);
    v_linked_loan := null;
    v_counterpart := null;

    insert into public.transactions
      (kind, type, scope_type, scope_id, amount, category_id, spent_through, card_id,
       date, note, created_by, counterparty_user_id, linked_loan_id, transfer_group_id, account_id, updated_at, updated_by)
    values
      ('settlement', 'card_payment', 'personal', v_scope_id, v_amount, null, null, v_card_id,
       v_date::date, v_note, v_actor, null, null, null, v_account_id, now(), v_actor)
    returning id into v_id;

    return jsonb_build_object('id', v_id, 'kind', 'settlement', 'type', 'card_payment');

  elsif v_type = 'loan_repayment' then
    if v_linked_loan is null then
      raise exception 'A loan repayment requires a loan';
    end if;
    if not public.fp_same_family_loan(v_linked_loan, v_family) then
      raise exception 'Loan is not in your family';
    end if;
    v_scope_id := v_actor;
    v_card_id := null;
    v_counterpart := null;

    insert into public.transactions
      (kind, type, scope_type, scope_id, amount, category_id, spent_through, card_id,
       date, note, created_by, counterparty_user_id, linked_loan_id, transfer_group_id, account_id, updated_at, updated_by)
    values
      ('settlement', 'loan_repayment', 'personal', v_scope_id, v_amount, null, null, null,
       v_date::date, v_note, v_actor, null, v_linked_loan, null, v_account_id, now(), v_actor)
    returning id into v_id;

    return jsonb_build_object('id', v_id, 'kind', 'settlement', 'type', 'loan_repayment');

  elsif v_type = 'transfer' then
    if v_counterpart is not null then
      if v_counterpart = v_actor then
        raise exception 'Pick another family member';
      end if;
      if v_linked_loan is not null then
        raise exception 'A family transfer cannot link a loan';
      end if;
      if not public.fp_same_family_user(v_counterpart, v_family) then
        raise exception 'Counterparty is not in your family';
      end if;
      v_group := gen_random_uuid();

      insert into public.transactions
        (kind, type, scope_type, scope_id, amount, category_id, spent_through, card_id,
         date, note, created_by, counterparty_user_id, linked_loan_id, transfer_group_id, account_id, updated_at, updated_by)
      values
        ('settlement', 'transfer', 'personal', v_actor, v_amount, null, null, null,
         v_date::date, v_note, v_actor, v_counterpart, null, v_group, v_account_id, now(), v_actor)
      returning id into v_id;

      insert into public.transactions
        (kind, type, scope_type, scope_id, amount, category_id, spent_through, card_id,
         date, note, created_by, counterparty_user_id, linked_loan_id, transfer_group_id, account_id, updated_at, updated_by)
      values
        ('settlement', 'transfer', 'personal', v_counterpart, v_amount, null, null, null,
         v_date::date,
         case when v_note is null then 'Family transfer mirror' else v_note || ' (mirror)' end,
         v_actor, v_actor, null, v_group, null, now(), v_actor)
      returning id into v_mirror_id;

      return jsonb_build_object(
        'id', v_id, 'mirror_id', v_mirror_id, 'transfer_group_id', v_group,
        'kind', 'settlement', 'type', 'transfer'
      );
    else
      if not public.fp_is_admin(v_actor) then
        raise exception 'Only a family admin can log external loan disbursements';
      end if;
      if v_linked_loan is null then
        raise exception 'An external transfer requires a linked loan';
      end if;
      if not public.fp_same_family_loan(v_linked_loan, v_family) then
        raise exception 'Loan is not in your family';
      end if;
      v_scope_id := v_actor;
      v_card_id := null;
      v_group := gen_random_uuid();

      insert into public.transactions
        (kind, type, scope_type, scope_id, amount, category_id, spent_through, card_id,
         date, note, created_by, counterparty_user_id, linked_loan_id, transfer_group_id, account_id, updated_at, updated_by)
      values
        ('settlement', 'transfer', 'personal', v_scope_id, v_amount, null, null, null,
         v_date::date, v_note, v_actor, null, v_linked_loan, v_group, v_account_id, now(), v_actor)
      returning id into v_id;

      return jsonb_build_object('id', v_id, 'transfer_group_id', v_group, 'kind', 'settlement', 'type', 'transfer');
    end if;
  end if;

  raise exception 'Unreachable';
end;
$$;

-- 5. Update fp_update_transaction for creator edit permissions & audit
create or replace function public.fp_update_transaction(
  p_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_family uuid;
  v_row public.transactions%rowtype;
  v_amount numeric(10, 2);
  v_date text;
  v_note text;
  v_category_id uuid;
  v_card_id uuid;
  v_spent_through text;
  v_linked_loan uuid;
  v_account_id uuid;
  v_mirror_note text;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;
  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'No family — create or join one first';
  end if;

  select * into v_row from public.transactions where id = p_id;
  if not found then
    raise exception 'Transaction not found';
  end if;
  if public.fp_transaction_family(v_row) is distinct from v_family then
    raise exception 'Transaction is not in your family';
  end if;

  -- authorization:
  if v_row.kind = 'pl' then
    if not (
      (v_row.scope_type = 'personal' and v_row.scope_id = v_actor and v_row.created_by = v_actor)
      or public.fp_is_admin(v_actor)
    ) then
      raise exception 'You can only edit your own personal transactions';
    end if;
  else
    -- For settlements: Creator of transfer can edit, or admin can edit
    if not (
      (v_row.type = 'transfer' and v_row.created_by = v_actor)
      or public.fp_is_admin(v_actor)
    ) then
      raise exception 'You can only edit your own transfers or be an admin';
    end if;
  end if;

  v_amount := coalesce((p_payload->>'amount')::numeric(10, 2), v_row.amount);
  v_date   := coalesce(nullif(p_payload->>'date', ''), v_row.date::text);
  v_note   := nullif(btrim(coalesce(p_payload->>'note', '')), '');
  v_account_id := coalesce(nullif(p_payload->>'account_id', '')::uuid, v_row.account_id);

  if v_amount is null or v_amount <= 0 or v_amount > 100000000 then
    raise exception 'Amount must be positive';
  end if;
  if v_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Invalid date';
  end if;

  if v_row.kind = 'pl' then
    v_category_id := coalesce(nullif(p_payload->>'category_id', '')::uuid, v_row.category_id);
    v_card_id     := coalesce(nullif(p_payload->>'card_id', '')::uuid, v_row.card_id);
    v_spent_through := coalesce(lower(p_payload->>'spent_through'), v_row.spent_through::text);
    v_linked_loan := coalesce(nullif(p_payload->>'linked_loan_id', '')::uuid, v_row.linked_loan_id);

    if v_category_id is not null and not public.fp_category_of_family(v_category_id, v_family) then
      raise exception 'Category is not in your family';
    end if;
    if v_row.type in ('expense', 'interest_expense') then
      if v_category_id is null then
        raise exception 'P&L expenses require a category';
      end if;
      v_spent_through := coalesce(v_spent_through, 'manual');
      if v_spent_through = 'credit_card' then
        if v_card_id is null then
          raise exception 'Pick a card for credit-card spending';
        end if;
        if not public.fp_same_family_card(v_card_id, v_family) then
          raise exception 'Card is not in your family';
        end if;
      elsif v_spent_through <> 'manual' then
        raise exception 'Invalid spent_through';
      end if;
    else
      v_spent_through := null;
      v_card_id := null;
    end if;

    update public.transactions
      set amount = v_amount,
          date = v_date::date,
          note = v_note,
          category_id = v_category_id,
          spent_through = v_spent_through::public.spent_through,
          card_id = v_card_id,
          linked_loan_id = v_linked_loan,
          account_id = v_account_id,
          updated_at = now(),
          updated_by = v_actor
      where id = p_id;
  else
    update public.transactions
      set amount = v_amount,
          date = v_date::date,
          note = v_note,
          account_id = v_account_id,
          updated_at = now(),
          updated_by = v_actor
      where id = p_id;

    if v_row.type = 'transfer' and v_row.counterparty_user_id is not null and v_row.transfer_group_id is not null then
      v_mirror_note := case when v_note is null then 'Family transfer mirror' else v_note || ' (mirror)' end;
      update public.transactions
        set amount = v_amount,
            date = v_date::date,
            note = v_mirror_note,
            updated_at = now(),
            updated_by = v_actor
        where transfer_group_id = v_row.transfer_group_id and id <> p_id;
    end if;
  end if;

  return jsonb_build_object('id', p_id, 'updated', true);
end;
$$;

-- 6. Update fp_delete_transaction so creator can delete their own transfer
create or replace function public.fp_delete_transaction(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_family uuid;
  v_row public.transactions%rowtype;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;
  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'No family — create or join one first';
  end if;

  select * into v_row from public.transactions where id = p_id;
  if not found then
    raise exception 'Transaction not found';
  end if;
  if public.fp_transaction_family(v_row) is distinct from v_family then
    raise exception 'Transaction is not in your family';
  end if;

  if v_row.kind = 'pl' then
    if not (
      (v_row.scope_type = 'personal' and v_row.scope_id = v_actor and v_row.created_by = v_actor)
      or public.fp_is_admin(v_actor)
    ) then
      raise exception 'You can only delete your own personal transactions';
    end if;
  else
    if not (
      (v_row.type = 'transfer' and v_row.created_by = v_actor)
      or public.fp_is_admin(v_actor)
    ) then
      raise exception 'You can only delete your own transfers or be an admin';
    end if;
  end if;

  if v_row.transfer_group_id is not null then
    delete from public.transactions where transfer_group_id = v_row.transfer_group_id;
  else
    delete from public.transactions where id = p_id;
  end if;
end;
$$;

-- 7. Budget rollover calculation helper
create or replace function public.fp_get_budget_rollover(p_family_id uuid, p_start_date date)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(
    (
      select greatest(0, b.total_amount - coalesce((
        select sum(t.amount)
        from public.transactions t
        where t.kind = 'pl'
          and (t.type = 'expense' or t.type = 'interest_expense')
          and t.date >= b.start_date
          and t.date <= b.end_date
      ), 0))
      from public.budgets b
      where b.family_id = p_family_id
        and b.type = 'monthly'
        and b.active = true
        and b.end_date = (p_start_date - interval '1 day')::date
      limit 1
    ),
    0
  );
$$;
