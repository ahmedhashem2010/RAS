-- ============================================================
-- RAS — convoys.updated_at column (fix convoy status updates)
--
-- The convoys table (0001) never received an `updated_at`
-- column, yet 0001 also attached the `convoys_touch` BEFORE
-- UPDATE trigger which runs touch_updated_at() and assigns
-- `new.updated_at = now()`. Every UPDATE on public.convoys
-- therefore failed with 'record "new" has no field "updated_at"',
-- breaking convoy start / complete / cancel transitions.
--
-- Fix: add the column, matching every other table that has a
-- `*_touch` trigger (profiles, convoy_attendance,
-- convoy_evaluations, tasks). Non-destructive; existing rows get
-- now().
-- ============================================================

alter table public.convoys
  add column if not exists updated_at timestamptz not null default now();
