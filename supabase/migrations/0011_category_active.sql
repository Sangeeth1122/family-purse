-- Add active/inactive state for categories (deactivate instead of hard-delete)
-- 2025

alter table public.categories
  add column if not exists active boolean not null default true;

create index if not exists idx_categories_active on public.categories(active);

-- All existing categories are active by default (default true handles this).
-- System categories remain active (they were already created with default=true).