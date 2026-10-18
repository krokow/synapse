-- ============================================================
--  SYNAPSE — schéma Supabase
--  À coller tel quel dans Supabase > SQL Editor > New query > Run.
--  Le script est ré-exécutable (idempotent).
-- ============================================================

-- ---------- PROFILES (les "nœuds") ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null unique
              constraint username_format check (username ~ '^[A-Za-z0-9_-]{3,20}$'),
  avatar_hue  integer not null default 0
              constraint avatar_hue_range check (avatar_hue between 0 and 359),
  bio         text not null default ''
              constraint bio_length check (char_length(bio) <= 280),
  created_at  timestamptz not null default now()
);

-- Unicité insensible à la casse ("Choom" et "choom" = même pseudo)
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

-- ---------- RATINGS (les "impulsions") ----------
create table if not exists public.ratings (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  movie_id      integer not null,
  score         smallint not null constraint score_range check (score between 1 and 10),
  review        text constraint review_length check (review is null or char_length(review) <= 1000),
  title         text,
  poster_path   text,
  release_year  integer,
  genre_ids     integer[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, movie_id)
);

create index if not exists ratings_movie_id_idx on public.ratings (movie_id);

-- ---------- WATCHLIST ----------
create table if not exists public.watchlist (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  movie_id      integer not null,
  title         text,
  poster_path   text,
  release_year  integer,
  added_at      timestamptz not null default now(),
  primary key (user_id, movie_id)
);

-- ---------- updated_at automatique ----------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ratings_touch_updated_at on public.ratings;
create trigger ratings_touch_updated_at
  before update on public.ratings
  for each row execute function public.touch_updated_at();

-- ---------- Création du profil à l'inscription ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hue integer;
begin
  begin
    v_hue := (new.raw_user_meta_data ->> 'avatar_hue')::integer;
  exception when others then
    v_hue := null;
  end;
  if v_hue is null or v_hue < 0 or v_hue > 359 then
    v_hue := floor(random() * 360)::integer;
  end if;

  insert into public.profiles (id, username, avatar_hue)
  values (new.id, new.raw_user_meta_data ->> 'username', v_hue);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Vérification de disponibilité du pseudo ----------
create or replace function public.username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(name)
  );
$$;

grant execute on function public.username_available(text) to anon, authenticated;

-- ---------- RLS ----------
alter table public.profiles  enable row level security;
alter table public.ratings   enable row level security;
alter table public.watchlist enable row level security;

-- profiles
drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public" on public.profiles
  for select using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

-- ratings
drop policy if exists "ratings_select_public" on public.ratings;
create policy "ratings_select_public" on public.ratings
  for select using (true);

drop policy if exists "ratings_insert_own" on public.ratings;
create policy "ratings_insert_own" on public.ratings
  for insert with check (auth.uid() = user_id);

drop policy if exists "ratings_update_own" on public.ratings;
create policy "ratings_update_own" on public.ratings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ratings_delete_own" on public.ratings;
create policy "ratings_delete_own" on public.ratings
  for delete using (auth.uid() = user_id);

-- watchlist
drop policy if exists "watchlist_select_public" on public.watchlist;
create policy "watchlist_select_public" on public.watchlist
  for select using (true);

drop policy if exists "watchlist_insert_own" on public.watchlist;
create policy "watchlist_insert_own" on public.watchlist
  for insert with check (auth.uid() = user_id);

drop policy if exists "watchlist_update_own" on public.watchlist;
create policy "watchlist_update_own" on public.watchlist
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "watchlist_delete_own" on public.watchlist;
create policy "watchlist_delete_own" on public.watchlist
  for delete using (auth.uid() = user_id);
