-- =====================================================================
-- 05-add-area.sql  (issue #36)
-- Run once in the Supabase SQL Editor for the LIVE "cafe-inventory"
-- project, BEFORE merging issue #37 ("Load one area from the link").
-- =====================================================================
--
-- Why the order matters:
-- The code from #37 asks the database for the `area` column. If that
-- code goes live before this file has run, the column doesn't exist yet
-- and the kitchen list fails to load. The current kitchen code doesn't
-- ask for `area`, so running this file first changes nothing on the
-- kitchen phones.
--
-- Running it twice: the second run stops at "column area already
-- exists", and because the whole file runs as one transaction
-- (begin ... commit), nothing else in it runs either. No changes.
--
-- What this does:
--   1. Adds an `area` column to `items`: which list a row belongs to.
--        kitchen = the kitchen list (no ?area in the link)
--        foh     = the front-of-house (barista) list (?area=foh)
--        shared  = both lists, with one status (e.g. Salt)
--      Every existing row gets 'kitchen' (they're all kitchen items).
--   2. Removes the default again, so every NEW row must say its area.
--      A row added in the Table Editor with `area` left empty is refused.
--   3. Adds a check so only 'kitchen', 'foh' or 'shared' can be saved
--      (no typos like 'bar' or 'FOH').
--
-- Permissions: nothing changes here.
--   * 01-grant-read.sql lets signed-in users read the whole table, so
--     they can read the new column too (the app needs that for #37).
--   * 02-update-status.sql lets them update the `status` column only, so
--     they can read `area` but never change it.

begin;

-- ---------------------------------------------------------------------
-- 1. The column, filled with 'kitchen' on every existing row
-- ---------------------------------------------------------------------
-- `not null` plus a default: Postgres writes the default into every row
-- that's already in the table, so none is left empty.
alter table public.items add column area text not null default 'kitchen';

-- ---------------------------------------------------------------------
-- 2. No default from now on
-- ---------------------------------------------------------------------
-- The existing rows keep 'kitchen'. A new row with no area is refused
-- (because of `not null`), so nobody adds an item to the wrong list by
-- forgetting the column.
alter table public.items alter column area drop default;

-- ---------------------------------------------------------------------
-- 3. Only the three areas are allowed
-- ---------------------------------------------------------------------
-- Lower case, spelled exactly like this. Anything else is refused.
alter table public.items
  add constraint items_area_check
  check (area in ('kitchen', 'foh', 'shared'));

commit;

-- ---------------------------------------------------------------------
-- Optional checks (run after the file)
-- ---------------------------------------------------------------------
-- Rows by area: expect ONE row, kitchen, with every item in the table
-- (47: the 46 items plus Black Pepper, added by hand on Nov 26).
select area, count(*) as items
from public.items
group by area
order by area;

-- Column privileges for `authenticated` (same query as in 02):
-- expect one row, status / UPDATE. `area` must NOT appear.
select column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'items'
  and grantee = 'authenticated'
  and privilege_type = 'UPDATE';
