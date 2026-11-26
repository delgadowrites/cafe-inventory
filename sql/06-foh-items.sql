-- =====================================================================
-- 06-foh-items.sql  (issue #38)
-- Run once in the Supabase SQL Editor for the LIVE "cafe-inventory"
-- project, AFTER issue #37 ("Load one area from the link") is merged
-- and live. NEVER before.
-- =====================================================================
--
-- Why the order matters:
-- Before #37, the kitchen code loads EVERY row. Running this file then
-- would put all 44 front-of-house (FOH) items on the kitchen phones and
-- move Salt out of "Dry Goods / Spices". With #37 live, the kitchen list
-- only loads `kitchen` + `shared` rows, so the FOH rows stay out of it.
--
-- Needs 05-add-area.sql first (the `area` column).
--
-- Running it twice: the check at the top stops the second run with an
-- error ("FOH items are already in the table"), and because the whole
-- file runs as one transaction (begin ... commit), nothing changes.
--
-- What this does:
--   1. Stops if any FOH row already exists (the run-twice guard).
--   2. Makes Salt, Black Pepper and Honey "Shared": one row each, with
--      area = 'shared' and category 'Shared', at the bottom of BOTH
--      lists (sort_order 1000, 1010, 1020), with one status that both
--      teams see. Salt and Black Pepper keep their current status and
--      time. Black Pepper was added by hand on Nov 26; if it isn't in
--      the table, it's added here. Honey is new.
--   3. Adds the 44 FOH items in 7 categories, in barista-station order.
--      Each starts as 'good' (the first FOH walk sets the real statuses),
--      and updated_at is the time this runs.
--
-- Kitchen phones afterwards: 48 items (45 kitchen + 3 Shared).
-- FOH phones afterwards:     47 items (44 FOH + 3 Shared).

begin;

-- ---------------------------------------------------------------------
-- 1. Run-twice guard
-- ---------------------------------------------------------------------
-- If any row is already a front-of-house item, this file has run before:
-- stop here with an error, which cancels the whole transaction.
do $$
begin
  if exists (select 1 from public.items where area = 'foh') then
    raise exception 'FOH items are already in the table: 06-foh-items.sql has already run. Nothing was changed.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. The Shared items (both lists, one status)
-- ---------------------------------------------------------------------
-- Only area, category and sort_order change. status and updated_at are
-- left alone, so Salt and Black Pepper carry their current status over.

-- Salt: from 'Dry Goods / Spices' (330) in the kitchen to Shared.
update public.items
set area = 'shared', category = 'Shared', sort_order = 1000
where name = 'Salt';

-- Black Pepper: moved to Shared if it's in the table (added by hand on
-- Nov 26, at 335)...
update public.items
set area = 'shared', category = 'Shared', sort_order = 1010
where name = 'Black Pepper';

-- ...and added if it isn't (e.g. in a project rebuilt from 00).
insert into public.items (name, category, sort_order, area)
select 'Black Pepper', 'Shared', 1010, 'shared'
where not exists (select 1 from public.items where name = 'Black Pepper');

-- Honey: new, added once.
insert into public.items (name, category, sort_order, area)
select 'Honey', 'Shared', 1020, 'shared'
where not exists (select 1 from public.items where name = 'Honey');

