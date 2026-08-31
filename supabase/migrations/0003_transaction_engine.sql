-- =====================================================================
-- 0003_transaction_engine.sql
-- Phase 2 — Core transaction engine (server-side write path).
--
-- All transaction writes flow through SECURITY DEFINER functions so the
-- contract's invariants are enforced in one audited place:
--   * Settlement rows (card_payment / loan_repayment / transfer) require a
--     family admin (Issue 5 keeps Phase-1 RLS semantics).
--   * Family-member transfers write TWO rows sharing transfer_group_id,
--     atomically in the same DB transaction (Issue 4).
--   * External loan principal uses a SINGLE `transfer` row with a unique
--     transfer_group_id and NO counterparty_user_id (Issue 1).
--   * Card payments and loan repayments are SINGLE settlement rows
--     (Issue 4 — one economic event is one balance-affecting event).
--   * loan_repayment is the ONLY type that reduces loan principal;
--     interest_* rows are P&L only and never touch principal (Issue 3).
--   * Every referenced entity (cards, loans, categories, counterparties,
--     projects) must belong to the actor's family; personal P&L must be the
--     actor's own; project P&L requires project membership.
--
-- The Phase-1 RLS policies from 0001 remain untouched (reads + defense in
-- depth). These functions re-validate every rule server-side and provide
-- atomicity for paired rows. A repayment_total bookkeeping trigger keeps
-- loans.repayment_total consistent with the settlement rows.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Internal helpers (grant: owner only — not exposed via PostgREST)
-- ---------------------------------------------------------------------

create or replace function public.fp_current_family(p_user uuid default auth.uid())
returns uuid
language sql
stable
set search_path = public
as $$
  select (select family_id from public.users where id = p_user);
$$;

create or replace function public.fp_is_admin(p_user uuid default auth.uid())
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((select role = 'admin' from public.users where id = p_user), false);
$$;

create or replace function public.fp_same_family_user(p_user uuid, p_family uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from public.users u where u.id = p_user and u.family_id = p_family);
$$;

create or replace function public.fp_same_family_card(p_card uuid, p_family uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.credit_cards c
    join public.users u on u.id = c.user_id
    where c.id = p_card and u.family_id = p_family
  );
$$;

create or replace function public.fp_same_family_loan(p_loan uuid, p_family uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.loans l
    join public.users u on u.id = l.created_by
    where l.id = p_loan and u.family_id = p_family
  );
$$;

create or replace function public.fp_category_of_family(p_cat uuid, p_family uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from public.categories c where c.id = p_cat and c.family_id = p_family);
$$;

create or replace function public.fp_is_system_category(p_cat uuid, p_name text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from public.categories c where c.id = p_cat and c.system and c.name = p_name);
$$;

create or replace function public.fp_same_family_project(p_project uuid, p_family uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from public.projects p where p.id = p_project and p.family_id = p_family);
$$;

create or replace function public.fp_is_project_member(p_project uuid, p_user uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project and pm.user_id = p_user
  );
$$;

-- Whether a project is still open for writes (active; archived = read-only).
create or replace function public.fp_project_is_active(p_project uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from public.projects p where p.id = p_project and p.status = 'active');
$$;

-- Whether the user sits on a project as a viewer (viewers are read-only).
create or replace function public.fp_is_project_viewer(p_project uuid, p_user uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project and pm.user_id = p_user and pm.role = 'viewer'
  );
$$;

-- The family a transaction belongs to, derived from its scope.
create or replace function public.fp_transaction_family(p_txn public.transactions)
returns uuid
language sql
stable
set search_path = public
as $$
  select case
    when p_txn.scope_type = 'personal' then (select family_id from public.users where id = p_txn.scope_id)
    when p_txn.scope_type = 'project'  then (select family_id from public.projects where id = p_txn.scope_id)
  end;
$$;

-- ---------------------------------------------------------------------
-- CREATE — single write entry point. Accepts one payload object or an
-- array of payloads (a batch is committed atomically; used for guard-rail
-- "log as interest" / "write off" flows that save 2 rows together).
-- ---------------------------------------------------------------------

