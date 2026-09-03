-- Budget Management System v2
-- Replaces category-level budgets with proper Budget entities + Category Allocations

-- Rename existing budgets table to budgets_legacy to preserve data
-- First drop indexes on the old table that will conflict
drop index if exists public.budgets_unique_monthly;
drop index if exists public.budgets_unique_one_time;
drop index if exists public.budgets_unique_custom;
alter table public.budgets rename to budgets_legacy;

create type public.budget_type as enum ('monthly', 'project');

create table public.budgets (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  name          text not null,
  type          public.budget_type not null,
  total_amount  numeric(12, 2) not null check (total_amount > 0),
  start_date    date not null,
  end_date      date not null check (end_date >= start_date),
  project_id    uuid references public.projects(id) on delete set null,
  created_by    uuid not null references public.users(id) on delete restrict,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_budgets_family on public.budgets(family_id);
create index idx_budgets_project on public.budgets(project_id);
create index idx_budgets_active on public.budgets(active);

-- Monthly budgets: one active per family per month
create unique index budgets_unique_monthly
  on public.budgets(family_id, start_date, end_date)
  where type = 'monthly' and active = true;

-- Project budgets: no overlapping for same project (active only)
create unique index budgets_unique_project
  on public.budgets(project_id, start_date, end_date)
  where type = 'project' and project_id is not null and active = true;

create table public.budget_category_allocations (
  id            uuid primary key default gen_random_uuid(),
  budget_id     uuid not null references public.budgets(id) on delete cascade,
  category_id   uuid not null references public.categories(id) on delete cascade,
  amount        numeric(12, 2) not null check (amount > 0),
  created_at    timestamptz not null default now(),
  constraint budget_category_unique unique (budget_id, category_id)
);

create index idx_budget_alloc_budget on public.budget_category_allocations(budget_id);
create index idx_budget_alloc_category on public.budget_category_allocations(category_id);

alter table public.budgets enable row level security;
alter table public.budget_category_allocations enable row level security;

-- Budgets: family-scoped access
create policy budgets_select on public.budgets
  for select using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.family_id = budgets.family_id
    )
  );

create policy budgets_insert on public.budgets
  for insert with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.family_id = budgets.family_id
      and u.role = 'admin'
    )
  );

create policy budgets_update on public.budgets
  for update using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.family_id = budgets.family_id
      and u.role = 'admin'
    )
  ) with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.family_id = budgets.family_id
      and u.role = 'admin'
    )
  );

-- No delete policy - use active flag instead

-- Budget Category Allocations: family-scoped via budget
create policy budget_allocs_select on public.budget_category_allocations
  for select using (
    exists (
      select 1 from public.budgets b
      join public.users u on u.family_id = b.family_id
      where b.id = budget_category_allocations.budget_id
        and u.id = auth.uid()
    )
  );

create policy budget_allocs_insert on public.budget_category_allocations
  for insert with check (
    exists (
      select 1 from public.budgets b
      join public.users u on u.family_id = b.family_id
      where b.id = budget_category_allocations.budget_id
        and u.id = auth.uid()
        and u.role = 'admin'
    )
  );

create policy budget_allocs_update on public.budget_category_allocations
  for update using (
    exists (
      select 1 from public.budgets b
      join public.users u on u.family_id = b.family_id
      where b.id = budget_category_allocations.budget_id
        and u.id = auth.uid()
        and u.role = 'admin'
    )
  ) with check (
    exists (
      select 1 from public.budgets b
      join public.users u on u.family_id = b.family_id
      where b.id = budget_category_allocations.budget_id
        and u.id = auth.uid()
        and u.role = 'admin'
    )
  );

-- =====================================================================
-- RPCs for Budget Management
-- =====================================================================

