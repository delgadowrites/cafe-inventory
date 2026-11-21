-- =====================================================================
-- 03-keep-manual-updated-at.sql  (issue #5)
-- Run once in the Supabase SQL Editor for the "cafe-inventory" project.
-- =====================================================================
--
-- The problem:
-- The trigger from 02-update-status.sql set updated_at = now() on EVERY
-- update. That included your own edits in the Table Editor, so typing
-- "15 minutes ago" into updated_at was instantly replaced with now().
--
-- What this changes:
-- The trigger now stamps now() only when the update does NOT change
-- updated_at itself:
--   * A tap in the app only sends `status` (and app users aren't allowed
--     to change updated_at anyway; see 02-update-status.sql), so every
--     tap still gets the database's current time, including a re-tap of
--     the same status.
--   * When you edit updated_at in the Table Editor or SQL Editor, the
--     time you typed is kept.
--   * When you edit only the status in the Table Editor, updated_at is
--     still set to now().
--
-- Only the function is replaced; the trigger that calls it stays as is.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- `old` is the row before the update, `new` is the row after.
  -- If updated_at wasn't changed by this update, stamp the current time.
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Optional: set test times for issue #5 right here instead of in the
-- Table Editor. Change the item names if you like, then run these lines.
-- (They only change updated_at; status stays the same.)
-- ---------------------------------------------------------------------
-- update public.items set updated_at = now() - interval '30 seconds' where name = 'Arugula';
-- update public.items set updated_at = now() - interval '15 minutes' where name = 'Cherry Tomatoes';
-- update public.items set updated_at = now() - interval '2 hours'    where name = 'Green Chile';
-- update public.items set updated_at = now() - interval '3 days'     where name = 'Potatoes (Box)';
