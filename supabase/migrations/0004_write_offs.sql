-- =====================================================================
-- 0004_write_offs.sql
-- Phase 3 — Write-off engine (Cards & Loans).
--
-- A write-off zeroes a derived balance WITHOUT creating a payment. It is
-- represented as a single, auditable P&L adjustment row on the existing
-- `transactions` table (no schema change) so the account record is
-- complete and reversible-looking for audit:
--
--   * Card write-off       -> P&L expense  (Balance Write-off category)
--                            on the card, spent_through = 'manual'.
--   * Loan GIVEN write-off -> P&L expense  (loss: the money won't come back).
--   * Loan TAKEN write-off -> P&L revenue  (income: the debt was forgiven).
--
-- The Balance Write-off system category (seed) is the write-off marker. The
-- app-side balance formulas (lib/balances.ts) subtract EXACTLY rows carrying
-- that category, never the generic disbursement / interest / spend rows.
--
-- In every case the mandatory remark is stored in `note`, the actor is
-- recorded in `created_by`, and the linked card/loan keeps the row findable
-- in that entity's own ledger. The app-side balance formulas
-- (lib/balances.ts) subtract exactly these write-off rows from the derived
-- outstanding so the balance clears while no settlement/payment exists.
--
-- These invariants are all re-enforced here regardless of the UI:
--   * Family admin only.
--   * Remark required (non-empty, trimmed).
--   * Only a positive outstanding can be written off.
--   * Concurrency-safe via row locks (two admins can't double write-off).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Internal helper — the family's 'Balance Write-off' system category.
-- Owner-only; NOT exposed via PostgREST.
-- ---------------------------------------------------------------------

create or replace function public.fp_write_off_category(p_family uuid)
returns uuid
language sql
stable
set search_path = public
as $$
  select c.id
  from public.categories c
  where c.family_id = p_family
    and c.system
    and c.name = 'Balance Write-off'
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- Card write-off — clears the card's derived outstanding.
-- ---------------------------------------------------------------------

create or replace function public.fp_write_off_card(p_card_id uuid, p_remark text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_family  uuid;
  v_owner   uuid;
  v_cat     uuid;
  v_locked  uuid;
  v_balance numeric;
  v_id      uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;
  if not public.fp_is_admin(v_actor) then
    raise exception 'Only a family admin can write off a balance';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;
  if not public.fp_same_family_card(p_card_id, v_family) then
    raise exception 'Card is not in your family';
  end if;

  if nullif(trim(coalesce(p_remark, '')), '') is null then
    raise exception 'A remark is required for a write-off';
  end if;

  -- Serialize write-offs per card.
  select id into v_locked from public.credit_cards where id = p_card_id for update;
  if v_locked is null then
    raise exception 'Card not found';
  end if;

  v_cat := public.fp_write_off_category(v_family);
  if v_cat is null then
    raise exception 'The Balance Write-off category is missing from your family';
  end if;

  -- The written-off interest / remaining amount must match the app formula
  -- (lib/balances.ts): write-offs are P&L expenses in the Balance Write-off
  -- category on the card, spent_through 'manual'.
  v_balance := (
    select coalesce(sum(case
      when t.kind = 'pl' and t.type = 'expense' and t.spent_through = 'manual'
           and t.category_id = v_cat then -t.amount
      when t.kind = 'pl' and t.type in ('expense', 'interest_expense') then t.amount
      when t.kind = 'settlement' and t.type = 'card_payment' then -t.amount
      else 0
    end), 0)
    from public.transactions t
    where t.card_id = p_card_id
  );

  if v_balance <= 0 then
    raise exception 'Nothing to write off — this card has no outstanding balance';
  end if;

  select user_id into v_owner from public.credit_cards where id = p_card_id;

  insert into public.transactions
    (kind, type, scope_type, scope_id, amount, category_id, spent_through, card_id,
     date, note, created_by, counterparty_user_id, linked_loan_id, transfer_group_id)
  values
    ('pl', 'expense', 'personal', v_owner, v_balance, v_cat, 'manual', p_card_id,
     current_date, trim(p_remark), v_actor, null, null, null)
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id, 'kind', 'pl', 'type', 'expense', 'amount', v_balance
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Loan write-off — clears the loan's derived balance.
--   direction = 'given' -> P&L expense (loss)
--   direction = 'taken' -> P&L revenue (forgiven debt)
-- ---------------------------------------------------------------------

create or replace function public.fp_write_off_loan(p_loan_id uuid, p_remark text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor     uuid := auth.uid();
  v_family    uuid;
  v_cat       uuid;
  v_locked    uuid;
  v_direction public.loan_direction;
  v_principal numeric;
  v_paid      numeric;
  v_balance   numeric;
  v_type      public.transaction_type;
  v_id        uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;
  if not public.fp_is_admin(v_actor) then
    raise exception 'Only a family admin can write off a balance';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;
  if not public.fp_same_family_loan(p_loan_id, v_family) then
    raise exception 'Loan is not in your family';
  end if;

  if nullif(trim(coalesce(p_remark, '')), '') is null then
    raise exception 'A remark is required for a write-off';
  end if;

  -- Serialize write-offs per loan.
  select id into v_locked from public.loans where id = p_loan_id for update;
  if v_locked is null then
    raise exception 'Loan not found';
  end if;

  select direction, principal_amount into v_direction, v_principal
  from public.loans where id = p_loan_id;

  v_cat := public.fp_write_off_category(v_family);
  if v_cat is null then
    raise exception 'The Balance Write-off category is missing from your family';
  end if;

  -- Outstanding must match the app formula (lib/balances.ts): principal less
  -- loan_repayment settlements less Balance Write-off P&L adjustments.
  -- The category discriminator is essential — generic loan expenses and the
  -- disbursement itself are also PLAIN P&L rows linked to the loan.
  v_paid := (
    select coalesce(sum(case
      when t.kind = 'settlement' and t.type = 'loan_repayment' then t.amount
      when t.kind = 'pl' and t.type in ('expense', 'revenue')
           and t.category_id = v_cat then t.amount
      else 0
    end), 0)
    from public.transactions t
    where t.linked_loan_id = p_loan_id
  );

  v_balance := v_principal - v_paid;

  if v_balance <= 0 then
    raise exception 'Nothing to write off — this loan has no outstanding balance';
  end if;

  v_type := case when v_direction = 'given' then 'expense' else 'revenue' end;

  insert into public.transactions
    (kind, type, scope_type, scope_id, amount, category_id, spent_through, card_id,
     date, note, created_by, counterparty_user_id, linked_loan_id, transfer_group_id)
  values
    ('pl', v_type, 'personal', v_actor, v_balance, v_cat,
     case when v_type = 'expense' then 'manual'::public.spent_through else null end, null,
     current_date, trim(p_remark), v_actor, null, p_loan_id, null)
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id, 'kind', 'pl', 'type', v_type, 'amount', v_balance
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Grants — engine entry points only; helpers stay owner-only.
-- ---------------------------------------------------------------------

revoke execute on function public.fp_write_off_category(uuid) from public;
revoke execute on function public.fp_write_off_card(uuid, text) from public;
revoke execute on function public.fp_write_off_loan(uuid, text) from public;

grant execute on function public.fp_write_off_card(uuid, text) to authenticated;
grant execute on function public.fp_write_off_loan(uuid, text) to authenticated;