-- ---------------------------------------------------------------------------
-- Global daily budget for Gemini pantry scans.
--
-- 0005 made the per-user counter atomic, but a per-user cap alone still lets
-- an attacker distribute requests across many accounts. This migration adds a
-- global UTC-day counter and replaces the old claim function with a two-limit
-- claim. Both counters are checked and incremented while holding the same
-- transaction advisory lock, so a concurrent request cannot spend one side of
-- the budget after the other side has been denied.
--
-- The Edge Function supplies conservative, environment-configured limits. The
-- database validates their range as defense in depth; it never trusts a
-- client-supplied user id or identity.
-- ---------------------------------------------------------------------------

create table private.pantry_scan_global_usage (
  usage_date  date        not null primary key default (now() at time zone 'utc')::date,
  scan_count  int         not null default 0,
  updated_at  timestamptz not null default now(),

  constraint pantry_scan_global_usage_count_valid check (scan_count >= 0)
);

alter table private.pantry_scan_global_usage enable row level security;

drop function if exists private.claim_pantry_scan(int);

create or replace function private.claim_pantry_scan(
  p_daily_limit int,
  p_global_daily_limit int
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  today        date := (now() at time zone 'utc')::date;
  caller       uuid := (select auth.uid());
  user_count   int := 0;
  global_count int := 0;
begin
  if caller is null then
    return false;
  end if;

  if p_daily_limit < 1 or p_daily_limit > 100
     or p_global_daily_limit < 1 or p_global_daily_limit > 100000 then
    raise exception 'invalid pantry scan budget';
  end if;

  -- Serialize claims for the current day. This is a short database-only
  -- critical section and keeps the two ledgers all-or-nothing without a
  -- user-controlled advisory-lock key.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('homechef:pantry-scan:' || today::text, 0)
  );

  select scan_count
    into global_count
    from private.pantry_scan_global_usage
   where usage_date = today;

  select scan_count
    into user_count
    from private.pantry_scan_usage
   where user_id = caller
     and usage_date = today;

  global_count := coalesce(global_count, 0);
  user_count := coalesce(user_count, 0);

  if global_count >= p_global_daily_limit or user_count >= p_daily_limit then
    return false;
  end if;

  insert into private.pantry_scan_global_usage as g (usage_date, scan_count)
  values (today, 1)
  on conflict (usage_date)
  do update set scan_count = g.scan_count + 1,
                updated_at = now();

  insert into private.pantry_scan_usage as u (user_id, usage_date, scan_count)
  values (caller, today, 1)
  on conflict (user_id, usage_date)
  do update set scan_count = u.scan_count + 1,
                updated_at = now();

  return true;
end;
$$;

revoke execute on function private.claim_pantry_scan(int, int)
  from public, anon, authenticated;

grant usage on schema private to service_role;
grant execute on function private.claim_pantry_scan(int, int) to service_role;
