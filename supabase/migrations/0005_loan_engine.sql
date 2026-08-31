-- =====================================================================
-- 0005_loan_engine.sql
-- Phase 4 — Loan lifecycle RPCs (create / edit / delete).
--
-- The loans mockup carries an optional "Notes" field, so the loans row
-- gains a `note` column (0002 seed is frozen — existing loans get NULL).
--
-- Loan creation uses the existing engine (pg 0003) exactly once per loan:
--
--   * Family-member loan  -> `transfer`, TWO paired rows (Issue 1/4).
--                            No linked_loan — the engine forbids it, so
--                            the loan record stays the sole debt authority.
--   * External loan       -> `transfer`, SINGLE row linked to the loan with
--                            a unique transfer_group_id (Issue 1).
--
-- Neither is P&L, neither is ever a repayment, and the initial principal is
-- established by the loans row (authoritative for debt).
--
-- Edit: metadata only as a guard rail. Principal is set once at creation
-- (changing it would silently desync the recorded initial transfer(s)),
-- and direction can only change while the loan has no recorded activity.
--
-- Delete: a loan with repayments / interest / write-offs cannot be deleted
-- (the FK on transactions.linked_loan_id is ON DELETE SET NULL, which the
-- loan_repayment CHECK would violate anyway). Only a pristine loan may be
-- deleted; its single external-principal transfer is removed with it,
-- while family-member transfers (never linked to the loan) stay put.
-- =====================================================================

alter table public.loans
  add column if not exists note text;

-- ---------------------------------------------------------------------
-- CREATE — validates and inserts the loans row, then logs the one-time
-- principal `transfer` via the existing engine atomically (a raised error
-- rolls the whole statement back).
-- ---------------------------------------------------------------------

