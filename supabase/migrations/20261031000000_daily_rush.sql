-- Morning Rush becomes a once-a-day game, like Wordle: one attempt per player per Central day.
-- Every run is logged with its Central day; start and submit times stay as timestamptz.
-- Adds streaks (consecutive days with a score) to the player's stats.

alter table public.rush_runs
  add column day date not null default ((now() at time zone 'America/Chicago')::date);

-- Backfill any runs logged before this migration with the day they started
update public.rush_runs set day = (started_at at time zone 'America/Chicago')::date;

-- The one-attempt-per-day rule, from Rush #1 (Oct 30, 2026) on. Runs from before then were
-- unlimited practice and stay as logged.
create unique index rush_runs_one_per_day_idx on public.rush_runs (player_id, day)
  where day >= date '2026-10-30';

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

  insert into public.rush_runs (player_id, day)
  values (auth.uid(), public.rush_today())
  on conflict (player_id, day) where day >= date '2026-10-30' do nothing
  returning id into new_run_id;

  if new_run_id is null then
    raise exception 'already_played_today';
  end if;
  return new_run_id;
end;
$$;

-- The stats shape changes, so the two functions that return it are recreated
drop function public.submit_rush(uuid, integer);
drop function public.my_rush_stats();

-- The signed-in player's day: whether they've played, their score and when (as timestamptz;
-- the app shows it in Central), rank among players with a handle, best ever, and streak.
create function public.my_rush_stats()
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
  with today_run as (
    select r.started_at from public.rush_runs r
    where r.player_id = auth.uid() and r.day = public.rush_today()
  ),
  today_board as (
    select s.player_id, row_number() over (order by s.score desc, s.achieved_at) as board_rank
    from public.rush_scores s
    join public.profiles p on p.id = s.player_id
    where s.day = public.rush_today()
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
    exists (select 1 from today_run),
    (select s.score from public.rush_scores s where s.player_id = auth.uid() and s.day = public.rush_today()),
    (select started_at from today_run),
    (select t.board_rank from today_board t where t.player_id = auth.uid()),
    (select max(s.score) from public.rush_scores s where s.player_id = auth.uid()),
    -- A streak survives until a full day is missed: it counts if the latest score is today or yesterday
    coalesce((
      select count(*)::integer from my_days d, latest l
      where d.grp = l.grp and l.day >= public.rush_today() - 1
    ), 0),
    (select count(*)::integer from my_days);
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

  -- Filed under the day the run started, so a run that crosses midnight counts for that day
  -- Keeps the day's best. From Rush #1 on there's one run a day, so this only matters for
  -- practice runs logged before then.
  insert into public.rush_scores as s (player_id, day, score)
  values (auth.uid(), run.day, final_score)
  on conflict (player_id, day) do update
    set score = excluded.score, achieved_at = now()
    where excluded.score > s.score;

  return query select * from public.my_rush_stats();
end;
$$;

revoke execute on function public.my_rush_stats(), public.submit_rush(uuid, integer) from public, anon, authenticated;
grant execute on function public.my_rush_stats(), public.submit_rush(uuid, integer) to authenticated;
