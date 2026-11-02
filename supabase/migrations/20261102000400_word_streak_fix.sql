-- Morning Word: losing today now ends the current streak (it used to survive a loss when
-- the previous day was a win). Sunshine now takes its day from rush_today(), like the
-- other games, instead of its own copy of the Central-time math.

create or replace function public.my_word_stats()
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
    -- A streak is alive if its last win was today or yesterday and no loss came after it
    coalesce((select r.length from runs r
              where r.last_day >= public.rush_today() - 1
                and r.last_day = (select max(f.day) from finished f)), 0),
    coalesce((select max(r.length) from runs r), 0),
    array(select (select count(*)::integer from finished f where f.solved and f.tries = n)
          from generate_series(1, 6) as n);
$$;

create or replace function public.submit_sunrise_score(submitted_words text[], final_score integer default null)
returns table (score integer, words text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := public.rush_today();
  board text[];
  kept text[];
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select b.rings into board from public.sunrise_boards b where b.game_date = today;
  if board is null then
    raise exception 'no_board_today';
  end if;

  -- Today's earlier words plus the new ones, each checked against the dictionary and board
  select coalesce(array_agg(w order by first_seen), '{}') into kept
  from (
    select upper(trim(x.w)) as w, min(x.ord) as first_seen
    from unnest(
      coalesce((select s.found_word_list from public.sunrise_scores s
                where s.player_id = auth.uid() and s.game_date = today), '{}')
      || coalesce(submitted_words[1:200], '{}')
    ) with ordinality as x (w, ord)
    group by upper(trim(x.w))
  ) candidates
  where exists (select 1 from public.sunrise_words d where d.word = candidates.w)
    and public.sunrise_board_spells(board, candidates.w);

  insert into public.sunrise_scores as s (player_id, game_date, score, words_found, found_word_list)
  values (
    auth.uid(), today,
    (select coalesce(sum(public.sunrise_word_score(k)), 0) from unnest(kept) k),
    coalesce(array_length(kept, 1), 0),
    kept
  )
  on conflict (player_id, game_date) do update set
    score = excluded.score,
    words_found = excluded.words_found,
    found_word_list = excluded.found_word_list;

  return query
  select s.score, s.found_word_list from public.sunrise_scores s
  where s.player_id = auth.uid() and s.game_date = today;
end;
$$;