-- Create budget (monthly or project)
create or replace function public.fp_create_budget(
  p_name text,
  p_type public.budget_type,
  p_total_amount numeric,
  p_start_date date,
  p_end_date date,
  p_project_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_family uuid;
  v_budget_id uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if not public.fp_is_admin(v_actor) then
    raise exception 'Only a family admin can create budgets';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;

  -- Validate type-specific rules
  if p_type = 'monthly' then
    if p_project_id is not null then
      raise exception 'Monthly budgets cannot have a project';
    end if;
    -- Ensure month boundaries
    if p_start_date <> date_trunc('month', p_start_date)::date then
      raise exception 'Monthly budget start date must be first day of month';
    end if;
    if p_end_date <> (date_trunc('month', p_start_date) + interval '1 month - 1 day')::date then
      raise exception 'Monthly budget end date must be last day of month';
    end if;
    -- Check for existing monthly budget for this month
    if exists (
      select 1 from public.budgets
      where family_id = v_family
        and type = 'monthly'
        and start_date = p_start_date
        and end_date = p_end_date
    ) then
      raise exception 'A monthly budget already exists for this month';
    end if;
  elsif p_type = 'project' then
    if p_project_id is null then
      raise exception 'Project budget requires a project';
    end if;
    -- Verify project belongs to this family
    if not exists (
      select 1 from public.projects
      where id = p_project_id and family_id = v_family
    ) then
      raise exception 'Project not found in your family';
    end if;
    -- Check for overlapping project budget
    if exists (
      select 1 from public.budgets
      where project_id = p_project_id
        and not (p_end_date < start_date or p_start_date > end_date)
    ) then
      raise exception 'Project budget overlaps with an existing budget for this project';
    end if;
  end if;

  insert into public.budgets (family_id, name, type, total_amount, start_date, end_date, project_id, created_by)
  values (v_family, trim(p_name), p_type, p_total_amount, p_start_date, p_end_date, p_project_id, v_actor)
  returning id into v_budget_id;

  return v_budget_id;
end;
$$;

grant execute on function public.fp_create_budget(text, public.budget_type, numeric, date, date, uuid) to authenticated;
revoke execute on function public.fp_create_budget(text, public.budget_type, numeric, date, date, uuid) from public;

-- Add category allocation to budget
create or replace function public.fp_add_budget_allocation(
  p_budget_id uuid,
  p_category_id uuid,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_family uuid;
  v_budget_family uuid;
  v_category_family uuid;
  v_alloc_id uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if not public.fp_is_admin(v_actor) then
    raise exception 'Only a family admin can manage budget allocations';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;

  -- Verify budget belongs to this family
  select family_id into v_budget_family
  from public.budgets
  where id = p_budget_id;
  if v_budget_family is null then
    raise exception 'Budget not found';
  end if;
  if v_budget_family <> v_family then
    raise exception 'Budget not in your family';
  end if;

  -- Verify category belongs to this family (or is system)
  select family_id into v_category_family
  from public.categories
  where id = p_category_id;
  if v_category_family is null then
    raise exception 'Category not found';
  end if;
  if v_category_family <> v_family and v_category_family is not null then
    raise exception 'Category not in your family';
  end if;

  insert into public.budget_category_allocations (budget_id, category_id, amount)
  values (p_budget_id, p_category_id, p_amount)
  returning id into v_alloc_id;

  return v_alloc_id;
end;
$$;

grant execute on function public.fp_add_budget_allocation(uuid, uuid, numeric) to authenticated;
revoke execute on function public.fp_add_budget_allocation(uuid, uuid, numeric) from public;

-- Update budget allocation
create or replace function public.fp_update_budget_allocation(
  p_allocation_id uuid,
  p_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_family uuid;
  v_budget_family uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if not public.fp_is_admin(v_actor) then
    raise exception 'Only a family admin can manage budget allocations';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;

  -- Verify budget belongs to this family
  select b.family_id into v_budget_family
  from public.budget_category_allocations a
  join public.budgets b on b.id = a.budget_id
  where a.id = p_allocation_id;
  if v_budget_family is null then
    raise exception 'Allocation not found';
  end if;
  if v_budget_family <> v_family then
    raise exception 'Budget not in your family';
  end if;

  update public.budget_category_allocations
  set amount = p_amount
  where id = p_allocation_id;
end;
$$;

grant execute on function public.fp_update_budget_allocation(uuid, numeric) to authenticated;
revoke execute on function public.fp_update_budget_allocation(uuid, numeric) from public;

-- Remove budget allocation
create or replace function public.fp_remove_budget_allocation(
  p_allocation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_family uuid;
  v_budget_family uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if not public.fp_is_admin(v_actor) then
    raise exception 'Only a family admin can manage budget allocations';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;

  select b.family_id into v_budget_family
  from public.budget_category_allocations a
  join public.budgets b on b.id = a.budget_id
  where a.id = p_allocation_id;
  if v_budget_family is null then
    raise exception 'Allocation not found';
  end if;
  if v_budget_family <> v_family then
    raise exception 'Budget not in your family';
  end if;

  delete from public.budget_category_allocations where id = p_allocation_id;
end;
$$;

grant execute on function public.fp_remove_budget_allocation(uuid) to authenticated;
revoke execute on function public.fp_remove_budget_allocation(uuid) from public;

-- Update budget (name, dates, total_amount, active)
create or replace function public.fp_update_budget(
  p_budget_id uuid,
  p_name text default null,
  p_total_amount numeric default null,
  p_start_date date default null,
  p_end_date date default null,
  p_active boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_family uuid;
  v_budget_family uuid;
  v_budget_type public.budget_type;
  v_budget_project_id uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if not public.fp_is_admin(v_actor) then
    raise exception 'Only a family admin can update budgets';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;

  select family_id, type, project_id into v_budget_family, v_budget_type, v_budget_project_id
  from public.budgets
  where id = p_budget_id;
  if v_budget_family is null then
    raise exception 'Budget not found';
  end if;
  if v_budget_family <> v_family then
    raise exception 'Budget not in your family';
  end if;

  -- Validate date changes for monthly budgets
  if p_start_date is not null or p_end_date is not null then
    if v_budget_type = 'monthly' then
      raise exception 'Monthly budget dates cannot be changed';
    end if;
    if v_budget_type = 'project' then
      -- Check for overlap with other budgets for same project
      if exists (
        select 1 from public.budgets
        where project_id = v_budget_project_id
          and id <> p_budget_id
          and not (
            coalesce(p_end_date, end_date) < start_date
            or coalesce(p_start_date, start_date) > end_date
          )
      ) then
        raise exception 'Project budget would overlap with another budget for this project';
      end if;
    end if;
  end if;

  update public.budgets
  set name = coalesce(p_name, name),
      total_amount = coalesce(p_total_amount, total_amount),
      start_date = coalesce(p_start_date, start_date),
      end_date = coalesce(p_end_date, end_date),
      active = coalesce(p_active, active),
      updated_at = now()
  where id = p_budget_id;
end;
$$;

grant execute on function public.fp_update_budget(uuid, text, numeric, date, date, boolean) to authenticated;
revoke execute on function public.fp_update_budget(uuid, text, numeric, date, date, boolean) from public;

-- Deactivate/Reactivate budget
create or replace function public.fp_set_budget_active(
  p_budget_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_family uuid;
  v_budget_family uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if not public.fp_is_admin(v_actor) then
    raise exception 'Only a family admin can deactivate/reactivate budgets';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;

  select family_id into v_budget_family
  from public.budgets
  where id = p_budget_id;
  if v_budget_family is null then
    raise exception 'Budget not found';
  end if;
  if v_budget_family <> v_family then
    raise exception 'Budget not in your family';
  end if;

  update public.budgets
  set active = p_active,
      updated_at = now()
  where id = p_budget_id;
end;
$$;

grant execute on function public.fp_set_budget_active(uuid, boolean) to authenticated;
revoke execute on function public.fp_set_budget_active(uuid, boolean) from public;

-- Get budget with allocations and spending
create or replace function public.fp_get_budget_detail(
  p_budget_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_family uuid;
  v_budget_family uuid;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;

  select b.family_id into v_budget_family
  from public.budgets b
  where b.id = p_budget_id;
  if v_budget_family is null then
    raise exception 'Budget not found';
  end if;
  if v_budget_family <> v_family then
    raise exception 'Budget not in your family';
  end if;

  -- Build budget detail with allocations and spending
  select jsonb_build_object(
    'budget', to_jsonb(b),
    'allocations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'category_id', a.category_id,
          'amount', a.amount,
          'category_name', c.name,
          'category_color', c.color,
          'spent', coalesce(sp.spent, 0)
        )
      )
      from public.budget_category_allocations a
      join public.categories c on c.id = a.category_id
      left join (
        select t.category_id, sum(t.amount) as spent
        from public.transactions t
        where t.kind = 'pl'
          and t.type in ('expense', 'interest_expense')
          and t.category_id is not null
          and t.date >= b.start_date
          and t.date <= b.end_date
          and (
            (b.type = 'monthly' and t.scope_type = 'personal' and t.scope_id in (
              select u.id from public.users u where u.family_id = b.family_id
            ))
            or (b.type = 'project' and t.scope_type = 'project' and t.scope_id = b.project_id)
          )
        group by t.category_id
      ) sp on sp.category_id = a.category_id
    ), '[]'::jsonb),
    'total_spent', coalesce((
      select sum(t.amount)
      from public.transactions t
      where t.kind = 'pl'
        and t.type in ('expense', 'interest_expense')
        and t.date >= b.start_date
        and t.date <= b.end_date
        and (
          (b.type = 'monthly' and t.scope_type = 'personal' and t.scope_id in (
            select u.id from public.users u where u.family_id = b.family_id
          ))
          or (b.type = 'project' and t.scope_type = 'project' and t.scope_id = b.project_id)
        )
    ), 0)::numeric
  ) into v_result
  from public.budgets b
  where b.id = p_budget_id;

  return v_result;
end;
$$;

grant execute on function public.fp_get_budget_detail(uuid) to authenticated;
revoke execute on function public.fp_get_budget_detail(uuid) from public;

-- List budgets for family
create or replace function public.fp_list_budgets(
  p_active_only boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_family uuid;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  v_family := public.fp_current_family(v_actor);
  if v_family is null then
    raise exception 'You are not part of a family';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', b.id,
      'name', b.name,
      'type', b.type,
      'total_amount', b.total_amount,
      'start_date', b.start_date,
      'end_date', b.end_date,
      'project_id', b.project_id,
      'active', b.active,
      'created_at', b.created_at,
      'total_spent', coalesce(sp.total_spent, 0),
      'total_allocated', coalesce(al.total_allocated, 0)
    )
  ) into v_result
  from public.budgets b
  left join lateral (
    select sum(t.amount) as total_spent
    from public.transactions t
    where t.kind = 'pl'
      and t.type in ('expense', 'interest_expense')
      and t.date >= b.start_date
      and t.date <= b.end_date
      and (
        (b.type = 'monthly' and t.scope_type = 'personal' and t.scope_id in (
          select u.id from public.users u where u.family_id = b.family_id
        ))
        or (b.type = 'project' and t.scope_type = 'project' and t.scope_id = b.project_id)
      )
  ) sp on true
  left join lateral (
    select sum(amount) as total_allocated
    from public.budget_category_allocations
    where budget_id = b.id
  ) al on true
  where b.family_id = v_family
    and (not p_active_only or b.active)
  order by b.start_date desc, b.created_at desc;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

grant execute on function public.fp_list_budgets(boolean) to authenticated;
revoke execute on function public.fp_list_budgets(boolean) from public;