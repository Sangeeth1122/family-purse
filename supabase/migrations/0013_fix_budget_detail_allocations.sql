-- Fix fp_get_budget_detail: restrict allocations to the selected budget.
-- Previously the allocations subquery did NOT filter by a.budget_id, so the
-- detail view returned every allocation across all budgets in the family.

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
      where a.budget_id = b.id
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