create or replace function public.fp_create_transaction(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor          uuid := auth.uid();
  v_family         uuid;
  v_kind           text;
  v_type           text;
  v_scope_type     text;
  v_scope_id       uuid;
  v_amount         numeric(10, 2);
  v_category_id    uuid;
  v_spent_through  text;
  v_card_id        uuid;
  v_date           text;
  v_note           text;
  v_counterpart    uuid;
  v_linked_loan    uuid;
  v_group          uuid;
  v_id             uuid;
  v_mirror_id      uuid;
  v_result         jsonb;
  v_elem           jsonb;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if jsonb_typeof(p_payload) = 'array' then
    for v_elem in select * from jsonb_array_elements(p_payload)
    loop
      v_result := public.fp_create_transaction(v_elem);
    end loop;
    return coalesce(v_result, jsonb_build_object('batch', true));
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'No family — create or join one first';
  end if;
  if not exists (select 1 from public.users where id = v_actor) then
    raise exception 'Unknown user';
  end if;

  v_kind   := lower(p_payload->>'kind');
  v_type   := lower(p_payload->>'type');
  v_scope_type := lower(p_payload->>'scope_type');
  v_scope_id   := (p_payload->>'scope_id')::uuid;
  -- Personal ledger defaults to the actor when the client omits scope_id.
  if v_scope_type = 'personal' and v_scope_id is null then
    v_scope_id := v_actor;
  end if;
  v_amount     := (p_payload->>'amount')::numeric(10, 2);
  v_category_id := nullif(p_payload->>'category_id', '')::uuid;
  v_spent_through := lower(p_payload->>'spent_through');
  v_card_id   := nullif(p_payload->>'card_id', '')::uuid;
  v_date      := p_payload->>'date';
  v_note      := nullif(btrim(coalesce(p_payload->>'note', '')), '');
  v_counterpart := nullif(p_payload->>'counterparty_user_id', '')::uuid;
  v_linked_loan := nullif(p_payload->>'linked_loan_id', '')::uuid;

  if v_kind not in ('pl', 'settlement') then
    raise exception 'Invalid kind';
  end if;

  -- kind/type pairing (mirrors the table CHECK, with a clear message)
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
    -- scope: personal = the actor's own ledger; project = a project the
    -- actor belongs to, inside the actor's family.
    if v_scope_type = 'personal' then
      if v_scope_id is distinct from v_actor then
        raise exception 'You can only record your own personal transactions';
      end if;
    elsif v_scope_type = 'project' then
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

    -- interest rows: category must be the matching system category; the
    -- linked loan is optional (card interest has no loan) but same-family.
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
       date, note, created_by, counterparty_user_id, linked_loan_id, transfer_group_id)
    values
      (v_kind::public.transaction_kind, v_type::public.transaction_type, v_scope_type::public.transaction_scope_type,
       v_scope_id, v_amount, v_category_id, v_spent_through::public.spent_through, v_card_id,
       v_date::date, v_note, v_actor, null, v_linked_loan, null)
    returning id into v_id;

    return jsonb_build_object('id', v_id, 'kind', v_kind, 'type', v_type);
  end if;

  -- ---- settlements ---------------------------------------------------
  if not public.fp_is_admin(v_actor) then
    raise exception 'Only a family admin can log settlements';
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
       date, note, created_by, counterparty_user_id, linked_loan_id, transfer_group_id)
    values
      ('settlement', 'card_payment', 'personal', v_scope_id, v_amount, null, null, v_card_id,
       v_date::date, v_note, v_actor, null, null, null)
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
       date, note, created_by, counterparty_user_id, linked_loan_id, transfer_group_id)
    values
      ('settlement', 'loan_repayment', 'personal', v_scope_id, v_amount, null, null, null,
       v_date::date, v_note, v_actor, null, v_linked_loan, null)
    returning id into v_id;

    return jsonb_build_object('id', v_id, 'kind', 'settlement', 'type', 'loan_repayment');

  elsif v_type = 'transfer' then
    if v_counterpart is not null then
      -- Family-member transfer: TWO rows sharing transfer_group_id,
      -- written atomically (Issue 4). Mirror row sits on the recipient's
      -- ledger with the originator as counterparty.
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
         date, note, created_by, counterparty_user_id, linked_loan_id, transfer_group_id)
      values
        ('settlement', 'transfer', 'personal', v_actor, v_amount, null, null, null,
         v_date::date, v_note, v_actor, v_counterpart, null, v_group)
      returning id into v_id;

      insert into public.transactions
        (kind, type, scope_type, scope_id, amount, category_id, spent_through, card_id,
         date, note, created_by, counterparty_user_id, linked_loan_id, transfer_group_id)
      values
        ('settlement', 'transfer', 'personal', v_counterpart, v_amount, null, null, null,
         v_date::date,
         case when v_note is null then 'Family transfer mirror' else v_note || ' (mirror)' end,
         v_actor, v_actor, null, v_group)
      returning id into v_mirror_id;

      return jsonb_build_object(
        'id', v_id, 'mirror_id', v_mirror_id, 'transfer_group_id', v_group,
        'kind', 'settlement', 'type', 'transfer'
      );
    else
      -- External loan principal: SINGLE settlement `transfer` row, unique
      -- transfer_group_id identifies the event, no counterparty (Issue 1).
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
         date, note, created_by, counterparty_user_id, linked_loan_id, transfer_group_id)
      values
        ('settlement', 'transfer', 'personal', v_scope_id, v_amount, null, null, null,
         v_date::date, v_note, v_actor, null, v_linked_loan, v_group)
      returning id into v_id;

      return jsonb_build_object(
        'id', v_id, 'transfer_group_id', v_group,
        'kind', 'settlement', 'type', 'transfer'
      );
    end if;
  end if;

  raise exception 'Invalid settlement type';
