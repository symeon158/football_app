-- Raise the daily rewarded-match allowance from 20 to 30 (other limits unchanged).
-- Columns: rewarded_per_day, max_per_day, cooldown_seconds, goal_bonus, goal_bonus_cap
create or replace function public.match_limits()
returns table (rewarded_per_day integer, max_per_day integer, cooldown_seconds integer, goal_bonus integer, goal_bonus_cap integer)
language sql immutable set search_path = ''
as $$ select 30, 60, 5, 10, 50 $$;

revoke execute on function public.match_limits() from public, anon;
grant execute on function public.match_limits() to authenticated;
