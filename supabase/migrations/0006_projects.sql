-- =====================================================================
-- 0006_projects.sql
-- Phase 5 — Project lifecycle engine (create / edit / membership / delete).
--
-- Screen 15 (create project) carries an optional "Target date", so the
-- projects row gains a nullable `target_date` column (0002 seed is frozen —
-- existing projects get NULL).
--
-- Project writes flow through SECURITY DEFINER RPCs so the contract's role
-- rules are enforced in one audited place, mirroring the Phase-1 RLS:
--   * Create / metadata edit / delete     -> family admin only (frozen
--     projects_insert / update / delete policies are admin-only).
--   * Member management (set)             -> family admin OR project owner
--     (frozen project_members insert/update/delete policies grant owners).
--   * Every member must be in the actor's family; the creator is always the
--     project owner and must appear in the initial member set; the member
--     set must retain at least one owner.
--   * A project with recorded P&L transactions cannot be deleted (its rows
--     live in transactions and would otherwise be orphaned).
--
-- Reads keep using the frozen RLS (family-wide visibility). Project P&L is
-- still logged through the Phase-2 engine (pg 0003) — no parallel system.
-- =====================================================================

alter table public.projects
  add column if not exists target_date date;

comment on column public.projects.target_date
  is 'Optional target / completion date for a project';

-- project_members_select in 0001 self-references project_members, which
-- PostgreSQL rejects ("infinite recursion detected in policy") on any real
-- read of the table. Replace it with an equivalent, non-recursive family-based
-- definition: project memberships are family-wide, exactly like projects.
drop policy project_members_select on public.project_members;
create policy project_members_select on public.project_members
  for select using (
    is_family_admin(auth.uid())
    or exists (
      select 1 from public.projects p, public.users u
      where p.id = project_members.project_id
        and u.id = auth.uid()
        and u.family_id is not null
        and u.family_id = p.family_id
    )
  );

-- ---------------------------------------------------------------------
-- Internal helper — is the user a project owner?
-- ---------------------------------------------------------------------

