-- Streak freezes, achievement badges on profiles, the weekly league, and server-side Rush days.
--
-- Streak freeze: every 7th day with a Rush score earns one freeze, and at most 2 can be banked
-- (earning stops while the bank is full). When a player comes back after missing days,
-- start_rush spends freezes to cover the gap, if there are enough to cover all of it. Frozen
-- days keep a streak alive but don't add to it.
--
-- Badges: shown by the player's handle. Rush badges are worked out here from real scores; the
-- app can only report idle-game badges (those live in the player's browser and can't be
-- checked), from a fixed list.
--
-- Weekly league: "this week" (Monday-Sunday, Central) ranks players by the total of their daily
-- scores. Last week's #1 is the champion, shown with a crown on every board.
--
-- start_rush now also returns the run's day, so the app picks the daily twist from the server's
-- calendar rather than the device clock.

-- ==========================================
-- STREAK FREEZES
-- ==========================================
create table public.rush_freezes (
  player_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (player_id, day)
);

alter table public.rush_freezes enable row level security;

-- Replays the player's history in order: +1 on every 7th scored day (bank full at 2), -1 for
-- each frozen day
create function public.rush_freezes_available(player uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  bank integer := 0;
  scored_days integer := 0;
  entry record;
begin
  for entry in
    select d.day, bool_or(d.scored) as scored
    from (
      select s.day, true as scored from public.rush_scores s where s.player_id = player
      union all
      select f.day, false from public.rush_freezes f where f.player_id = player
    ) d
    group by d.day
    order by d.day
  loop
    if entry.scored then
      scored_days := scored_days + 1;
      if scored_days % 7 = 0 then
        bank := least(2, bank + 1);
      end if;
    else
      bank := greatest(0, bank - 1);
    end if;
  end loop;
  return bank;
end;
$$;

-- ==========================================
-- BADGES
-- ==========================================
alter table public.profiles
  add column badges text[] not null default '{}',
  add constraint profiles_badges_count check (cardinality(badges) <= 50);

-- Players edit their own handle and name, never badges: column-level grants replace the
-- table-wide ones (RLS still limits them to their own row). id is listed because upserts
-- re-set it on conflict; RLS keeps it pinned to the caller.
revoke insert, update on public.profiles from authenticated;
grant insert (id, handle, first_name, last_name) on public.profiles to authenticated;
grant update (id, handle, first_name, last_name) on public.profiles to authenticated;

-- Records badges for the signed-in player and returns their full list. Must match
-- ACHIEVEMENTS in lib/achievements.ts.
create function public.set_my_badges(badge_ids text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Idle-game badges: only the player's browser knows these, so the app's word is taken
  self_reported constant text[] := array[
    'first_tap', 'taps_1k', 'taps_10k', 'taps_100k',
    'mornings_1m', 'mornings_1b', 'mornings_1t',
    'combo_25', 'combo_100', 'golden_1', 'golden_25',
    'promoted_1', 'promoted_5', 'promoted_9', 'own_all'
  ];
  best_score integer;
  scored_days integer;
  best_streak integer;
  made_podium boolean;
  verified text[];
  result text[];
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  -- Rush badges come from the player's real scores; claims for them are ignored
  select max(s.score), count(*) into best_score, scored_days
  from public.rush_scores s where s.player_id = auth.uid();

  -- Longest run of consecutive kept days (scored or frozen), counting only scored ones
  select coalesce(max(run_length), 0) into best_streak from (
    select count(*) filter (where k.scored) as run_length
    from (
      select d.day, bool_or(d.scored) as scored,
        d.day - (row_number() over (order by d.day))::integer as grp
      from (
        select s.day, true as scored from public.rush_scores s where s.player_id = auth.uid()
        union all
        select f.day, false from public.rush_freezes f where f.player_id = auth.uid()
      ) d
      group by d.day
    ) k
    group by k.grp
  ) runs;

  -- Top 3 on a finished day, among players with a handle
  select exists (
    select 1 from (
      select s.player_id, row_number() over (partition by s.day order by s.score desc, s.achieved_at) as day_rank
      from public.rush_scores s
      join public.profiles p on p.id = s.player_id
      where s.day < public.rush_today()
    ) ranked
    where ranked.player_id = auth.uid() and ranked.day_rank <= 3
  ) into made_podium;

  verified := array_remove(array[
    case when scored_days >= 1 then 'rush_first' end,
    case when best_score >= 200 then 'rush_200' end,
    case when best_score >= 300 then 'rush_300' end,
    case when made_podium then 'rush_top3' end,
    case when best_streak >= 3 then 'streak_3' end,
    case when best_streak >= 7 then 'streak_7' end,
    case when best_streak >= 30 then 'streak_30' end
  ], null);

  -- Badges only accumulate: earned ones are never removed by a later call
  update public.profiles p
  set badges = (
    select coalesce(array_agg(distinct b order by b), '{}')
    from unnest(p.badges || verified || array(select x from unnest(badge_ids) x where x = any (self_reported))) as b
  )
  where p.id = auth.uid()
  returning p.badges into result;

  return coalesce(result, '{}');
end;
$$;

-- ==========================================
-- START: returns the run's day, spends freezes on missed days
-- ==========================================
drop function public.start_rush();

create function public.start_rush()
returns table (run_id uuid, run_day date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_run_id uuid;
  last_day date;
  missed integer;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  -- Flood cap (only reachable on practice days, before the one-per-day rule)
  if (
    select count(*) from public.rush_runs r
    where r.player_id = auth.uid() and r.started_at > now() - interval '1 day'
  ) >= 300 then
    raise exception 'too_many_runs';
  end if;

  insert into public.rush_runs (player_id, day)
  values (auth.uid(), public.rush_today())
  on conflict (player_id, day) where day >= date '2026-10-30' do nothing
  returning id into new_run_id;

  if new_run_id is null then
    -- A retry after a lost response: hand back the run that was just started. Anything older
    -- than a few seconds is a real second attempt.
    select r.id into new_run_id
    from public.rush_runs r
    where r.player_id = auth.uid()
      and r.day = public.rush_today()
      and r.submitted_at is null
      and r.started_at > now() - interval '15 seconds';

    if new_run_id is null then
      raise exception 'already_played_today';
    end if;
    return query select new_run_id, public.rush_today();
    return;
  end if;

  -- Coming back after missed days: freeze them if the bank covers the whole gap. Days with a
  -- run (even one still in progress) count as played, so a freeze never lands on them.
  select max(d) into last_day from (
    select r.day as d from public.rush_runs r where r.player_id = auth.uid() and r.day < public.rush_today()
    union all
    select s.day from public.rush_scores s where s.player_id = auth.uid()
    union all
    select f.day from public.rush_freezes f where f.player_id = auth.uid()
  ) days;
  missed := public.rush_today() - last_day - 1;
  if missed between 1 and public.rush_freezes_available(auth.uid()) then
    insert into public.rush_freezes (player_id, day)
    select auth.uid(), g::date
    from generate_series(last_day + 1, public.rush_today() - 1, interval '1 day') as g
    on conflict do nothing;
  end if;

  return query select new_run_id, public.rush_today();
end;
$$;

-- ==========================================
-- STATS: streak counts frozen days as kept; adds freezes and the week total
-- ==========================================
drop function public.submit_rush(uuid, integer);
drop function public.my_rush_stats(date);

create function public.my_rush_stats(for_day date default null)
returns table (
  played_today boolean,
  today_score integer,
  played_at timestamptz,
  rank_today bigint,
  best_all_time integer,
  current_streak integer,
  days_played integer,
  freezes_available integer,
  streak_needs_freeze boolean, -- Missed day(s) that a freeze will cover when the player next plays
  week_total integer -- This week's total (Monday-Sunday, Central), for the weekly league
)
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select coalesce(for_day, public.rush_today()) as day
  ),
  -- Latest run of the day (practice days before Rush #1 could have several)
  day_run as (
    select r.started_at from public.rush_runs r, target t
    where r.player_id = auth.uid() and r.day = t.day
    order by r.started_at desc
    limit 1
  ),
  day_board as (
    select s.player_id, row_number() over (order by s.score desc, s.achieved_at) as board_rank
    from public.rush_scores s
    join public.profiles p on p.id = s.player_id
    join target t on s.day = t.day
  ),
  -- Days that keep a streak going: scored days, plus frozen ones (one row per day)
  kept as (
    select d.day, bool_or(d.scored) as scored
    from (
      select s.day, true as scored from public.rush_scores s where s.player_id = auth.uid()
      union all
      select f.day, false from public.rush_freezes f where f.player_id = auth.uid()
    ) d
    group by d.day
  ),
  -- Consecutive days share a group: day + its position counting back from the latest
  grouped as (
    select day, scored, day + (row_number() over (order by day desc))::integer as grp from kept
  ),
  latest as (
    select day, grp from grouped order by day desc limit 1
  ),
  bank as (
    select public.rush_freezes_available(auth.uid()) as freezes
  ),
  gap as (
    -- Whole days missed since the latest kept day, not counting today
    select coalesce(public.rush_today() - 1 - (select day from latest), 0) as missed
  )
  select
    exists (select 1 from day_run),
    (select s.score from public.rush_scores s, target t where s.player_id = auth.uid() and s.day = t.day),
    (select started_at from day_run),
    (select b.board_rank from day_board b where b.player_id = auth.uid()),
    (select max(s.score) from public.rush_scores s where s.player_id = auth.uid()),
    -- Alive if nothing was missed, or the bank can cover every missed day
    case when (select missed from gap) <= 0 or (select missed from gap) <= (select freezes from bank)
      then (select count(*)::integer from grouped g, latest l where g.grp = l.grp and g.scored)
      else 0 end,
    (select count(*)::integer from public.rush_scores s where s.player_id = auth.uid()),
    (select freezes from bank),
    (select missed from gap) between 1 and (select freezes from bank),
    (select coalesce(sum(s.score), 0)::integer from public.rush_scores s
      where s.player_id = auth.uid() and s.day >= date_trunc('week', public.rush_today())::date);
$$;

create function public.submit_rush(run_id uuid, final_score integer)
returns table (
  played_today boolean,
  today_score integer,
  played_at timestamptz,
  rank_today bigint,
  best_all_time integer,
  current_streak integer,
  days_played integer,
  freezes_available integer,
  streak_needs_freeze boolean,
  week_total integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.rush_runs;
  elapsed interval;
begin
  select * into run
  from public.rush_runs r
  where r.id = run_id and r.player_id = auth.uid()
  for update;

  if not found then
    raise exception 'run_not_found';
  end if;
  if run.submitted_at is not null then
    raise exception 'run_already_submitted';
  end if;

  -- A round is 30 seconds; the extra allowance covers the countdown and a slow network
  elapsed := now() - run.started_at;
  if elapsed < interval '30 seconds' or elapsed > interval '2 minutes' then
    raise exception 'run_timing_invalid';
  end if;

  -- 600 = 20 clicks per second for 30 seconds, well past what a human can tap
  if final_score is null or final_score < 0 or final_score > 600 then
    raise exception 'score_out_of_range';
  end if;

  update public.rush_runs r set submitted_at = now(), score = final_score where r.id = run_id;

  -- Keeps the day's best. From Rush #1 on there's one run a day, so this only matters for
  -- practice runs logged before then.
  insert into public.rush_scores as s (player_id, day, score)
  values (auth.uid(), run.day, final_score)
  on conflict (player_id, day) do update
    set score = excluded.score, achieved_at = now()
    where excluded.score > s.score;

  -- Stats for the day the run was filed under, even if midnight passed mid-run
  return query select * from public.my_rush_stats(run.day);
end;
$$;

-- ==========================================
-- LEADERBOARD: today, this week, all time; badges and the champion's crown
-- ==========================================
drop function public.get_rush_leaderboard(text);

create function public.get_rush_leaderboard(period text default 'today')
returns table (rank bigint, handle text, score integer, is_me boolean, badges text[], is_champion boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select public.rush_today() as today, date_trunc('week', public.rush_today())::date as week_start
  ),
  -- Last week's top total among players with a handle
  champion as (
    select s.player_id
    from public.rush_scores s
    join public.profiles p on p.id = s.player_id, bounds b
    where s.day >= b.week_start - 7 and s.day < b.week_start
    group by s.player_id
    order by sum(s.score) desc, max(s.achieved_at)
    limit 1
  ),
  -- Today and all time: best single day. This week: total of the week's days.
  board as (
    select
      s.player_id,
      (case when period = 'week' then sum(s.score) else max(s.score) end)::integer as score,
      max(s.achieved_at) as tie_break
    from public.rush_scores s, bounds b
    where case period
      when 'today' then s.day = b.today
      when 'week' then s.day >= b.week_start
      else true
    end
    group by s.player_id
  )
  select
    row_number() over (order by bd.score desc, bd.tie_break),
    p.handle,
    bd.score,
    coalesce(bd.player_id = auth.uid(), false),
    p.badges,
    exists (select 1 from champion c where c.player_id = bd.player_id)
  from board bd
  join public.profiles p on p.id = bd.player_id
  order by bd.score desc, bd.tie_break
  limit 10;
$$;

revoke execute on function
  public.rush_freezes_available(uuid),
  public.set_my_badges(text[]),
  public.start_rush(),
  public.my_rush_stats(date),
  public.submit_rush(uuid, integer),
  public.get_rush_leaderboard(text)
from public, anon, authenticated;

grant execute on function
  public.set_my_badges(text[]),
  public.start_rush(),
  public.my_rush_stats(date),
  public.submit_rush(uuid, integer)
to authenticated;
grant execute on function public.get_rush_leaderboard(text) to anon, authenticated;
