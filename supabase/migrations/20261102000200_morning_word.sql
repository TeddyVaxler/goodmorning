-- Morning Word: a daily five-letter word game, one puzzle per Central-time day.
--
-- The answer never leaves the server until the player's game is over. Guesses are checked
-- here (against the word list, and for their colors), so boards, the leaderboard and stats
-- can't be faked from the browser.
--
-- word_allowed is seeded by 20261102000300_seed_word_allowed.sql. word_answers is filled by
-- scripts/seed-morning-word.mjs straight into the database, so the daily order isn't in git.

create table public.word_allowed (
  word text primary key check (word ~ '^[A-Z]{5}$')
);

create table public.word_answers (
  day date primary key,
  word text not null unique check (word ~ '^[A-Z]{5}$')
);

create table public.word_games (
  player_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  guesses text[] not null default '{}',
  solved boolean not null default false,
  started_at timestamptz not null default now(), -- First opened today's puzzle
  finished_at timestamptz,
  primary key (player_id, day)
);

-- No policies: everything goes through the functions below
alter table public.word_allowed enable row level security;
alter table public.word_answers enable row level security;
alter table public.word_games enable row level security;
revoke all on public.word_allowed, public.word_answers, public.word_games from anon, authenticated;

-- ==========================================
-- HELPERS
-- ==========================================

-- Colors for one guess: G = right spot, Y = in the word elsewhere, B = not in the word.
-- Repeated letters only light up as many times as the answer has them, greens first.
create function public.word_feedback(guess text, answer text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  result text[] := array['B', 'B', 'B', 'B', 'B'];
  unmatched text[] := '{}';
  pos integer;
begin
  for i in 1..5 loop
    if substr(guess, i, 1) = substr(answer, i, 1) then
      result[i] := 'G';
    else
      unmatched := unmatched || substr(answer, i, 1);
    end if;
  end loop;

  for i in 1..5 loop
    if result[i] = 'B' then
      pos := array_position(unmatched, substr(guess, i, 1));
      if pos is not null then
        result[i] := 'Y';
        unmatched := unmatched[1:pos - 1] || unmatched[pos + 1:];
      end if;
    end if;
  end loop;

  return array_to_string(result, '');
end;
$$;

-- The player's game for a day, with colors. The answer is only included once the game is over.
create function public.word_state(player uuid, for_day date)
returns table (
  day date,
  puzzle_number integer,
  guesses text[],
  feedback text[],
  solved boolean,
  finished boolean,
  answer text
)
language sql
stable
set search_path = ''
as $$
  select
    a.day,
    (a.day - (select min(x.day) from public.word_answers x))::integer + 1,
    coalesce(g.guesses, '{}'),
    coalesce((select array_agg(public.word_feedback(t.guess, a.word) order by t.n)
              from unnest(g.guesses) with ordinality as t (guess, n)), '{}'),
    coalesce(g.solved, false),
    g.finished_at is not null,
    case when g.finished_at is not null then a.word end
  from public.word_answers a
  left join public.word_games g on g.player_id = player and g.day = a.day
  where a.day = for_day;
$$;

-- ==========================================
-- PLAYING
-- ==========================================

-- Today's puzzle for the signed-in player; opening it starts their clock
create function public.my_word_game()
returns table (
  day date,
  puzzle_number integer,
  guesses text[],
  feedback text[],
  solved boolean,
  finished boolean,
  answer text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  if not exists (select 1 from public.word_answers a where a.day = public.rush_today()) then
    raise exception 'no_word_today';
  end if;

  insert into public.word_games (player_id, day)
  values (auth.uid(), public.rush_today())
  on conflict do nothing;

  return query select * from public.word_state(auth.uid(), public.rush_today());
end;
$$;

-- Plays one guess. Raises not_a_word (not in the list) or game_over (already finished).
create function public.submit_word_guess(guess text)
returns table (
  day date,
  puzzle_number integer,
  guesses text[],
  feedback text[],
  solved boolean,
  finished boolean,
  answer text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := public.rush_today();
  entry text := upper(trim(guess));
  target text;
  game public.word_games;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  select a.word into target from public.word_answers a where a.day = today;
  if target is null then
    raise exception 'no_word_today';
  end if;
  if not exists (select 1 from public.word_allowed w where w.word = entry) then
    raise exception 'not_a_word';
  end if;

  insert into public.word_games (player_id, day)
  values (auth.uid(), today)
  on conflict do nothing;

  -- Lock the row so two quick submits can't both become guess six
  select * into game from public.word_games g
  where g.player_id = auth.uid() and g.day = today
  for update;

  if game.finished_at is not null then
    raise exception 'game_over';
  end if;

  update public.word_games g set
    guesses = g.guesses || entry,
    solved = (entry = target),
    finished_at = case when entry = target or cardinality(g.guesses) + 1 >= 6 then now() end
  where g.player_id = auth.uid() and g.day = today;

  return query select * from public.word_state(auth.uid(), today);
end;
$$;

-- ==========================================
-- STATS AND LEADERBOARD
-- ==========================================

-- Lifetime stats: games finished, wins, streaks of solved days, and how many guesses wins took
create function public.my_word_stats()
returns table (
  played integer,
  wins integer,
  current_streak integer,
  max_streak integer,
  distribution integer[] -- Wins in 1 guess, 2 guesses, ... 6 guesses
)
language sql
stable
security definer
set search_path = ''
as $$
  with finished as (
    select g.day, g.solved, cardinality(g.guesses) as tries
    from public.word_games g
    where g.player_id = auth.uid() and g.finished_at is not null
  ),
  -- Runs of consecutive solved days
  runs as (
    select min(f.day) as first_day, max(f.day) as last_day, count(*)::integer as length
    from (
      select f.day, f.day - (row_number() over (order by f.day))::integer as grp
      from finished f where f.solved
    ) f
    group by f.grp
  )
  select
    (select count(*)::integer from finished),
    (select count(*)::integer from finished where solved),
    -- A streak is still alive if its last win was today or yesterday
    coalesce((select r.length from runs r where r.last_day >= public.rush_today() - 1
              order by r.last_day desc limit 1), 0),
    coalesce((select max(r.length) from runs r), 0),
    array(select (select count(*)::integer from finished f where f.solved and f.tries = n)
          from generate_series(1, 6) as n);
$$;

-- Today's finished games among players with a handle: solved first, then fewest guesses,
-- then fastest from opening the puzzle to solving it
create function public.get_word_leaderboard()
returns table (
  rank integer,
  handle text,
  guesses integer,
  solved boolean,
  seconds integer,
  is_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (row_number() over (order by g.solved desc, cardinality(g.guesses), g.finished_at - g.started_at))::integer,
    p.handle,
    cardinality(g.guesses),
    g.solved,
    extract(epoch from g.finished_at - g.started_at)::integer,
    g.player_id = auth.uid()
  from public.word_games g
  join public.profiles p on p.id = g.player_id
  where g.day = public.rush_today() and g.finished_at is not null
  order by 1
  limit 50;
$$;

revoke execute on function
  public.word_feedback(text, text),
  public.word_state(uuid, date),
  public.my_word_game(),
  public.submit_word_guess(text),
  public.my_word_stats(),
  public.get_word_leaderboard()
from public, anon;

grant execute on function
  public.my_word_game(),
  public.submit_word_guess(text),
  public.my_word_stats(),
  public.get_word_leaderboard()
to authenticated;

notify pgrst, 'reload schema';
