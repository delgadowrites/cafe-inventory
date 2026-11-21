-- =====================================================================
-- 01-grant-read.sql  (issue #1)
-- Run once in the Supabase SQL Editor for the "cafe-inventory" project.
-- =====================================================================
--
-- Why this is needed:
-- Postgres checks two things before a signed-in user can read a row:
--   1. Table privilege (GRANT): may this role use the table at all?
--   2. Row Level Security (policy): which rows may it see?
-- The SELECT policy covers step 2, but the `authenticated` role (which
-- anonymous users also get) had no privilege on the table, so every read
-- failed with "permission denied for table items" (error 42501).
--
-- What this does:
-- Lets signed-in users READ the items table. Nothing else: no insert,
-- update or delete privilege is given, and RLS still applies on top.
-- The `anon` role (not signed in) gets nothing.

grant select on table public.items to authenticated;

-- Optional check: should list one row, privilege_type = SELECT.
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'items'
  and grantee in ('anon', 'authenticated');
