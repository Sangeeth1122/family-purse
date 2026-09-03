-- =====================================================================
-- 0010_project_invitations.sql
-- Project invitation system — invite existing family members to projects.
--
-- An invitation is scoped to the family: only family admins or project
-- owners can create invitations; the invitee must already be a family
-- member.  Acceptance is atomic and server-side enforced.
-- =====================================================================

create table if not exists public.project_invitations (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  inviter_id    uuid not null references public.users(id),
  invitee_id    uuid not null references public.users(id),
  role          public.project_role not null,
  status        text not null default 'pending'
                  check (status in ('pending','accepted','cancelled')),
  token         text not null unique,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  accepted_at   timestamptz,
  cancelled_at  timestamptz
);

comment on table  public.project_invitations is 'Pending/accepted/cancelled project invitations for family members';
comment on column public.project_invitations.status is 'pending | accepted | cancelled';

-- Indexes
create index if not exists idx_pi_project   on public.project_invitations(project_id);
create index if not exists idx_pi_invitee   on public.project_invitations(invitee_id);
create index if not exists idx_pi_token     on public.project_invitations(token);
create index if not exists idx_pi_status    on public.project_invitations(project_id, status);

-- =====================================================================
-- RLS policies
-- =====================================================================

-- Family-wide read: anyone in the family can see invitations for family projects.
alter table public.project_invitations enable row level security;

drop policy if exists pi_select_family on public.project_invitations;
create policy pi_select_family on public.project_invitations
  for select using (
    exists (
      select 1 from public.projects p, public.users u
      where p.id = project_invitations.project_id
        and u.id = auth.uid()
        and u.family_id is not null
        and u.family_id = p.family_id
    )
  );

-- Insert: admin or project owner only (enforced in RPC, permissive RLS).
drop policy if exists pi_insert_auth on public.project_invitations;
create policy pi_insert_auth on public.project_invitations
  for insert with check (auth.uid() is not null);

-- Update: admin or project owner only (enforced in RPC, permissive RLS).
drop policy if exists pi_update_auth on public.project_invitations;
create policy pi_update_auth on public.project_invitations
  for update using (auth.uid() is not null);

-- No direct delete — cancelled invitations are retained as audit trail.

-- =====================================================================
-- Helper: does the user already have an active (non-cancelled) membership?
-- =====================================================================

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

-- =====================================================================
-- CREATE INVITATION — family admin or project owner
-- =====================================================================

create or replace function public.fp_create_project_invitation(
  p_project  uuid,
  p_invitee  uuid,
  p_role     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid := auth.uid();
  v_family   uuid;
  v_locked   uuid;
  v_token    text;
  v_inv_id   uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
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

  -- Authorization: admin OR project owner
  if not (public.fp_is_admin(v_actor) or public.fp_is_project_owner(p_project, v_actor)) then
    raise exception 'You must be a family admin or project owner to invite members';
  end if;

  -- Invitee must be in the same family
  if not public.fp_same_family_user(p_invitee, v_family) then
    raise exception 'Invitee is not in your family';
  end if;

  -- Invitee must not already be a member
  if public.fp_is_project_member(p_project, p_invitee) then
    raise exception 'This person is already a project member';
  end if;

  -- Must not have an existing pending invitation for this project+invitee
  if exists (
    select 1 from public.project_invitations pi
    where pi.project_id = p_project
      and pi.invitee_id = p_invitee
      and pi.status = 'pending'
  ) then
    raise exception 'A pending invitation already exists for this person';
  end if;

  -- Validate role
  if p_role not in ('owner','contributor','viewer') then
    raise exception 'Invalid project role';
  end if;

  v_token := encode(extensions.gen_random_bytes(16), 'hex');

  insert into public.project_invitations
    (project_id, inviter_id, invitee_id, role, token, expires_at)
  values
    (p_project, v_actor, p_invitee, p_role::public.project_role, v_token, now() + interval '7 days')
  returning id into v_inv_id;

  return jsonb_build_object(
    'id',     v_inv_id,
    'token',  v_token,
    'role',   p_role,
    'status', 'pending'
  );
end;
$$;

-- =====================================================================
-- ACCEPT INVITATION — the invited family member
-- =====================================================================

create or replace function public.fp_accept_project_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid := auth.uid();
  v_inv      public.project_invitations%rowtype;
  v_family   uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;

  select * into v_inv from public.project_invitations
  where token = p_token;

  if v_inv.id is null then
    raise exception 'Invitation not found';
  end if;

  if v_inv.invitee_id <> v_actor then
    raise exception 'This invitation is not for you';
  end if;

  if v_inv.status = 'accepted' then
    raise exception 'Invitation already accepted';
  end if;

  if v_inv.status = 'cancelled' then
    raise exception 'Invitation has been cancelled';
  end if;

  if v_inv.expires_at < now() then
    raise exception 'Invitation has expired';
  end if;

  -- Validate project still exists and is in the user's family
  if not exists (
    select 1 from public.projects p
    where p.id = v_inv.project_id
      and p.family_id = v_family
  ) then
    raise exception 'Project not found in your family';
  end if;

  if not public.fp_project_is_active(v_inv.project_id) then
    raise exception 'This project is archived';
  end if;

  -- Atomic: mark accepted, add membership
  update public.project_invitations
  set status = 'accepted', accepted_at = now()
  where id = v_inv.id;

  insert into public.project_members (project_id, user_id, role)
  values (v_inv.project_id, v_actor, v_inv.role)
  on conflict (project_id, user_id) do update
    set role = excluded.role;

  return jsonb_build_object(
    'project_id', v_inv.project_id,
    'role',       v_inv.role::text,
    'status',     'accepted'
  );
end;
$$;

-- =====================================================================
-- CANCEL INVITATION — admin or project owner
-- =====================================================================

create or replace function public.fp_cancel_project_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid := auth.uid();
  v_family   uuid;
  v_inv      public.project_invitations%rowtype;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;

  select * into v_inv from public.project_invitations
  where id = p_invitation_id;

  if v_inv.id is null then
    raise exception 'Invitation not found';
  end if;

  if not public.fp_same_family_project(v_inv.project_id, v_family) then
    raise exception 'This invitation is not in your family';
  end if;

  if not (public.fp_is_admin(v_actor) or public.fp_is_project_owner(v_inv.project_id, v_actor)) then
    raise exception 'You must be a family admin or project owner to cancel invitations';
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'Only pending invitations can be cancelled';
  end if;

  update public.project_invitations
  set status = 'cancelled', cancelled_at = now()
  where id = p_invitation_id;

  return jsonb_build_object('id', p_invitation_id, 'status', 'cancelled');
end;
$$;

-- =====================================================================
-- Grants
-- =====================================================================

revoke execute on function public.fp_is_project_owner(uuid, uuid) from public;
revoke execute on function public.fp_create_project_invitation(uuid, uuid, text) from public;
revoke execute on function public.fp_accept_project_invitation(text) from public;
revoke execute on function public.fp_cancel_project_invitation(uuid) from public;

grant execute on function public.fp_create_project_invitation(uuid, uuid, text) to authenticated;
grant execute on function public.fp_accept_project_invitation(text) to authenticated;
grant execute on function public.fp_cancel_project_invitation(uuid) to authenticated;
