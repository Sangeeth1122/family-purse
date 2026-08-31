-- Family Purse — Phase 6 (Family + Admin)
-- Member management (role change / removal with guard rail), category
-- management (reorder / delete + reassignment). Authorization stays with the
-- existing users.role = 'admin' model (Issue 5/8): every RPC is SECURITY
-- DEFINER with explicit admin checks, fixed search_path and authenticated-only
-- grants — exactly like the 0003/0006 engine pattern.

-- =====================================================================
-- CHANGE FAMILY ROLE — promote/demote between admin and member.
-- A family must never lose its last admin.
-- =====================================================================

create or replace function public.fp_change_family_role(p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_family  uuid;
  v_target  uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;
  if not public.fp_is_admin(v_actor) then
    raise exception 'Only a family admin can change member roles';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;

  if coalesce(lower(p_role), '') not in ('admin', 'member') then
    raise exception 'Invalid family role';
  end if;

  select id into v_target
  from public.users
  where id = p_user_id and family_id = v_family;
  if v_target is null then
    raise exception 'User is not in your family';
  end if;

  -- Never leave the family without an admin (Issue 7: owners are admins, but
  -- families are managed by role — at least one admin must always remain).
  if coalesce(lower(p_role), '') = 'member' and exists (
    select 1
    from public.users u1
    where u1.family_id = v_family and u1.role = 'admin' and u1.id <> p_user_id
    having count(*) = 0
  ) then
    raise exception 'Family must keep at least one admin';
  end if;

  update public.users
  set role = lower(p_role)::public.user_role
  where id = p_user_id;

  return jsonb_build_object('id', p_user_id, 'role', lower(p_role));
end;
$$;

-- =====================================================================
-- REMOVE MEMBER — admin only. The member leaves the family (family_id =
-- null) and loses all project memberships in the family, so no orphaned
-- or dangling relationships remain. Their user profile, personal ledger
-- rows, cards and loan history stay intact (contract: never hard-delete
-- users; open balances with a removed member become read-only). Open
-- balances are surfaced by the client guard rail before this is called.
-- =====================================================================

create or replace function public.fp_remove_member(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid := auth.uid();
  v_family   uuid;
  v_target   uuid;
  v_is_admin boolean;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;
  if not public.fp_is_admin(v_actor) then
    raise exception 'Only a family admin can remove members';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;

  if p_user_id = v_actor then
    raise exception 'You cannot remove yourself';
  end if;

  select id, role = 'admin' into v_target, v_is_admin
  from public.users
  where id = p_user_id and family_id = v_family;
  if v_target is null then
    raise exception 'User is not in your family';
  end if;

  if v_is_admin and not exists (
    select 1 from public.users u1
    where u1.family_id = v_family and u1.role = 'admin' and u1.id <> p_user_id
  ) then
    raise exception 'Family must keep at least one admin';
  end if;

  -- Leave the family.
  update public.users
  set family_id = null
  where id = p_user_id;

  -- Drop project memberships inside the family (no dangling cross-family
  -- project access after leaving).
  delete from public.project_members pm
  using public.projects p
  where pm.user_id = p_user_id and p.id = pm.project_id and p.family_id = v_family;

  return jsonb_build_object('id', p_user_id, 'removed', true);
end;
$$;

-- =====================================================================
-- REORDER CATEGORIES — full-set atomic replace of the family category
-- order (Issue 6: sort_order is what categories sort by everywhere).
-- System categories are excluded; they keep their trailing positions.
-- =====================================================================

create or replace function public.fp_reorder_categories(p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_family  uuid;
  v_expected int;
  v_unique  int;
  v_n       int := 0;
  v_row     jsonb;
  v_id      uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;
  if not public.fp_is_admin(v_actor) then
    raise exception 'Only a family admin can manage categories';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;

  if jsonb_typeof(p_order) <> 'array' then
    raise exception 'Expected a category list';
  end if;

  select count(*) into v_expected
  from public.categories c
  where c.family_id = v_family and c.system = false;

  if jsonb_array_length(p_order) <> v_expected then
    raise exception 'Category list must include every family category';
  end if;

  for v_row in select value from jsonb_array_elements(p_order) m
  loop
    v_id := (v_row->>'id')::uuid;
    if not exists (
      select 1 from public.categories c
      where c.id = v_id and c.family_id = v_family and c.system = false
    ) then
      raise exception 'Category is not in your family';
    end if;
  end loop;

  select count(*) into v_unique
  from (
    select distinct (m->>'id')::uuid
    from jsonb_array_elements(p_order) m
  ) d;
  if v_unique <> jsonb_array_length(p_order) then
    raise exception 'Duplicate categories';
  end if;

  for v_row in select value from jsonb_array_elements(p_order) m
  loop
    update public.categories set sort_order = v_n
    where id = (v_row->>'id')::uuid;
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('reordered', v_n);
end;
$$;

-- =====================================================================
-- DELETE CATEGORY — admin only, with the contract's reassignment guard:
-- any P&L transaction using the category must first be bulk-reassigned to
-- a replacement family category. Budgets for the category cascade. System
-- categories are permanent (loan/interest flows depend on them).
-- =====================================================================

create or replace function public.fp_delete_category(p_category uuid, p_reassign_to uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor     uuid := auth.uid();
  v_family    uuid;
  v_locked    uuid;
  v_is_system boolean;
  v_tagged    int;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;
  if not public.fp_is_admin(v_actor) then
    raise exception 'Only a family admin can manage categories';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;

  select id, system into v_locked, v_is_system
  from public.categories
  where id = p_category and family_id = v_family;
  if v_locked is null then
    raise exception 'Category not found';
  end if;
  if v_is_system then
    raise exception 'System categories cannot be deleted';
  end if;

  select count(*) into v_tagged
  from public.transactions t
  where t.kind = 'pl' and t.category_id = p_category;

  if v_tagged > 0 then
    if p_reassign_to is null then
      raise exception 'Choose a replacement category to reassign transactions first';
    end if;
    if p_reassign_to = p_category then
      raise exception 'Pick a different category to reassign to';
    end if;
    if not exists (
      select 1 from public.categories c
      where c.id = p_reassign_to and c.family_id = v_family
    ) then
      raise exception 'Category is not in your family';
    end if;

    update public.transactions
    set category_id = p_reassign_to
    where kind = 'pl' and category_id = p_category;
  end if;

  delete from public.categories where id = p_category;

  return jsonb_build_object('id', p_category, 'reassigned', v_tagged);
end;
$$;

-- =====================================================================
-- Grants — entry points to authenticated; helpers stay private.
-- =====================================================================

revoke execute on function public.fp_change_family_role(uuid, text) from public;
revoke execute on function public.fp_remove_member(uuid) from public;
revoke execute on function public.fp_reorder_categories(jsonb) from public;
revoke execute on function public.fp_delete_category(uuid, uuid) from public;

grant execute on function public.fp_change_family_role(uuid, text) to authenticated;
grant execute on function public.fp_remove_member(uuid) to authenticated;
grant execute on function public.fp_reorder_categories(jsonb) to authenticated;
grant execute on function public.fp_delete_category(uuid, uuid) to authenticated;