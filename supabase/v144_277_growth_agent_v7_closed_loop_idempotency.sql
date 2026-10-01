-- Spreelo v144.277 — Growth Agent V7 closed-loop idempotency
-- Run once after v144.276.
-- Prevents retries/concurrent duplicate planning requests from creating more
-- than one audit cycle for the same logical Growth Agent planning event.

begin;

alter table public.growth_agent_closed_loop_cycles
  add column if not exists cycle_key text;

-- Existing rows (if any) remain distinct. New application writes use a stable
-- SHA-256-derived key for the logical planning event.
update public.growth_agent_closed_loop_cycles
set cycle_key = 'legacy:' || id::text
where cycle_key is null or btrim(cycle_key) = '';

alter table public.growth_agent_closed_loop_cycles
  alter column cycle_key set not null;

create unique index if not exists growth_agent_closed_loop_cycle_key_uidx
  on public.growth_agent_closed_loop_cycles(cycle_key);

comment on column public.growth_agent_closed_loop_cycles.cycle_key is
  'Idempotency key for a logical Growth Agent planning event. Repeated/concurrent writes with the same key resolve to the existing audit cycle.';

commit;