create or replace function public.fp_is_project_owner(p_project uuid, p_user uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project and pm.user_id = p_user and pm.role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------
-- CREATE — admin only. Requires the creator to be an owner in the member
-- set; every member must belong to the actor's family; roles are unique
-- and from the project_role enum.
-- ---------------------------------------------------------------------

create or replace function public.fp_create_project(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid := auth.uid();
  v_family   uuid;
  v_name     text;
  v_budget   numeric(10, 2);
  v_target   text;
  v_members  jsonb;
  v_unique   int;
  v_proj_id  uuid;
  v_row      jsonb;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;
  if not public.fp_is_admin(v_actor) then
    raise exception 'Only a family admin can create a project';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;

  v_name := nullif(btrim(coalesce(p_payload->>'name', '')), '');
  if v_name is null then
    raise exception 'Project name is required';
  end if;
  if length(v_name) > 80 then
    raise exception 'Project name is too long';
  end if;

  if p_payload ? 'budget' then
    v_budget := (p_payload->>'budget')::numeric(10, 2);
    if v_budget is not null and (v_budget <= 0 or v_budget > 100000000) then
      raise exception 'Budget must be a positive amount';
    end if;
  end if;

  v_target := nullif(p_payload->>'target_date', '');
  if v_target is not null and v_target !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Invalid target date';
  end if;

  v_members := p_payload->'members';
  if jsonb_typeof(v_members) <> 'array' or jsonb_array_length(v_members) = 0 then
    raise exception 'Pick at least yourself as the project owner';
  end if;

  -- The creator must remain an owner of the project.
  if not exists (
    select 1 from jsonb_array_elements(v_members) m
    where (m->>'user_id')::uuid = v_actor and coalesce(m->>'role', '') = 'owner'
  ) then
    raise exception 'You must be included as the project owner';
  end if;

  for v_row in select value from jsonb_array_elements(v_members) m
  loop
    if not exists (select 1 from public.users u where u.id = (v_row->>'user_id')::uuid) then
      raise exception 'Unknown member';
    end if;
    if not public.fp_same_family_user((v_row->>'user_id')::uuid, v_family) then
      raise exception 'Member is not in your family';
    end if;
    if coalesce(v_row->>'role', '') not in ('owner', 'contributor', 'viewer') then
      raise exception 'Invalid project role';
    end if;
  end loop;

  select count(*) into v_unique
  from (
    select distinct (m->>'user_id')::uuid
    from jsonb_array_elements(v_members) m
  ) d;
  if v_unique <> jsonb_array_length(v_members) then
    raise exception 'Duplicate members';
  end if;

  insert into public.projects (family_id, name, created_by, status, budget, target_date)
  values (v_family, v_name, v_actor, 'active', v_budget, v_target::date)
  returning id into v_proj_id;

  insert into public.project_members (project_id, user_id, role)
  select v_proj_id, (m->>'user_id')::uuid, (m->>'role')::public.project_role
  from jsonb_array_elements(v_members) m;

  return jsonb_build_object('id', v_proj_id);
end;
$$;

-- ---------------------------------------------------------------------
-- UPDATE — metadata only, family admin only. name / budget (nullable) /
-- target_date (nullable) / status. Membership changes use a separate RPC
-- so an owner (who is not a family admin) can manage their team without
-- gaining metadata powers.
-- ---------------------------------------------------------------------

create or replace function public.fp_update_project(p_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_family  uuid;
  v_locked  uuid;
  v_status_now text;
  v_name    text;
  v_budget  numeric(10, 2);
  v_target  text;
  v_status  text;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;
  if not public.fp_is_admin(v_actor) then
    raise exception 'Only a family admin can edit a project';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;

  select id, status::text into v_locked, v_status_now from public.projects where id = p_id for update;
  if v_locked is null then
    raise exception 'Project not found';
  end if;
  if not public.fp_same_family_project(p_id, v_family) then
    raise exception 'Project is not in your family';
  end if;

  v_name := nullif(btrim(coalesce(p_payload->>'name', '')), '');
  if p_payload ? 'name' then
    if v_name is null then
      raise exception 'Project name is required';
    end if;
    if length(v_name) > 80 then
      raise exception 'Project name is too long';
    end if;
  end if;

  if p_payload ? 'budget' then
    v_budget := (p_payload->>'budget')::numeric(10, 2);
    if v_budget is not null and (v_budget <= 0 or v_budget > 100000000) then
      raise exception 'Budget must be a positive amount';
    end if;
  end if;

  v_target := nullif(p_payload->>'target_date', '');
  if p_payload ? 'target_date' and v_target is not null
     and v_target !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Invalid target date';
  end if;

  v_status := lower(p_payload->>'status');
  if p_payload ? 'status' and v_status not in ('active', 'archived') then
    raise exception 'Project status must be active or archived';
  end if;

  -- An archived project is read-only: the only metadata write allowed while
  -- archived is the restore transition back to active.
  if v_status_now = 'archived'
     and not (p_payload ? 'status' and v_status = 'active') then
    raise exception 'Archived projects are read-only';
  end if;

  update public.projects
  set name       = case when p_payload ? 'name' then v_name else name end,
      budget     = case when p_payload ? 'budget' then v_budget else budget end,
      target_date = case when p_payload ? 'target_date' then v_target::date else target_date end,
      status     = case when p_payload ? 'status' then v_status::public.project_status else status end
  where id = p_id;

  return jsonb_build_object('id', p_id);
end;
$$;

-- ---------------------------------------------------------------------
-- SET MEMBERS — replace the project's membership atomically. Allowed for a
-- family admin OR the project owner; every member must be in the family;
-- the resulting set must keep at least one owner.
-- ---------------------------------------------------------------------

create or replace function public.fp_set_project_members(p_project uuid, p_members jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_family  uuid;
  v_locked  uuid;
  v_has     boolean;
  v_unique  int;
  v_row     jsonb;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;
  if not (public.fp_is_admin(v_actor) or public.fp_is_project_owner(p_project, v_actor)) then
    raise exception 'You must be a family admin or project owner to manage members';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;

  select id into v_locked from public.projects where id = p_project for update;
  if v_locked is null then
    raise exception 'Project not found';
  end if;
  if not public.fp_same_family_project(p_project, v_family) then
    raise exception 'Project is not in your family';
  end if;
  if not public.fp_project_is_active(p_project) then
    raise exception 'Archived projects are read-only';
  end if;

  if jsonb_typeof(p_members) <> 'array' then
    raise exception 'Expected a member list';
  end if;

  for v_row in select value from jsonb_array_elements(p_members) m
  loop
    if not exists (select 1 from public.users u where u.id = (v_row->>'user_id')::uuid) then
      raise exception 'Unknown member';
    end if;
    if not public.fp_same_family_user((v_row->>'user_id')::uuid, v_family) then
      raise exception 'Member is not in your family';
    end if;
    if coalesce(v_row->>'role', '') not in ('owner', 'contributor', 'viewer') then
      raise exception 'Invalid project role';
    end if;
  end loop;

  select count(*) into v_unique
  from (
    select distinct (m->>'user_id')::uuid
    from jsonb_array_elements(p_members) m
  ) d;
  if v_unique <> jsonb_array_length(p_members) then
    raise exception 'Duplicate members';
  end if;

  select exists (
    select 1 from jsonb_array_elements(p_members) m where coalesce(m->>'role', '') = 'owner'
  ) into v_has;
  if not v_has then
    raise exception 'A project must retain at least one owner';
  end if;

  delete from public.project_members where project_id = p_project;

  insert into public.project_members (project_id, user_id, role)
  select p_project, (m->>'user_id')::uuid, (m->>'role')::public.project_role
  from jsonb_array_elements(p_members) m;

  return jsonb_build_object('project', p_project, 'members', jsonb_array_length(p_members));
end;
$$;

-- ---------------------------------------------------------------------
-- DELETE — family admin only. A project that already has recorded P&L
-- transactions cannot be deleted (its rows live in transactions with no FK
-- back to projects); archive it instead to keep the history as the audit
-- trail. Memberships cascade with the project row.
-- ---------------------------------------------------------------------

create or replace function public.fp_delete_project(p_id uuid)
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
    raise exception 'Only a family admin can delete a project';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;

  select id into v_locked from public.projects where id = p_id for update;
  if v_locked is null then
    raise exception 'Project not found';
  end if;
  if not public.fp_same_family_project(p_id, v_family) then
    raise exception 'Project is not in your family';
  end if;

  select count(*) into v_block
  from public.transactions t
  where t.scope_type = 'project' and t.scope_id = p_id;
  if v_block > 0 then
    raise exception 'This project has % recorded transaction(s) and cannot be deleted — archive it instead', v_block;
  end if;

  delete from public.project_members where project_id = p_id;
  delete from public.projects where id = p_id;

  return jsonb_build_object('id', p_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Grants — engine entry points only.
-- ---------------------------------------------------------------------

revoke execute on function public.fp_is_project_owner(uuid, uuid) from public;
revoke execute on function public.fp_create_project(jsonb) from public;
revoke execute on function public.fp_update_project(uuid, jsonb) from public;
revoke execute on function public.fp_set_project_members(uuid, jsonb) from public;
revoke execute on function public.fp_delete_project(uuid) from public;

grant execute on function public.fp_create_project(jsonb) to authenticated;
grant execute on function public.fp_update_project(uuid, jsonb) to authenticated;
grant execute on function public.fp_set_project_members(uuid, jsonb) to authenticated;
grant execute on function public.fp_delete_project(uuid) to authenticated;