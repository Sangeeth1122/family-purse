-- =====================================================================
-- 0008 — Reports: family-scope the transactions read policy
-- =====================================================================
-- Phase 7 requires full family-wide visibility for reporting and, at the
-- same time, that reports never expose another family's data.
--
-- The original transactions_select policy granted read access to ANY
-- family admin through is_family_admin(auth.uid()), which only checks
-- role='admin' and is NOT scoped to the acting user's family. In a
-- multi-family deployment that would let one family's admin read every
-- family's transactions.
--
-- Reports read family-wide P&L through this policy, so it is narrowed to
-- the only safe definition of "full visibility": the acting user must be
-- in the same family as the transaction's creator (i.e. the creator row
-- must be visible within the acting user's family). This keeps the
-- existing full-visibility behaviour inside a family and removes the
-- cross-family admin bypass. Nothing else about the policy model changes.
-- =====================================================================

drop policy if exists transactions_select on public.transactions;

create policy transactions_select on public.transactions
  for select using (
    exists (
      select 1 from public.users viewer, public.users creator
      where viewer.id = auth.uid()
        and creator.id = transactions.created_by
        and viewer.family_id is not null
        and viewer.family_id = creator.family_id
    )
  );