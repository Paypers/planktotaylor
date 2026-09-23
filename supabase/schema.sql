-- Plank to Taylor: accounts, sync and the global daily counter.
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.

-- One row per finished plank: today's song once a day, and any number of ladder levels a day
-- (each song once a day).
create table if not exists public.plank_completions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  mode text not null check (mode in ('daily', 'ladder')),
  song_id text not null,
  level int check (level is null or level >= 1),
  seconds int not null check (seconds > 0),
  completed_at timestamptz not null default now(),
  -- Breaks taken during the plank: [{ "at": seconds into the song, "ms": length }]. Null = none.
  pauses jsonb,
  -- XP the plank earned. A plank that counted twice carries it on one row only.
  xp int check (xp is null or xp >= 0),
  primary key (user_id, day, mode, song_id)
);
-- For databases created before pauses, XP, and more than one ladder level a day.
alter table public.plank_completions add column if not exists pauses jsonb;
alter table public.plank_completions add column if not exists xp int check (xp is null or xp >= 0);
alter table public.plank_completions drop constraint if exists plank_completions_pkey;
alter table public.plank_completions add primary key (user_id, day, mode, song_id);

-- Where each user is on the shortest-to-longest ladder, and the name and photo they chose.
create table if not exists public.plank_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  ladder_level int not null default 1 check (ladder_level >= 1),
  updated_at timestamptz not null default now(),
  display_name text check (char_length(display_name) <= 40),
  avatar_url text
);
-- For databases created before names and photos.
alter table public.plank_profiles add column if not exists display_name text check (char_length(display_name) <= 40);
alter table public.plank_profiles add column if not exists avatar_url text;

-- Profile photos: a public bucket (anyone with the link can see a photo), where each player can only
-- add, replace or remove the one file in their own folder. The site shrinks photos to about 20 KB first.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "read avatars" on storage.objects;
drop policy if exists "add own avatar" on storage.objects;
drop policy if exists "replace own avatar" on storage.objects;
drop policy if exists "remove own avatar" on storage.objects;
create policy "read avatars" on storage.objects for select using (bucket_id = 'avatars');
create policy "add own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "replace own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "remove own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Every plank attempt, finished or not: when it began, how far into the song it got, and how it
-- ended. Players can add to their own record but never change or remove it.
create table if not exists public.plank_attempts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id uuid not null,
  song_id text not null,
  kind text not null check (kind in ('daily', 'ladder', 'practice', 'extra')),
  level int check (level is null or level >= 1),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  outcome text not null check (outcome in ('finished', 'gave-up', 'stopped', 'left', 'offline')),
  -- Seconds into the song it got to.
  reached numeric(6, 1) not null check (reached >= 0),
  pauses int not null default 0 check (pauses >= 0),
  primary key (user_id, id)
);
create index if not exists plank_attempts_recent on public.plank_attempts (user_id, started_at desc);

alter table public.plank_attempts enable row level security;
drop policy if exists "read own attempts" on public.plank_attempts;
drop policy if exists "add own attempts" on public.plank_attempts;
create policy "read own attempts" on public.plank_attempts for select to authenticated using (auth.uid() = user_id);
create policy "add own attempts" on public.plank_attempts for insert to authenticated with check (auth.uid() = user_id);
grant select, insert on public.plank_attempts to authenticated;
revoke update, delete, truncate on public.plank_attempts from anon, authenticated;

-- "N people planked today's song". Anonymous visitors count too.
create table if not exists public.daily_counts (
  day date primary key,
  planks int not null default 0
);

alter table public.plank_completions enable row level security;
alter table public.plank_profiles enable row level security;
alter table public.daily_counts enable row level security;

drop policy if exists "read own planks" on public.plank_completions;
drop policy if exists "add own planks" on public.plank_completions;
drop policy if exists "update own planks" on public.plank_completions;
create policy "read own planks" on public.plank_completions for select to authenticated using (auth.uid() = user_id);
create policy "add own planks" on public.plank_completions for insert to authenticated with check (auth.uid() = user_id);
create policy "update own planks" on public.plank_completions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "read own profile" on public.plank_profiles;
drop policy if exists "add own profile" on public.plank_profiles;
drop policy if exists "update own profile" on public.plank_profiles;
create policy "read own profile" on public.plank_profiles for select to authenticated using (auth.uid() = user_id);
create policy "add own profile" on public.plank_profiles for insert to authenticated with check (auth.uid() = user_id);
create policy "update own profile" on public.plank_profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "anyone reads daily counts" on public.daily_counts;
create policy "anyone reads daily counts" on public.daily_counts for select to anon, authenticated using (true);

grant select, insert, update on public.plank_completions to authenticated;
grant select, insert, update on public.plank_profiles to authenticated;
grant select on public.daily_counts to anon, authenticated;

-- Counts can only move up by one, and only for roughly "today" (visitors are in every timezone).
create or replace function public.bump_daily(p_day date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  total int;
begin
  if p_day < current_date - 1 or p_day > current_date + 1 then
    raise exception 'day out of range';
  end if;
  insert into public.daily_counts as d (day, planks) values (p_day, 1)
  on conflict (day) do update set planks = d.planks + 1
  returning d.planks into total;
  return total;
end;
$$;

revoke all on function public.bump_daily(date) from public;
grant execute on function public.bump_daily(date) to anon, authenticated;
