-- =====================================================================
-- 07-kitchen-items-nov27.sql  (issue #49)
--
--   ALREADY RAN on the LIVE "cafe-inventory" project on Fri, Nov 27
--   (added by hand in the SQL Editor; sanity check clean).
--   This file is a record of it, FOR REBUILDS ONLY.
-- =====================================================================
--
-- Why this file exists:
-- On Nov 27 four kitchen items were added to the live project by hand.
-- Nothing in sql/ added them, so a project rebuilt from 00 would be
-- missing them. This file closes that gap. (Black Pepper, the earlier
-- hand-added item, is already covered: 06 adds it if it's missing.)
--
-- When to run it:
-- In a rebuild, run it AFTER 06-foh-items.sql (it needs the `area`
-- column from 05, and every new row must name its area).
--
-- Running it on the live project, or twice: each insert only adds an
-- item whose name isn't in the table yet, so it changes nothing.
--
-- What this does: adds 4 kitchen items, each in its existing kitchen
-- category, at the sort_order used on the live project:
--   Strawberry Cream Cheese    Dairy       63  (after Whipped Cream Cheese, 60)
--   Maple Walnut Cream Cheese  Dairy       66
--   Gloves                     Cleaning   445  (after Black Garbage Liners, 440)
--   Wrapping Paper             Packaging  455  (after Brown Boxes, 450)
-- status defaults to 'good' and updated_at to now(); id is generated.
--
-- Kitchen phones afterwards: 52 items (49 kitchen + 3 Shared).

begin;

insert into public.items (name, category, sort_order, area)
select 'Strawberry Cream Cheese', 'Dairy', 63, 'kitchen'
where not exists (select 1 from public.items where name = 'Strawberry Cream Cheese');

insert into public.items (name, category, sort_order, area)
select 'Maple Walnut Cream Cheese', 'Dairy', 66, 'kitchen'
where not exists (select 1 from public.items where name = 'Maple Walnut Cream Cheese');

insert into public.items (name, category, sort_order, area)
select 'Gloves', 'Cleaning', 445, 'kitchen'
where not exists (select 1 from public.items where name = 'Gloves');

insert into public.items (name, category, sort_order, area)
select 'Wrapping Paper', 'Packaging', 455, 'kitchen'
where not exists (select 1 from public.items where name = 'Wrapping Paper');

commit;

-- ---------------------------------------------------------------------
-- Optional checks (run after the file)
-- ---------------------------------------------------------------------
-- Rows by area: expect foh 44, kitchen 49, shared 3.
select area, count(*) as items
from public.items
group by area
order by area;

-- The four items: expect each once, in the category and place above.
select name, category, sort_order, area
from public.items
where name in ('Strawberry Cream Cheese', 'Maple Walnut Cream Cheese',
               'Gloves', 'Wrapping Paper')
order by sort_order;
