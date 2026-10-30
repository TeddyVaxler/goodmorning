-- Player profiles: one row per Supabase auth user. Players sign in anonymously (no email),
-- then pick an @handle and enter a first and last name.
--
-- Privacy: only the handle is ever public (via public_profiles below).
-- First and last name are readable by the player who owns the row, and nobody else.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Stored lowercase without the leading "@"; the app adds the "@" for display
  handle text not null,
  first_name text not null,
  last_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_handle_format check (handle ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_first_name_length check (char_length(btrim(first_name)) between 1 and 50),
  constraint profiles_last_name_length check (char_length(btrim(last_name)) between 1 and 50)
);

create unique index profiles_handle_key on public.profiles (handle);

-- Keep updated_at current on every edit
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Row level security: players can only see and change their own row
alter table public.profiles enable row level security;

create policy "Players can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Players can create their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "Players can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Public face of a player: id and handle only, for the leaderboard and "is this handle taken?".
-- The view runs with its owner's rights (security_invoker is off), so it can list every
-- player past the RLS above while never exposing name columns.
create view public.public_profiles as
  select id, handle from public.profiles;

revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to anon, authenticated;