-- ---------------------------------------------------------------------
-- 3. The 44 front-of-house items, in station order
-- ---------------------------------------------------------------------
-- From the GM's list (spelling fixed, Title Case). sort_order counts in
-- steps of 10 from 10, like the kitchen list: each list has its own
-- order, and the Shared items (1000+) come after both.
-- status defaults to 'good' and updated_at to now(); id is generated.
insert into public.items (name, category, sort_order, area) values
  -- Milks
  ('Heavy Cream',              'Milks',                  10, 'foh'),
  ('Half and Half',            'Milks',                  20, 'foh'),
  ('Coconut Milk',             'Milks',                  30, 'foh'),
  ('Oat Milk',                 'Milks',                  40, 'foh'),
  ('Almond Milk',              'Milks',                  50, 'foh'),
  ('Whole Milk',               'Milks',                  60, 'foh'),
  ('Skim Milk',                'Milks',                  70, 'foh'),
  -- Sauces
  ('Maple Syrup',              'Sauces',                 80, 'foh'),
  ('Caramel',                  'Sauces',                 90, 'foh'),
  ('Mocha',                    'Sauces',                100, 'foh'),
  ('White Mocha',              'Sauces',                110, 'foh'),
  -- Extracts
  ('Vanilla',                  'Extracts',              120, 'foh'),
  ('Pistachio',                'Extracts',              130, 'foh'),
  ('Hazelnut',                 'Extracts',              140, 'foh'),
  ('Lavender',                 'Extracts',              150, 'foh'),
  ('Coconut',                  'Extracts',              160, 'foh'),
  ('Rose',                     'Extracts',              170, 'foh'),
  ('Raspberry',                'Extracts',              180, 'foh'),
  -- Spices
  ('White Sugar',              'Spices',                190, 'foh'),
  ('Brown Sugar',              'Spices',                200, 'foh'),
  ('Cardamom',                 'Spices',                210, 'foh'),
  ('Cinnamon',                 'Spices',                220, 'foh'),
  ('Allspice',                 'Spices',                230, 'foh'),
  ('Nutmeg',                   'Spices',                240, 'foh'),
  ('Ginger',                   'Spices',                250, 'foh'),
  ('Cloves',                   'Spices',                260, 'foh'),
  -- Tea
  ('Matcha',                   'Tea',                   270, 'foh'),
  ('Chamomile',                'Tea',                   280, 'foh'),
  ('Earl Grey',                'Tea',                   290, 'foh'),
  ('Red Raspberry',            'Tea',                   300, 'foh'),
  -- Beans
  ('Brazil',                   'Beans',                 310, 'foh'),
  -- Dry Goods / Packaging
  ('12 oz Hot Cups',           'Dry Goods / Packaging', 320, 'foh'),
  ('16 oz Hot Cups',           'Dry Goods / Packaging', 330, 'foh'),
  ('Hot Lids (Both Sizes)',    'Dry Goods / Packaging', 340, 'foh'),
  ('Cup Sleeves',              'Dry Goods / Packaging', 350, 'foh'),
  ('12 oz Iced Cups',          'Dry Goods / Packaging', 360, 'foh'),
  ('16 oz Iced Cups',          'Dry Goods / Packaging', 370, 'foh'),
  ('Cold Lids (Both Sizes)',   'Dry Goods / Packaging', 380, 'foh'),
  ('Cortado Cups / Lids',      'Dry Goods / Packaging', 390, 'foh'),
  ('Straws',                   'Dry Goods / Packaging', 400, 'foh'),
  ('Stir Sticks',              'Dry Goods / Packaging', 410, 'foh'),
  ('Drink Trays',              'Dry Goods / Packaging', 420, 'foh'),
  ('Napkins',                  'Dry Goods / Packaging', 430, 'foh'),
  ('Paper Bags',               'Dry Goods / Packaging', 440, 'foh');

commit;

-- ---------------------------------------------------------------------
-- Optional checks (run after the file)
-- ---------------------------------------------------------------------
-- Rows by area: expect foh 44, kitchen 45, shared 3.
select area, count(*) as items
from public.items
group by area
order by area;

-- Categories for FOH and Shared, in list order: expect the 7 FOH
-- categories (Milks 7, Sauces 4, Extracts 7, Spices 8, Tea 4, Beans 1,
-- Dry Goods / Packaging 13), then Shared 3.
select area, category, count(*) as items, min(sort_order) as starts_at
from public.items
where area in ('foh', 'shared')
group by area, category
order by min(sort_order);

-- The Shared items by name: expect Salt, Black Pepper, Honey, with Salt
-- and Black Pepper still showing the status they had before.
select name, status, updated_at
from public.items
where area = 'shared'
order by sort_order;
