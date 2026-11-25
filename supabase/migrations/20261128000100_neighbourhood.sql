-- =============================================================================
-- Football Legends — neighbourhood theme
--
-- The stadium becomes the club's home ground in its neighbourhood. Mechanics are
-- unchanged (levels, costs, home advantage, income); only the descriptions change.
-- Each club can name its area (e.g. "Kypseli"); areas are public, so managers can
-- see local derbies and an area table of who wins most.
-- =============================================================================

-- Area: letters (Latin or Greek), spaces, dots, apostrophes and hyphens; 2–30 characters.
alter table public.stadiums
  add column area text
    check (area is null or (char_length(area) between 2 and 30
      and area ~ '^[A-Za-zÀ-ɏͰ-Ͽἀ-῾][A-Za-zÀ-ɏͰ-Ͽἀ-῾ .''-]*$'));
create index stadiums_area_idx on public.stadiums (lower(area)) where area is not null;

-- The owner may set it (cosmetic, like the ground's name and style).
grant update (area) on public.stadiums to authenticated;

-- Themed upgrade descriptions (costs and bonuses unchanged).
update public.stadium_upgrade_costs as c set description = v.description
  from (values
    ('seating', 2, 'Wooden benches by the touchline — 12,000 supporters'),
    ('seating', 3, 'Covered terrace — 25,000 supporters'),
    ('seating', 4, 'Stands on both sides — 45,000 supporters'),
    ('seating', 5, 'The whole neighbourhood comes — 70,000 supporters'),
    ('lighting', 2, 'Two floodlight poles'),
    ('lighting', 3, 'Four LED floodlights'),
    ('lighting', 4, 'Proper night-match lighting'),
    ('lighting', 5, 'Lights the whole area can see'),
    ('pitch', 2, 'Five-a-side artificial cage'),
    ('pitch', 3, 'Full-size artificial turf'),
    ('pitch', 4, 'Natural grass with drainage'),
    ('pitch', 5, 'Pristine grass pitch'),
    ('facilities', 2, 'Container changing room'),
    ('facilities', 3, 'Clubhouse with showers'),
    ('facilities', 4, 'Clubhouse with café and physio room'),
    ('facilities', 5, 'Community sports centre')
  ) as v(category, level, description)
 where c.category = v.category::public.stadium_upgrade_category and c.level = v.level;

-- --------------------------------------------------------------- area table
-- Which neighbourhood wins most: all clubs that set an area, grouped case-insensitively.
create or replace function public.get_area_table(p_period text default 'week')
returns table (area text, managers bigint, wins bigint, goals bigint, is_mine boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_from timestamptz := case when p_period = 'week' then date_trunc('week', now() at time zone 'utc') at time zone 'utc' else '-infinity'::timestamptz end;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if p_period not in ('week', 'all') then raise exception 'INVALID_LEADERBOARD' using errcode = '22023'; end if;
  return query
    -- Prefer a capitalised spelling (e.g. "Κυψέλη" over "κυψέλη").
    select (array_agg(s.area order by (left(s.area, 1) = upper(left(s.area, 1))) desc, s.area))[1]::text,
           count(*)::bigint,
           coalesce(sum(x.wins), 0)::bigint,
           coalesce(sum(x.goals), 0)::bigint,
           bool_or(s.user_id = v_uid)
      from public.stadiums s
      left join lateral (
        select count(*) filter (where m.home_score > m.away_score) as wins, sum(m.home_score) as goals
          from public.matches m
         where m.user_id = s.user_id and m.status = 'completed' and m.created_at >= v_from
      ) x on true
     where s.area is not null
     group by lower(s.area)
     order by 3 desc, 4 desc, 1
     limit 25;
end;
$$;

-- A manager's area (public), for derby labels.
create or replace function public.get_manager_area(p_username text)
returns text
language sql stable security definer set search_path = ''
as $$
  select s.area from public.profiles p join public.stadiums s on s.user_id = p.id
   where p.username operator(extensions.=) p_username::extensions.citext and auth.uid() is not null;
$$;

revoke execute on function public.get_area_table(text), public.get_manager_area(text) from public, anon;
grant execute on function public.get_area_table(text), public.get_manager_area(text) to authenticated;
