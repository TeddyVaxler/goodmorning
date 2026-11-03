-- Morning Word hard mode: any revealed hint must be used in later guesses. Green letters stay
-- in their spot and yellow letters must appear somewhere. Players switch it on before their
-- first guess of the day; the leaderboard and share text mark hard-mode games.
--
-- word_state, my_word_game, submit_word_guess and get_word_leaderboard gain a hard_mode column,
-- so they are dropped and recreated. Clients that predate it ignore the extra column.

alter table public.word_games add column hard_mode boolean not null default false;

drop function public.my_word_game();
drop function public.submit_word_guess(text);
drop function public.get_word_leaderboard();
drop function public.word_state(uuid, date);

create function public.word_state(player uuid, for_day date)
returns table (
  day date,
  puzzle_number integer,
  guesses text[],
  feedback text[],
  solved boolean,
  finished boolean,
  answer text,
  hard_mode boolean
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
    case when g.finished_at is not null then a.word end,
    coalesce(g.hard_mode, false)
  from public.word_answers a
  left join public.word_games g on g.player_id = player and g.day = a.day
  where a.day = for_day;
$$;

-- Why a guess breaks hard mode given one earlier guess and its colors, or null if it doesn't
create function public.word_hard_mode_miss(entry text, earlier text, marks text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  letter text;
  needed integer;
begin
  for i in 1..5 loop
    if substr(marks, i, 1) = 'G' and substr(entry, i, 1) <> substr(earlier, i, 1) then
      return 'Letter ' || i || ' must be ' || substr(earlier, i, 1);
    end if;
  end loop;

  -- Each hinted letter, as many times as it was hinted (two yellow Es need two Es)
  for letter, needed in
    select substr(earlier, n, 1), count(*)::integer
    from generate_series(1, 5) as n
    where substr(marks, n, 1) in ('G', 'Y')
    group by 1
  loop
    if length(entry) - length(replace(entry, letter, '')) < needed then
      return 'Guess must contain ' || letter;
    end if;
  end loop;

  return null;
end;
$$;

create function public.my_word_game()
returns table (
  day date,
  puzzle_number integer,
  guesses text[],
  feedback text[],
  solved boolean,
  finished boolean,
  answer text,
  hard_mode boolean
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

-- Turns hard mode on or off for today's game. Raises already_guessing once a guess is in.
create function public.set_word_hard_mode(enabled boolean)
returns table (
  day date,
  puzzle_number integer,
  guesses text[],
  feedback text[],
  solved boolean,
  finished boolean,
  answer text,
  hard_mode boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := public.rush_today();
  game public.word_games;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  if not exists (select 1 from public.word_answers a where a.day = today) then
    raise exception 'no_word_today';
  end if;

  insert into public.word_games (player_id, day)
  values (auth.uid(), today)
  on conflict do nothing;

  select * into game from public.word_games g
  where g.player_id = auth.uid() and g.day = today
  for update;

  if cardinality(game.guesses) > 0 and game.hard_mode is distinct from enabled then
    raise exception 'already_guessing';
  end if;

  update public.word_games g set hard_mode = enabled
  where g.player_id = auth.uid() and g.day = today;

  return query select * from public.word_state(auth.uid(), today);
end;
$$;

-- Plays one guess. Raises not_a_word, game_over, or "hard_mode: <reason>" when a hard-mode
-- guess ignores a hint.
create function public.submit_word_guess(guess text)
returns table (
  day date,
  puzzle_number integer,
  guesses text[],
  feedback text[],
  solved boolean,
  finished boolean,
  answer text,
  hard_mode boolean
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
  miss text;
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

  if game.hard_mode then
    select public.word_hard_mode_miss(entry, t.earlier, public.word_feedback(t.earlier, target))
    into miss
    from unnest(game.guesses) with ordinality as t (earlier, n)
    where public.word_hard_mode_miss(entry, t.earlier, public.word_feedback(t.earlier, target)) is not null
    order by t.n desc
    limit 1;
    if miss is not null then
      raise exception 'hard_mode: %', miss;
    end if;
  end if;

  update public.word_games g set
    guesses = g.guesses || entry,
    solved = (entry = target),
    finished_at = case when entry = target or cardinality(g.guesses) + 1 >= 6 then now() end
  where g.player_id = auth.uid() and g.day = today;

  return query select * from public.word_state(auth.uid(), today);
end;
$$;

create function public.get_word_leaderboard()
returns table (
  rank integer,
  handle text,
  guesses integer,
  solved boolean,
  seconds integer,
  is_me boolean,
  hard_mode boolean
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
    g.player_id = auth.uid(),
    g.hard_mode
  from public.word_games g
  join public.profiles p on p.id = g.player_id
  where g.day = public.rush_today() and g.finished_at is not null
  order by 1
  limit 50;
$$;

revoke execute on function
  public.word_state(uuid, date),
  public.word_hard_mode_miss(text, text, text),
  public.my_word_game(),
  public.set_word_hard_mode(boolean),
  public.submit_word_guess(text),
  public.get_word_leaderboard()
from public, anon;

grant execute on function
  public.my_word_game(),
  public.set_word_hard_mode(boolean),
  public.submit_word_guess(text),
  public.get_word_leaderboard()
to authenticated;

notify pgrst, 'reload schema';
