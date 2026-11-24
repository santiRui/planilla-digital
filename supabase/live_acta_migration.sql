-- Run once in Supabase SQL Editor before deploying cross-device acta recovery.
alter table public.matches
add column if not exists live_state jsonb;
