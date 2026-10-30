-- Fixes for the daily Rush (20261031000000_daily_rush.sql):
-- 1. my_rush_stats failed for players with several practice runs on one day (pre-Rush #1),
--    which also rolled back their submit. It now reads the latest run of the day.
-- 2. Stats can be asked for a specific day, so a run that crosses midnight Central reports
--    the day it was filed under instead of "unplayed".
-- 3. start_rush is safe to retry: if the response was lost, calling it again within a few
--    seconds returns the same run instead of burning the day's only attempt.
-- 4. The runs-per-day flood cap is back for the practice day.

drop function public.submit_rush(uuid, integer);
drop function public.my_rush_stats();

create function public.my_rush_stats(for_day date default null)
returns table (
  played_today boolean,
  today_score integer,
  played_at timestamptz,
  rank_today bigint,
  best_all_time integer,
  current_streak integer,
  days_played integer
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
  -- Consecutive days share a group: day + its position counting back from the latest
  my_days as (
    select s.day, s.day + (row_number() over (order by s.day desc))::integer as grp
    from public.rush_scores s
    where s.player_id = auth.uid()
  ),
  latest as (
    select day, grp from my_days order by day desc limit 1
  )
  select
    exists (select 1 from day_run),
    (select s.score from public.rush_scores s, target t where s.player_id = auth.uid() and s.day = t.day),
    (select started_at from day_run),
    (select b.board_rank from day_board b where b.player_id = auth.uid()),
    (select max(s.score) from public.rush_scores s where s.player_id = auth.uid()),
    -- A streak survives until a full day is missed: it counts if the latest score is today or yesterday
    coalesce((
      select count(*)::integer from my_days d, latest l
      where d.grp = l.grp and l.day >= public.rush_today() - 1
    ), 0),
    (select count(*)::integer from my_days);
$$;

create or replace function public.start_rush()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_run_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  -- Flood cap (only reachable on practice days, before the one-per-day rule)
  if (
    select count(*) from public.rush_runs
    where player_id = auth.uid() and started_at > now() - interval '1 day'
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
  end if;
  return new_run_id;
end;
$$;

create function public.submit_rush(run_id uuid, final_score integer)
returns table (
  played_today boolean,
  today_score integer,
  played_at timestamptz,
  rank_today bigint,
  best_all_time integer,
  current_streak integer,
  days_played integer
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

revoke execute on function public.my_rush_stats(date), public.submit_rush(uuid, integer) from public, anon, authenticated;
grant execute on function public.my_rush_stats(date), public.submit_rush(uuid, integer) to authenticated;
