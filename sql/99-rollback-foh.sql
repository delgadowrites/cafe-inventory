-- =====================================================================
-- 99-rollback-foh.sql  (issue #40)
--
--   !!!  ONLY IF ROLLING BACK THE FRONT-OF-HOUSE (FOH) LAUNCH.  !!!
--   !!!  Run this BEFORE reverting the code.                     !!!
--
-- Written ready for the Fri, Nov 27 test. NOT run. Run it in the
-- Supabase SQL Editor for the LIVE "cafe-inventory" project only if
-- Carlos decides to undo the FOH launch. See README, "Undo the
-- front-of-house launch".
-- =====================================================================
--
-- Why the SQL goes first, then the code:
-- The old kitchen code (before #37) has no area filter: it loads EVERY
-- row. If the code were reverted first, all 44 FOH items would show on
-- the kitchen phones until this file ran. The current code already
-- hides FOH rows from the kitchen list, so running this file first is
-- safe: the kitchen list never shows an FOH row at any point.
--
--   1. Run this file  -> kitchen phones: kitchen + Shared rows, then
--                        kitchen rows only (Salt, Black Pepper and Honey
--                        move back into their kitchen categories)
--   2. Revert the code -> kitchen phones: the old list, every row
--                        (now all kitchen), exactly as before FOH
--
-- What this does (the reverse of 06-foh-items.sql):
--   1. Deletes the 44 FOH rows. Their statuses are lost; they were only
--      days old.
--   2. Moves the three Shared items back into the kitchen list, keeping
--      their current status:
--        Salt         -> 'Dry Goods / Spices', 330 (where it was)
--        Black Pepper -> 'Dry Goods / Spices', 335 (where it was)
--        Honey        -> 'Condiments / Sauces', 295 (after Syrup, 290).
--                        Honey is new, but the kitchen uses it too, so
--                        it stays.
--
-- What it leaves alone:
--   The `area` column and its check (from 05-add-area.sql) stay. The old
--   code ignores the column, and keeping it makes a second try at FOH
--   easier (06 can simply run again).
--
-- Running it twice does no harm: the second time there are no FOH rows
-- to delete and the three items are already back in the kitchen.

begin;

-- ---------------------------------------------------------------------
-- 1. Remove the front-of-house items
-- ---------------------------------------------------------------------
delete from public.items
where area = 'foh';

-- ---------------------------------------------------------------------
-- 2. Shared items back to the kitchen list
-- ---------------------------------------------------------------------
-- Only area, category and sort_order change; status and updated_at stay.
update public.items
set area = 'kitchen', category = 'Dry Goods / Spices', sort_order = 330
where name = 'Salt' and area = 'shared';

update public.items
set area = 'kitchen', category = 'Dry Goods / Spices', sort_order = 335
where name = 'Black Pepper' and area = 'shared';

update public.items
set area = 'kitchen', category = 'Condiments / Sauces', sort_order = 295
where name = 'Honey' and area = 'shared';

commit;

-- ---------------------------------------------------------------------
-- Optional checks (run after the file)
-- ---------------------------------------------------------------------
-- Rows by area: expect ONE row, kitchen 48 (45 + Salt, Black Pepper,
-- Honey). A `shared` row here is an item added to Shared by hand since
-- 06: move it to the kitchen in the Table Editor (or delete it) before
-- reverting the code, or it shows under a "Shared" heading.
select area, count(*) as items
from public.items
group by area
order by area;

-- The three items, back in place: expect Salt 330 and Black Pepper 335
-- in 'Dry Goods / Spices', Honey 295 in 'Condiments / Sauces'.
select name, category, sort_order, status
from public.items
where name in ('Salt', 'Black Pepper', 'Honey')
order by sort_order;
