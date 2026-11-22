-- =====================================================================
-- 00-schema.sql  (issue #19)
-- Rebuilds the database from scratch in a NEW, EMPTY Supabase project.
-- =====================================================================
--
-- !!! FOR A NEW PROJECT ONLY. Do NOT run this on the live project. !!!
-- The live project already has the `items` table. Here, `create table`
-- would stop with "relation items already exists", and because the whole
-- file runs as one transaction (begin ... commit), nothing else in it
-- would run either: no duplicate rows, no changes.
--
-- Rebuild order (see README, "Rebuild the database from scratch"):
--   00-schema.sql                  table, check, RLS, read policy, 46 items
--   01-grant-read.sql              signed-in users can read
--   02-update-status.sql           signed-in users can change status only
--   03-keep-manual-updated-at.sql  trigger keeps hand-typed times
--
-- What this file does:
--   1. Creates the `items` table, with the rule that status is only
--      out / low / good.
--   2. Takes away any automatic permissions on the new table, so that
--      01 and 02 give exactly the access the live project has.
--   3. Turns on Row Level Security and adds the read policy.
--   4. Inserts the 46 items (copied from the live table on Nov 22, 2026).

begin;

-- ---------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------
create table public.items (
  -- Unique id, made up by the database for each new row.
  id         uuid        primary key default gen_random_uuid(),
  -- What's on the shelf, e.g. 'Potatoes (Box)'.
  name       text        not null,
  -- The heading it's listed under, e.g. 'Produce (Fresh)'. Items with the
  -- same category are grouped together; spell it exactly the same.
  category   text        not null,
  -- Shelf order, in steps of 10 (so a new item can go in between, e.g. 45).
  sort_order integer     not null,
  -- Current status. The check allows only these three values, so nothing
  -- else (a typo, a blank) can ever be saved.
  status     text        not null default 'good'
             check (status in ('out', 'low', 'good')),
  -- When the status was last set. Starts as the time the row is added;
  -- the trigger from 02 / 03 updates it on every tap.
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Start with no permissions for app users
-- ---------------------------------------------------------------------
-- Depending on the project's settings, Supabase may automatically give
-- the `anon` and `authenticated` roles every privilege on a new table
-- (including insert and delete). Remove anything automatic here, so app
-- users get only what 01 (read) and 02 (update status) grant.
--
-- (The live project's `anon` and `authenticated` roles also held TRUNCATE,
-- REFERENCES and TRIGGER, left over from Supabase's automatic grants.
-- 04-revoke-extra-privileges.sql removes them there. Here they're never
-- given, so a rebuilt project doesn't need 04.)
revoke all on table public.items from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Row Level Security and the read policy
-- ---------------------------------------------------------------------
-- With RLS on, a role sees and changes only the rows a policy allows.
-- This policy lets signed-in users (including anonymous sign-ins) read
-- every item. 02-update-status.sql adds the update policy. There are no
-- insert or delete policies: items are only added or removed in the
-- Table Editor.
alter table public.items enable row level security;

create policy "Signed-in users can read items"
  on public.items
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- 4. The 46 items, in shelf order
-- ---------------------------------------------------------------------
-- Copied from the live table. Only name, category and sort_order are
-- given: id is generated, every item starts as 'good', and updated_at is
-- the time this runs. The first full walk sets the real statuses.
insert into public.items (name, category, sort_order) values
  -- Produce (Fresh)
  ('Arugula',              'Produce (Fresh)',      10),
  ('Cherry Tomatoes',      'Produce (Fresh)',      20),
  ('Green Chile',          'Produce (Fresh)',      30),
  ('Potatoes (Box)',       'Produce (Fresh)',      40),
  ('Blueberries',          'Produce (Fresh)',      45),
  ('Strawberries',         'Produce (Fresh)',      50),
  -- Dairy
  ('Whipped Cream Cheese', 'Dairy',                60),
  ('Eggs',                 'Dairy',                70),
  ('Feta',                 'Dairy',                80),
  ('Cheddar (Block)',      'Dairy',                90),
  ('Cheddar (Shredded)',   'Dairy',               100),
  ('Greek Yogurt',         'Dairy',               110),
  -- Vegan
  ('Vegan Cream Cheese',   'Vegan',               120),
  ('Vegan Smoked Gouda',   'Vegan',               130),
  ('Plant Based Sausage',  'Vegan',               140),
  ('Plant Based Bacon',    'Vegan',               150),
  ('Vegan Mayo',           'Vegan',               160),
  -- Meats
  ('Chorizo',              'Meats',               170),
  ('Sausage',              'Meats',               180),
  ('Bacon',                'Meats',               190),
  -- Bread / Grains
  ('Tortillas',            'Bread / Grains',      200),
  ('Sourdough Bread',      'Bread / Grains',      210),
  ('Gluten Free Mix',      'Bread / Grains',      220),
  ('Plain Rolls (Bags)',   'Bread / Grains',      230),
  -- Condiments / Sauces
  ('Avocado Pulp',         'Condiments / Sauces', 240),
  ('Whirl',                'Condiments / Sauces', 250),
  ('Mayo',                 'Condiments / Sauces', 260),
  ('Sriracha',             'Condiments / Sauces', 270),
  ('Balsamic Vinaigrette', 'Condiments / Sauces', 280),
  ('Syrup',                'Condiments / Sauces', 290),
  ('Minced Garlic',        'Condiments / Sauces', 300),
  -- Dry Goods / Spices
  ('Everything Seasoning', 'Dry Goods / Spices',  310),
  ('Paprika',              'Dry Goods / Spices',  320),
  ('Salt',                 'Dry Goods / Spices',  330),
  ('Garlic Powder',        'Dry Goods / Spices',  340),
  ('Granola',              'Dry Goods / Spices',  350),
  -- Baking
  ('Flour (Bags)',         'Baking',              360),
  ('Malt',                 'Baking',              370),
  ('Yeast',                'Baking',              380),
  ('Topping Salt',         'Baking',              390),
  -- Cleaning
  ('Grill Cleaner',        'Cleaning',            400),
  ('Bleach',               'Cleaning',            410),
  ('Windex',               'Cleaning',            420),
  ('Dish Soap',            'Cleaning',            430),
  ('Black Garbage Liners', 'Cleaning',            440),
  -- Packaging
  ('Brown Boxes',          'Packaging',           450);

commit;

-- ---------------------------------------------------------------------
-- Optional checks (run after the file)
-- ---------------------------------------------------------------------
-- Expect 46.
select count(*) as items from public.items;

-- Expect 10 categories, in shelf order, with their item counts.
select category, count(*) as items, min(sort_order) as starts_at
from public.items
group by category
order by min(sort_order);