end;
$$;

-- ---------------------------------------------------------------------
-- UPDATE
-- P&L rows: editable by their owner or a family admin (structural fields
-- scope/type/kind are frozen; category/card/spent-through/linked-loan are
-- re-validated). Settlements: admin only; amount/date/note are editable;
-- a paired family transfer updates its mirror row atomically (Issue 4).
-- ---------------------------------------------------------------------

create or replace function public.fp_update_transaction(p_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_family  uuid;
  v_row     public.transactions%rowtype;
  v_mirror  uuid;
  v_amount  numeric(10, 2);
  v_date    text;
  v_note    text;
  v_category_id uuid;
  v_spent_through text;
  v_card_id uuid;
  v_linked_loan uuid;
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

  -- authorization
  if v_row.kind = 'pl' then
    if not (
      (v_row.scope_type = 'personal' and v_row.scope_id = v_actor and v_row.created_by = v_actor)
      or public.fp_is_admin(v_actor)
    ) then
      raise exception 'You can only edit your own personal transactions';
    end if;
  elsif not public.fp_is_admin(v_actor) then
    raise exception 'Only a family admin can edit settlements';
  end if;
  if v_row.scope_type = 'project' and not public.fp_project_is_active(v_row.scope_id) then
    raise exception 'Archived projects are read-only';
  end if;

  v_amount := coalesce((p_payload->>'amount')::numeric(10, 2), v_row.amount);
  v_date   := coalesce(nullif(p_payload->>'date', ''), v_row.date::text);
  v_note   := nullif(btrim(coalesce(p_payload->>'note', '')), '');
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
    if v_row.type in ('interest_income', 'interest_expense') then
      if not public.fp_is_system_category(
        v_category_id,
        case when v_row.type = 'interest_income' then 'Interest Received' else 'Interest Paid' end
      ) then
        raise exception 'Interest rows must use the Interest Received / Interest Paid category';
      end if;
    end if;
    if v_linked_loan is not null and not public.fp_same_family_loan(v_linked_loan, v_family) then
      raise exception 'Loan is not in your family';
    end if;

    update public.transactions
      set amount = v_amount,
          date = v_date::date,
          note = v_note,
          category_id = v_category_id,
          spent_through = v_spent_through::public.spent_through,
          card_id = v_card_id,
          linked_loan_id = v_linked_loan
      where id = p_id;
  else
    -- settlements: only amount/date/note are editable; the structural
    -- shape (kind/type/scope/card/loan/counterparty) is frozen.
    update public.transactions
      set amount = v_amount,
          date = v_date::date,
          note = v_note
      where id = p_id;

    if v_row.type = 'transfer' and v_row.counterparty_user_id is not null and v_row.transfer_group_id is not null then
      v_mirror_note := case when v_note is null then 'Family transfer mirror' else v_note || ' (mirror)' end;
      update public.transactions
        set amount = v_amount,
            date = v_date::date,
            note = v_mirror_note
        where transfer_group_id = v_row.transfer_group_id and id <> p_id;
    end if;
  end if;

  return jsonb_build_object('id', p_id, 'updated', true);
end;
$$;

-- ---------------------------------------------------------------------
-- DELETE
-- Same authorization as UPDATE. A paired family-member transfer removes
-- BOTH rows (same transfer_group_id) atomically — never leaves one side
-- orphaned (guard rail 3 / Issue 4).
-- ---------------------------------------------------------------------

create or replace function public.fp_delete_transaction(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_family uuid;
  v_row   public.transactions%rowtype;
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
  elsif not public.fp_is_admin(v_actor) then
    raise exception 'Only a family admin can delete settlements';
  end if;
  if v_row.scope_type = 'project' and not public.fp_project_is_active(v_row.scope_id) then
    raise exception 'Archived projects are read-only';
  end if;

  if v_row.type = 'transfer' and v_row.counterparty_user_id is not null and v_row.transfer_group_id is not null then
    delete from public.transactions where transfer_group_id = v_row.transfer_group_id;
  else
    delete from public.transactions where id = p_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- loans.repayment_total bookkeeping — keep it consistent with the
-- settlement rows so `principal - repayment_total` is always exact.
-- ---------------------------------------------------------------------

create or replace function public.fp_sync_loan_repayment_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan uuid;
begin
  v_loan := coalesce(new.linked_loan_id, old.linked_loan_id);
  if v_loan is null then
    return coalesce(new, old);
  end if;
  update public.loans l
     set repayment_total = (
       select coalesce(sum(t.amount), 0)
       from public.transactions t
       where t.linked_loan_id = v_loan
         and t.kind = 'settlement'
         and t.type = 'loan_repayment'
     )
   where l.id = v_loan;
  return coalesce(new, old);
end;
$$;

drop trigger if exists transactions_loan_repayment_sync on public.transactions;
create trigger transactions_loan_repayment_sync
  after insert or update or delete on public.transactions
  for each row execute function public.fp_sync_loan_repayment_totals();

-- ---------------------------------------------------------------------
-- Grants — only the engine entry points are callable by the app.
-- ---------------------------------------------------------------------

revoke execute on function public.fp_current_family(uuid) from public;
revoke execute on function public.fp_is_admin(uuid) from public;
revoke execute on function public.fp_same_family_user(uuid, uuid) from public;
revoke execute on function public.fp_same_family_card(uuid, uuid) from public;
revoke execute on function public.fp_same_family_loan(uuid, uuid) from public;
revoke execute on function public.fp_category_of_family(uuid, uuid) from public;
revoke execute on function public.fp_is_system_category(uuid, text) from public;
revoke execute on function public.fp_same_family_project(uuid, uuid) from public;
revoke execute on function public.fp_is_project_member(uuid, uuid) from public;
revoke execute on function public.fp_project_is_active(uuid) from public;
revoke execute on function public.fp_is_project_viewer(uuid, uuid) from public;
revoke execute on function public.fp_transaction_family(public.transactions) from public;
revoke execute on function public.fp_sync_loan_repayment_totals() from public;

revoke execute on function public.fp_create_transaction(jsonb) from public;
revoke execute on function public.fp_update_transaction(uuid, jsonb) from public;
revoke execute on function public.fp_delete_transaction(uuid) from public;

grant execute on function public.fp_create_transaction(jsonb) to authenticated;
grant execute on function public.fp_update_transaction(uuid, jsonb) to authenticated;
grant execute on function public.fp_delete_transaction(uuid) to authenticated;