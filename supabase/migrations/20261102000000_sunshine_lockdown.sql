-- Sunshine: score words on the server instead of trusting the browser.
--
-- sunrise_scores and submit_sunrise_score were created by hand in the dashboard; this
-- migration records them (create if not exists) and replaces the scoring function. Each
-- day's board is stored in sunrise_boards (seeded by scripts/seed-sunshine.mjs), and every
-- submitted word must be a dictionary word that the board can actually spell.
--
-- Also adds the newer idle-game achievements to set_my_badges.

-- ==========================================
-- SCORES (already live; recorded here)
-- ==========================================
create extension if not exists moddatetime with schema extensions;

create table if not exists public.sunrise_scores (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id),
  game_date date not null,
  score integer default 0,
  words_found integer default 0,
  found_word_list text[] default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (player_id, game_date)
);

alter table public.sunrise_scores enable row level security;

drop policy if exists "Scores are viewable by everyone" on public.sunrise_scores;
create policy "Scores are viewable by everyone" on public.sunrise_scores for select using (true);

-- Writes go through submit_sunrise_score only
revoke all on public.sunrise_scores from anon, authenticated;
grant select on public.sunrise_scores to anon, authenticated;

drop trigger if exists handle_updated_at on public.sunrise_scores;
create trigger handle_updated_at before update on public.sunrise_scores
  for each row execute function extensions.moddatetime(updated_at);

-- ==========================================
-- DICTIONARY AND BOARDS
-- ==========================================
create table public.sunrise_words (
  word text primary key check (word ~ '^[A-Z]{4,6}$')
);

-- rings: 6 strings of 12 letters, innermost first, '.' for an empty slot
create table public.sunrise_boards (
  game_date date primary key,
  rings text[] not null check (array_length(rings, 1) = 6),
  angles integer[] not null
);

alter table public.sunrise_words enable row level security;
alter table public.sunrise_boards enable row level security;

-- Boards are public so the game can load them; the dictionary stays server-side
create policy "Boards are viewable by everyone" on public.sunrise_boards for select using (true);
revoke all on public.sunrise_words, public.sunrise_boards from anon, authenticated;
grant select on public.sunrise_boards to anon, authenticated;

-- ==========================================
-- SCORING
-- ==========================================

-- Scrabble letter values, matching SCRABBLE_SCORES in lib/sunshine.ts
create function public.sunrise_word_score(word text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum(case ch
    when 'A' then 1 when 'B' then 3 when 'C' then 3 when 'D' then 2 when 'E' then 1
    when 'F' then 4 when 'G' then 2 when 'H' then 4 when 'I' then 1 when 'J' then 8
    when 'K' then 5 when 'L' then 1 when 'M' then 3 when 'N' then 1 when 'O' then 1
    when 'P' then 3 when 'Q' then 10 when 'R' then 1 when 'S' then 1 when 'T' then 1
    when 'U' then 1 when 'V' then 4 when 'W' then 4 when 'X' then 8 when 'Y' then 4
    when 'Z' then 10 else 1 end), 0)::integer
  from regexp_split_to_table(word, '') as ch;
$$;

-- Whether the board can spell the word along one spoke. Every ring turns on its own, so
-- each letter just has to be somewhere in its ring, on consecutive rings, read outward or inward.
create function public.sunrise_board_spells(rings text[], word text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
    from (values (word), (reverse(word))) as w (letters)
    cross join generate_series(0, 6 - length(word)) as start_ring
    where (
      select bool_and(strpos(rings[start_ring + j], substr(w.letters, j, 1)) > 0)
      from generate_series(1, length(word)) as j
    )
  );
$$;

-- The old versions trusted the browser's score (one of them also used the UTC day)
drop function if exists public.submit_sunrise_score(text[]);
drop function if exists public.submit_sunrise_score(text[], integer);

-- Records the player's words for today (Central time) and returns the server's tally.
-- Words that aren't real or aren't on the board are dropped. final_score is ignored; it
-- stays in the signature so older builds of the game keep working.
create function public.submit_sunrise_score(submitted_words text[], final_score integer default null)
returns table (score integer, words text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (timezone('America/Chicago', now()))::date;
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

revoke execute on function public.submit_sunrise_score(text[], integer) from public, anon;
grant execute on function public.submit_sunrise_score(text[], integer) to authenticated;
revoke execute on function public.sunrise_word_score(text), public.sunrise_board_spells(text[], text) from public, anon, authenticated;

-- ==========================================
-- BADGES: newer idle-game achievements
-- ==========================================
create or replace function public.set_my_badges(badge_ids text[])
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
    'promoted_1', 'promoted_5', 'promoted_9', 'own_all',
    'first_click', 'coffee_addict', 'passive_income', 'hoarder', 'office_party', 'davids_bday'
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

notify pgrst, 'reload schema';