create or replace function public.fp_create_loan(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor          uuid := auth.uid();
  v_family         uuid;
  v_direction      text;
  v_counterpart    uuid;
  v_name           text;
  v_principal      numeric(10, 2);
  v_interest       numeric;
  v_start          text;
  v_due            text;
  v_reminder       text;
  v_note           text;
  v_loan_id        uuid;
  v_result         jsonb;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;
  if not public.fp_is_admin(v_actor) then
    raise exception 'Only a family admin can create a loan';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;

  v_direction := lower(p_payload->>'direction');
  if v_direction not in ('given', 'taken') then
    raise exception 'Loan direction must be given or taken';
  end if;

  v_counterpart := nullif(p_payload->>'counterparty_user_id', '')::uuid;
  v_name := nullif(btrim(coalesce(p_payload->>'counterparty_name', '')), '');
  if v_counterpart is null and v_name is null then
    raise exception 'Pick a family member or type an external name';
  end if;
  if v_counterpart is not null then
    if v_counterpart = v_actor then
      raise exception 'You cannot lend to or borrow from yourself';
    end if;
    if not public.fp_same_family_user(v_counterpart, v_family) then
      raise exception 'Counterparty is not in your family';
    end if;
    v_name := null;
  end if;

  v_principal := (p_payload->>'principal_amount')::numeric(10, 2);
  if v_principal is null or v_principal <= 0 or v_principal > 100000000 then
    raise exception 'Principal must be a positive amount';
  end if;

  v_interest := (p_payload->>'interest_rate')::numeric;
  if v_interest is not null and (v_interest <= 0 or v_interest > 100) then
    raise exception 'Interest rate must be between 0 and 100 percent';
  end if;

  v_start := p_payload->>'start_date';
  if v_start is null or v_start !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'A valid start date is required';
  end if;
  v_due := nullif(p_payload->>'due_date', '');
  if v_due is not null and v_due !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Invalid due date';
  end if;
  if v_due is not null and v_due < v_start then
    raise exception 'Due date cannot be before the start date';
  end if;

  v_reminder := coalesce(lower(p_payload->>'reminder_frequency'), 'none');
  if v_reminder not in ('monthly', 'none') then
    raise exception 'Reminder frequency must be monthly or none';
  end if;

  v_note := nullif(btrim(coalesce(p_payload->>'note', '')), '');

  insert into public.loans
    (direction, counterparty_user_id, counterparty_name, principal_amount,
     interest_rate, start_date, due_date, reminder_frequency, status,
     repayment_total, created_by, note)
  values
    (v_direction::public.loan_direction, v_counterpart, v_name, v_principal,
     v_interest, v_start::date, v_due::date, v_reminder::public.reminder_frequency, 'active',
     0, v_actor, v_note)
  returning id into v_loan_id;

  -- The one-time principal movement. Family members pair; external loans
  -- link the single row to the new loan (Issue 1).
  if v_counterpart is not null then
    v_result := public.fp_create_transaction(jsonb_build_object(
      'kind', 'settlement', 'type', 'transfer', 'scope_type', 'personal',
      'amount', v_principal, 'counterparty_user_id', v_counterpart,
      'date', v_start,
      'note', coalesce(v_note, case when v_direction = 'given' then 'Loan to ' ||
             (select name from public.users where id = v_counterpart)
             else 'Loan from ' || (select name from public.users where id = v_counterpart) end))
    );
  else
    v_result := public.fp_create_transaction(jsonb_build_object(
      'kind', 'settlement', 'type', 'transfer', 'scope_type', 'personal',
      'amount', v_principal, 'linked_loan_id', v_loan_id,
      'date', v_start, 'note', coalesce(v_note, 'Loan principal'))
    );
  end if;

  return jsonb_build_object(
    'id', v_loan_id, 'direction', v_direction, 'transfer', v_result
  );
end;
$$;

-- ---------------------------------------------------------------------
-- UPDATE — metadata edits (counterparty, interest, dates, reminders,
-- note). Guard rails: principal is immutable after creation; direction
-- is locked once the loan has recorded activity.
-- ---------------------------------------------------------------------

create or replace function public.fp_update_loan(p_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor      uuid := auth.uid();
  v_family     uuid;
  v_locked     uuid;
  v_existing   public.loans;
  v_direction  text;
  v_counterpart uuid;
  v_name       text;
  v_interest   numeric;
  v_start      text;
  v_due        text;
  v_reminder   text;
  v_note       text;
  v_activity   int;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;
  if not public.fp_is_admin(v_actor) then
    raise exception 'Only a family admin can edit a loan';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;

  select * into v_existing from public.loans where id = p_id for update;
  if v_existing.id is null then
    raise exception 'Loan not found';
  end if;
  if not public.fp_same_family_loan(p_id, v_family) then
    raise exception 'Loan is not in your family';
  end if;

  -- Principal is authoritative once the initial transfer was recorded.
  if p_payload ? 'principal_amount' then
    raise exception 'A loan principal is set when the loan is created';
  end if;

  v_direction := coalesce(lower(p_payload->>'direction'), v_existing.direction::text);
  if v_direction not in ('given', 'taken') then
    raise exception 'Loan direction must be given or taken';
  end if;
  if v_direction <> v_existing.direction::text then
    select count(*) into v_activity
    from public.transactions where linked_loan_id = p_id;
    if v_activity > 0 then
      raise exception 'This loan has recorded activity — its direction can''t change';
    end if;
  end if;

  v_counterpart := coalesce(nullif(p_payload->>'counterparty_user_id', '')::uuid, v_existing.counterparty_user_id);
  v_name := coalesce(
    nullif(btrim(coalesce(p_payload->>'counterparty_name', '')), ''),
    v_existing.counterparty_name
  );
  if v_counterpart is null and v_name is null then
    raise exception 'Pick a family member or type an external name';
  end if;
  if v_counterpart is not null then
    if v_counterpart = v_actor then
      raise exception 'You cannot lend to or borrow from yourself';
    end if;
    if not public.fp_same_family_user(v_counterpart, v_family) then
      raise exception 'Counterparty is not in your family';
    end if;
    v_name := null;
  end if;

  v_interest := (p_payload->>'interest_rate')::numeric;
  if p_payload ? 'interest_rate' then
    if v_interest is not null and (v_interest <= 0 or v_interest > 100) then
      raise exception 'Interest rate must be between 0 and 100 percent';
    end if;
  end if;

  v_start := coalesce(p_payload->>'start_date', to_char(v_existing.start_date, 'YYYY-MM-DD'));
  if v_start !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'A valid start date is required';
  end if;
  if p_payload ? 'due_date' then
    v_due := nullif(p_payload->>'due_date', '');
  else
    v_due := coalesce(to_char(v_existing.due_date, 'YYYY-MM-DD'), null);
  end if;
  if v_due is not null and v_due !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Invalid due date';
  end if;
  if v_due is not null and v_due < v_start then
    raise exception 'Due date cannot be before the start date';
  end if;

  v_reminder := coalesce(lower(p_payload->>'reminder_frequency'), v_existing.reminder_frequency::text);
  if v_reminder not in ('monthly', 'none') then
    raise exception 'Reminder frequency must be monthly or none';
  end if;

  v_note := nullif(btrim(coalesce(p_payload->>'note', '')), '');

  update public.loans
  set direction           = v_direction::public.loan_direction,
      counterparty_user_id = v_counterpart,
      counterparty_name   = v_name,
      interest_rate       = case when p_payload ? 'interest_rate' then v_interest else v_existing.interest_rate end,
      start_date          = v_start::date,
      due_date            = v_due::date,
      reminder_frequency  = v_reminder::public.reminder_frequency,
      note                = case when p_payload ? 'note' then v_note else v_existing.note end
  where id = p_id;

  -- Keep the single external-principal transfer's note in sync (the loan
  -- record and its settlement event describe the same money movement).
  -- Only when the payload actually carries `note` — unrelated edits (rate,
  -- due date, …) must not wipe the recorded principal note.
  if v_counterpart is null and p_payload ? 'note' then
    update public.transactions
    set note = v_note
    where linked_loan_id = p_id
      and kind = 'settlement'
      and type = 'transfer';
  end if;

  return jsonb_build_object('id', p_id, 'direction', v_direction);
end;
$$;

-- ---------------------------------------------------------------------
-- DELETE — pristine loans only. Repayments / interest / write-offs make a
-- loan permanent (their rows reference it); family-member principal
-- transfers are never loan-linked, so they survive as pure transfers.
-- ---------------------------------------------------------------------

create or replace function public.fp_delete_loan(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_family  uuid;
  v_locked  uuid;
  v_block   int;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;
  if not public.fp_is_admin(v_actor) then
    raise exception 'Only a family admin can delete a loan';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;

  select id into v_locked from public.loans where id = p_id for update;
  if v_locked is null then
    raise exception 'Loan not found';
  end if;
  if not public.fp_same_family_loan(p_id, v_family) then
    raise exception 'Loan is not in your family';
  end if;

  select count(*) into v_block
  from public.transactions t
  where t.linked_loan_id = p_id
    and not (t.kind = 'settlement' and t.type = 'transfer');
  if v_block > 0 then
    raise exception 'This loan has % recorded repayment / interest / write-off rows and cannot be deleted',
      v_block;
  end if;

  -- The single external-principal transfer exists only to mark the loan's
  -- start; remove it together with the loan. Family-member transfers are
  -- never linked to the loan and are unaffected.
  delete from public.transactions where linked_loan_id = p_id;
  delete from public.loans where id = p_id;

  return jsonb_build_object('id', p_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Grants — engine entry points only.
-- ---------------------------------------------------------------------

revoke execute on function public.fp_create_loan(jsonb) from public;
revoke execute on function public.fp_update_loan(uuid, jsonb) from public;
revoke execute on function public.fp_delete_loan(uuid) from public;

grant execute on function public.fp_create_loan(jsonb) to authenticated;
grant execute on function public.fp_update_loan(uuid, jsonb) to authenticated;
grant execute on function public.fp_delete_loan(uuid) to authenticated;