-- =====================================================================
-- 02-update-status.sql  (issue #2)
-- Run once in the Supabase SQL Editor for the "cafe-inventory" project.
-- =====================================================================
--
-- What this does, in three parts:
--   1. GRANT: signed-in users may update the STATUS column only.
--   2. POLICY: RLS lets signed-in users update any item row.
--   3. TRIGGER: the database stamps updated_at = now() on every update.
--
-- Together: the app can change an item's status and nothing else. A
-- request that tries to change name, category, sort_order or updated_at
-- is refused with "permission denied for table items" (42501).
-- There is still no insert or delete access.

-- ---------------------------------------------------------------------
-- 1. Column-level privilege: UPDATE on `status` only.
-- ---------------------------------------------------------------------
-- Postgres checks this against the columns a request tries to SET, so
-- `update items set name = ...` fails even though the policy allows the row.
-- The revoke first removes any table-wide UPDATE these roles might have
-- (which would cover every column); it does nothing if there is none.
revoke update on table public.items from anon, authenticated;
grant update (status) on table public.items to authenticated;

-- ---------------------------------------------------------------------
-- 2. RLS policy: which rows signed-in users may update (all of them).
-- ---------------------------------------------------------------------
-- USING = which existing rows can be targeted; WITH CHECK = what the row
-- must look like afterwards. Both are true: any item, any valid status.
-- (The status column's own rule still allows only out / low / good.)
drop policy if exists "Signed-in users can update status" on public.items;
create policy "Signed-in users can update status"
  on public.items
  for update
  to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------
-- 3. Trigger: set updated_at from the database clock on every update.
-- ---------------------------------------------------------------------
-- Using the server's clock (not each phone's) keeps times consistent.
-- It runs on EVERY update, even when the status doesn't change, so
-- tapping the already-selected status refreshes updated_at
-- (the end-of-shift "still good" check).
-- The trigger can write updated_at even though users can't: column
-- privileges only apply to what the request itself sets.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at
  before update on public.items
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Optional checks
-- ---------------------------------------------------------------------
-- Column privileges for `authenticated`: expect one row, status / UPDATE.
select column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'items'
  and grantee = 'authenticated'
  and privilege_type = 'UPDATE';

-- Policies on items: expect the SELECT policy and this UPDATE policy.
select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'items';
