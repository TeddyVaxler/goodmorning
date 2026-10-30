-- Morning Rush: a 30-second daily click sprint, and the leaderboard built on it.
--
-- Players never write scores directly. start_rush() records a server-side start time, and
-- submit_rush() only accepts a score for that run once a full round has passed and only if the
-- score is humanly possible. Both tables have RLS on with no policies, so the functions below
-- are the only way in or out.

create table public.rush_runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score integer
);

create index rush_runs_player_started_idx on public.rush_runs (player_id, started_at desc);

-- Each player's best score per day
create table public.rush_scores (
  player_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  score integer not null check (score >= 0),
  achieved_at timestamptz not null default now(),
  primary key (player_id, day)
);

create index rush_scores_day_score_idx on public.rush_scores (day, score desc, achieved_at);
-- Serves the all-time board, which takes each player's single best row
create index rush_scores_player_best_idx on public.rush_scores (player_id, score desc, achieved_at);

alter table public.rush_runs enable row level security;
alter table public.rush_scores enable row level security;

-- The leaderboard day rolls over at midnight US Central
create function public.rush_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Chicago')::date;
$$;

create function public.start_rush()
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

  -- Cap runs per day so one player can't flood the table
  if (
    select count(*) from public.rush_runs
    where player_id = auth.uid() and started_at > now() - interval '1 day'
  ) >= 300 then
    raise exception 'too_many_runs';
  end if;

  insert into public.rush_runs (player_id) values (auth.uid()) returning id into new_run_id;
  return new_run_id;
end;
$$;

-- The signed-in player's best today, rank today, and best ever. Rank only counts players who
-- have claimed a handle, since those are the only ones on the board.
create function public.my_rush_stats()
returns table (best_today integer, rank_today bigint, best_all_time integer)
language sql
stable
security definer
set search_path = ''
as $$
  with today_board as (
    select s.player_id, row_number() over (order by s.score desc, s.achieved_at) as board_rank
    from public.rush_scores s
    join public.profiles p on p.id = s.player_id
    where s.day = public.rush_today()
  )
  select
    (select s.score from public.rush_scores s where s.player_id = auth.uid() and s.day = public.rush_today()),
    (select t.board_rank from today_board t where t.player_id = auth.uid()),
    (select max(s.score) from public.rush_scores s where s.player_id = auth.uid());
$$;

create function public.submit_rush(run_id uuid, final_score integer)
returns table (best_today integer, rank_today bigint, best_all_time integer)
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
  insert into public.rush_scores as s (player_id, day, score)
  values (auth.uid(), (run.started_at at time zone 'America/Chicago')::date, final_score)
  on conflict (player_id, day) do update
    set score = excluded.score, achieved_at = now()
    where excluded.score > s.score;

  return query select * from public.my_rush_stats();
end;
$$;

-- Top 10 by handle, for today or all time. Player ids never leave the database; is_me lets
-- the app highlight the viewer's own row.
create function public.get_rush_leaderboard(period text default 'today')
returns table (rank bigint, handle text, score integer, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with best as (
    select distinct on (s.player_id) s.player_id, s.score, s.achieved_at
    from public.rush_scores s
    where period = 'all_time' or s.day = public.rush_today()
    order by s.player_id, s.score desc, s.achieved_at
  )
  select
    row_number() over (order by b.score desc, b.achieved_at),
    p.handle,
    b.score,
    coalesce(b.player_id = auth.uid(), false)
  from best b
  join public.profiles p on p.id = b.player_id
  order by b.score desc, b.achieved_at
  limit 10;
$$;

revoke execute on function
  public.rush_today(),
  public.start_rush(),
  public.my_rush_stats(),
  public.submit_rush(uuid, integer),
  public.get_rush_leaderboard(text)
from public, anon, authenticated;

grant execute on function public.start_rush(), public.my_rush_stats(), public.submit_rush(uuid, integer)
  to authenticated;
grant execute on function public.get_rush_leaderboard(text) to anon, authenticated;
