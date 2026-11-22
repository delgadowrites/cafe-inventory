-- =====================================================================
-- 04-revoke-extra-privileges.sql
-- Run once in the Supabase SQL Editor for the LIVE "cafe-inventory"
-- project. (A project rebuilt with 00-schema.sql doesn't need it: 00
-- already leaves these out. Running it there does nothing.)
-- =====================================================================
--
-- The problem:
-- A read-only check on Nov 22, 2026 showed that the `anon` and
-- `authenticated` roles still hold three privileges on `items` that the
-- app never uses, left over from Supabase's automatic grants:
--   * TRUNCATE   - empty the whole table in one go (this one skips RLS)
--   * REFERENCES - point a foreign key from another table at this one
--   * TRIGGER    - add triggers to this table
-- The app's Data API can't call any of these, so they aren't an open door
-- today. But they shouldn't be there: app users should be able to read
-- items and change their status, and nothing else.
--
-- What this does:
-- Removes those three privileges from both roles. It does NOT touch what
-- the app needs:
--   * authenticated: SELECT on the table          (from 01-grant-read.sql)
--   * authenticated: UPDATE on the status column  (from 02-update-status.sql)
-- Revoking a privilege a role doesn't have is a harmless no-op, so this
-- is safe to run more than once.

-- Table-level privileges.
revoke truncate, references, trigger on table public.items from anon, authenticated;

-- REFERENCES can also be held per column; remove it there too.
revoke references (id, name, category, sort_order, status, updated_at)
  on table public.items from anon, authenticated;

-- ---------------------------------------------------------------------
-- Check (read-only). Expected result, exactly two rows:
--   authenticated | SELECT | (whole table)
--   authenticated | UPDATE | status
-- ---------------------------------------------------------------------
select grantee, privilege_type, '(whole table)' as on_what
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'items'
  and grantee in ('anon', 'authenticated')
union all
select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'items'
  and grantee in ('anon', 'authenticated')
  and privilege_type <> 'SELECT'  -- column SELECT just mirrors the table SELECT
order by 1, 2;
