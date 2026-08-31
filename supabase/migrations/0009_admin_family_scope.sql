-- =====================================================================
-- 0009 — Family-scope every admin SELECT policy (Phase 8 security hardening)
-- =====================================================================
-- Phase 7 narrowed transactions_select (0008) after proving that the
-- role-only helper is_family_admin(auth.uid()) — which never checks the
-- acting user's family — let Family A admins read Family B rows.
--
-- Phase 8 (final) removes the same unscoped admin branch from every other
-- SELECT policy:
--   * users, categories, projects, project_members, credit_cards, loans
--     already grant read access to ANY same-family member through a
--     family-based branch, so the role-only admin disjunct is simply
--     removed (a same-family admin keeps full visibility).
--   * budgets scope members visibility per scope; the admin branch is
--     replaced with one that requires the row's scope to belong to the
--     acting admin's own family.
--
-- End state invariant: a family admin has administrative visibility only
-- within their own family. Member visibility and project-role separation
-- are unchanged. Write policies are untouched.
-- =====================================================================

-- users -----------------------------------------------------------------
drop policy users_select on public.users;
create policy users_select on public.users
  for select using (
    auth.uid() = id
    or user_in_family(auth.uid(), family_id)
  );

-- categories -------------------------------------------------------------
drop policy categories_select on public.categories;
create policy categories_select on public.categories
  for select using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.family_id is not null
        and u.family_id = categories.family_id
    )
  );

-- projects ---------------------------------------------------------------
drop policy projects_select on public.projects;
create policy projects_select on public.projects
  for select using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.family_id is not null
        and u.family_id = projects.family_id
    )
  );

-- project_members --------------------------------------------------------
-- Family-wide like projects (0006). Same-family members (admin or not)
-- see memberships; cross-family admins do not.
drop policy project_members_select on public.project_members;
create policy project_members_select on public.project_members
  for select using (
    exists (
      select 1 from public.projects p, public.users u
      where p.id = project_members.project_id
        and u.id = auth.uid()
        and u.family_id is not null
        and u.family_id = p.family_id
    )
  );

-- budgets ----------------------------------------------------------------
-- Member visibility (personal/project scoping) is unchanged. The admin
-- branch now requires the acting admin's family to own the budget's scope.
drop policy budgets_select on public.budgets;
create policy budgets_select on public.budgets
  for select using (
    scope_type = 'personal' and exists (
      select 1 from public.users me, public.users target
      where me.id = auth.uid() and target.id = budgets.scope_id
        and me.family_id is not null and me.family_id = target.family_id
    )
    or scope_type = 'project' and exists (
      select 1 from public.project_members pm
      where pm.project_id = budgets.scope_id and pm.user_id = auth.uid()
    )
    or is_family_admin(auth.uid()) and exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.family_id is not null
        and (
          (budgets.scope_type = 'personal'
             and u.family_id = (select target.family_id
                                from public.users target
                                where target.id = budgets.scope_id))
          or (budgets.scope_type = 'project'
             and u.family_id = (select p.family_id
                                from public.projects p
                                where p.id = budgets.scope_id))
        )
    )
  );

-- credit_cards ------------------------------------------------------------
drop policy credit_cards_select on public.credit_cards;
create policy credit_cards_select on public.credit_cards
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.users u, public.users owner
      where u.id = auth.uid()
        and owner.id = credit_cards.user_id
        and u.family_id is not null
        and u.family_id = owner.family_id
    )
  );

-- loans ------------------------------------------------------------------
drop policy loans_select on public.loans;
create policy loans_select on public.loans
  for select using (
    exists (
      select 1 from public.users viewer, public.users creator
      where viewer.id = auth.uid()
        and creator.id = loans.created_by
        and viewer.family_id is not null
        and viewer.family_id = creator.family_id
    )
  );