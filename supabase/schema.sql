-- Plank to Taylor: accounts, sync, the global daily counter, daily reminders, and the Discord daily post.
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.

-- One row per finished plank: today's song once a day, and any number of ladder levels a day
-- (each song once a day).
create table if not exists public.plank_completions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  -- 'era': a new release planked from its album page (Collect the eras), with no XP.
  mode text not null check (mode in ('daily', 'ladder', 'era')),
  song_id text not null,
  level int check (level is null or level >= 1),
  seconds int not null check (seconds > 0),
  completed_at timestamptz not null default now(),
  -- Breaks taken during the plank: [{ "at": seconds into the song, "ms": length }]. Null = none.
  pauses jsonb,
  -- XP the plank earned. A plank that counted twice carries it on one row only.
  xp int check (xp is null or xp >= 0),
  -- Aurora lights caught, on the same row as the XP. Null = none.
  lights int check (lights is null or lights between 0 and 50),
  primary key (user_id, day, mode, song_id)
);
-- For databases created before pauses, XP, more than one ladder level a day, and aurora lights.
alter table public.plank_completions add column if not exists pauses jsonb;
alter table public.plank_completions add column if not exists xp int check (xp is null or xp >= 0);
alter table public.plank_completions add column if not exists lights int check (lights is null or lights between 0 and 50);
alter table public.plank_completions drop constraint if exists plank_completions_pkey;
alter table public.plank_completions add primary key (user_id, day, mode, song_id);
-- For databases created before new releases could be planked from their album page.
alter table public.plank_completions drop constraint if exists plank_completions_mode_check;
alter table public.plank_completions add constraint plank_completions_mode_check check (mode in ('daily', 'ladder', 'era'));

-- Where each user is on the shortest-to-longest ladder, the name and photo they chose, and their
-- settings, so every device they sign in on looks and sounds the same.
create table if not exists public.plank_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  ladder_level int not null default 1 check (ladder_level >= 1),
  updated_at timestamptz not null default now(),
  display_name text check (char_length(display_name) <= 40),
  avatar_url text,
  -- Music, sound and aurora lights: { "music": bool, "sounds": bool, "lights": bool, "updatedAt": when last changed }.
  prefs jsonb check (octet_length(prefs::text) <= 1024),
  -- Custom themes: { "themes": [...], "updatedAt": ... }. Which theme shows is each device's own choice, so it
  -- stays in the browser. (Copies saved before that also have a "selected", which the site ignores.)
  theme jsonb check (octet_length(theme::text) <= 65536)
);
-- For databases created before names and photos, and before settings.
alter table public.plank_profiles add column if not exists display_name text check (char_length(display_name) <= 40);
alter table public.plank_profiles add column if not exists avatar_url text;
alter table public.plank_profiles add column if not exists prefs jsonb check (octet_length(prefs::text) <= 1024);
alter table public.plank_profiles add column if not exists theme jsonb check (octet_length(theme::text) <= 65536);

-- Profile photos: a public bucket (anyone with the link can see a photo). Each player has one file,
-- <their id>/avatar.jpg, that only they can add, replace or remove. The site shrinks photos to about 20 KB
-- JPEGs first, so nothing bigger or of another type gets in.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 262144, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Photos load through their public links, which need no policy. Reading through the API is only for
-- your own folder, so nobody can list the bucket (and with it every player's id).
drop policy if exists "read avatars" on storage.objects;
drop policy if exists "read own avatar" on storage.objects;
drop policy if exists "add own avatar" on storage.objects;
drop policy if exists "replace own avatar" on storage.objects;
drop policy if exists "remove own avatar" on storage.objects;
create policy "read own avatar" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "add own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and name = auth.uid()::text || '/avatar.jpg');
create policy "replace own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text || '/avatar.jpg')
  with check (bucket_id = 'avatars' and name = auth.uid()::text || '/avatar.jpg');
create policy "remove own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Every plank attempt, finished or not: when it began, how far into the song it got, and how it
-- ended. Players can add to their own record but never change or remove it.
create table if not exists public.plank_attempts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id uuid not null,
  song_id text not null,
  kind text not null check (kind in ('daily', 'ladder', 'practice', 'extra', 'era')),
  level int check (level is null or level >= 1),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  outcome text not null check (outcome in ('finished', 'gave-up', 'stopped', 'left', 'offline')),
  -- Seconds into the song it got to.
  reached numeric(6, 1) not null check (reached >= 0),
  pauses int not null default 0 check (pauses >= 0),
  -- Each break: [{ "at": seconds into the song, "ms": length }]. Null = none, or their times weren't kept.
  breaks jsonb,
  primary key (user_id, id)
);
create index if not exists plank_attempts_recent on public.plank_attempts (user_id, started_at desc);
-- For databases created before each break was timed.
alter table public.plank_attempts add column if not exists breaks jsonb;
-- For databases created before new releases could be planked from their album page.
alter table public.plank_attempts drop constraint if exists plank_attempts_kind_check;
alter table public.plank_attempts add constraint plank_attempts_kind_check check (kind in ('daily', 'ladder', 'practice', 'extra', 'era'));

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

-- How everyone did today, shown once you've planked today's song: the time held together, how many
-- held it with no breaks, and where in the song breaks bunched up (20 slots, each 5% of the song).
-- Anonymous like the counter, and a fun number like it too: nothing here says who.
alter table public.daily_counts add column if not exists no_break int not null default 0;
alter table public.daily_counts add column if not exists seconds bigint not null default 0;
alter table public.daily_counts add column if not exists break_slices int[] not null default array_fill(0, array[20]);

-- The +1, with how the plank went: the song's length in seconds, and each break's slot (0 to 19), at
-- most 20 of them. Returns the day's new totals. bump_daily(p_day) above stays for tabs opened before this.
create or replace function public.bump_daily(p_day date, p_seconds int, p_breaks int[])
returns public.daily_counts
language plpgsql
security definer
set search_path = public
as $$
declare
  breaks int[] := coalesce(p_breaks, '{}');
  slots int[] := array_fill(0, array[20]);
  slot int;
  totals public.daily_counts;
begin
  if p_day < current_date - 1 or p_day > current_date + 1 then
    raise exception 'day out of range';
  end if;
  if p_seconds is null or p_seconds < 1 or p_seconds > 3600 then
    raise exception 'seconds out of range';
  end if;
  if cardinality(breaks) > 20 then
    raise exception 'too many breaks';
  end if;
  foreach slot in array breaks loop
    if slot is null or slot < 0 or slot > 19 then
      raise exception 'break out of range';
    end if;
    slots[slot + 1] := slots[slot + 1] + 1;
  end loop;

  insert into public.daily_counts (day) values (p_day) on conflict (day) do nothing;
  update public.daily_counts d set
    planks = d.planks + 1,
    no_break = d.no_break + (case when cardinality(breaks) = 0 then 1 else 0 end),
    seconds = d.seconds + p_seconds,
    break_slices = array(select coalesce(d.break_slices[i], 0) + slots[i] from generate_series(1, 20) as i order by i)
  where d.day = p_day
  returning d.* into totals;
  return totals;
end;
$$;

revoke all on function public.bump_daily(date, int, int[]) from public;
grant execute on function public.bump_daily(date, int, int[]) to anon, authenticated;

-- Daily reminders (Web Push), for signed-in players: one row per device that turned them on, with when to
-- send (a quarter hour, in the player's time zone) and when each last went. The send-reminders Edge
-- Function reads and updates these with the service key; players see and change only their own.
create table if not exists public.push_subscriptions (
  -- Where the browser's push service takes it. Only the browsers' own push services: the same list is
  -- PUSH_SERVICE in src/lib/reminders.ts, so keep the two in step.
  endpoint text primary key check (
    char_length(endpoint) <= 1000
    and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'
  ),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  remind_at text not null default '09:00' check (remind_at ~ '^([01][0-9]|2[0-3]):(00|15|30|45)$'),
  time_zone text not null check (char_length(time_zone) between 1 and 64),
  evening boolean not null default false,
  last_morning date,
  last_evening date,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
drop policy if exists "read own reminders" on public.push_subscriptions;
drop policy if exists "add own reminders" on public.push_subscriptions;
drop policy if exists "change own reminders" on public.push_subscriptions;
drop policy if exists "remove own reminders" on public.push_subscriptions;
create policy "read own reminders" on public.push_subscriptions for select to authenticated using (auth.uid() = user_id);
create policy "add own reminders" on public.push_subscriptions for insert to authenticated with check (auth.uid() = user_id);
create policy "change own reminders" on public.push_subscriptions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "remove own reminders" on public.push_subscriptions for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.push_subscriptions to authenticated;
revoke all on public.push_subscriptions from anon;

-- At most 10 devices each, so nobody can fill the table.
create or replace function public.push_subscriptions_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.push_subscriptions where user_id = new.user_id) >= 10 then
    raise exception 'too many devices with reminders';
  end if;
  return new;
end;
$$;
revoke all on function public.push_subscriptions_limit() from public;
drop trigger if exists push_subscriptions_limit on public.push_subscriptions;
create trigger push_subscriptions_limit before insert on public.push_subscriptions
  for each row execute function public.push_subscriptions_limit();

-- The Discord daily post: channels whose webhook a signed-in player added (Settings → Discord). Each gets
-- today's song at 8:00 and how everyone did just after midnight (the day before's, once it's over) in its time zone, from the discord-post Edge
-- Function. A webhook's address is a secret (anyone who has it can post in that channel), so only the
-- discord-add function writes one, after checking it with Discord, and nobody can read one back through
-- the API: players see and change only the other columns of their own, and can remove them.
create table if not exists public.discord_webhooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Only Discord webhooks, in one form: the same pattern is DISCORD_WEBHOOK in src/lib/discord.ts, so keep
  -- the two in step.
  url text not null unique check (url ~ '^https://discord\.com/api/webhooks/[0-9]{17,20}/[A-Za-z0-9_-]{50,100}$'),
  -- One post a day per channel, whoever added it.
  channel_id text not null unique check (channel_id ~ '^[0-9]{17,20}$'),
  label text not null check (char_length(label) between 1 and 60),
  time_zone text not null check (char_length(time_zone) between 1 and 64),
  last_morning date,
  last_night date,
  created_at timestamptz not null default now()
);

alter table public.discord_webhooks enable row level security;
drop policy if exists "read own webhooks" on public.discord_webhooks;
drop policy if exists "change own webhooks" on public.discord_webhooks;
drop policy if exists "remove own webhooks" on public.discord_webhooks;
create policy "read own webhooks" on public.discord_webhooks for select to authenticated using (auth.uid() = user_id);
create policy "change own webhooks" on public.discord_webhooks for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "remove own webhooks" on public.discord_webhooks for delete to authenticated using (auth.uid() = user_id);
-- Column by column: never the address, never who added it or when it last posted.
revoke all on public.discord_webhooks from anon, authenticated;
grant select (id, label, time_zone, created_at) on public.discord_webhooks to authenticated;
grant update (time_zone) on public.discord_webhooks to authenticated;
grant delete on public.discord_webhooks to authenticated;

-- Every webhook added, kept a day, for the limits below. Removing a webhook doesn't take its sign-up back.
create table if not exists public.discord_signups (
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists discord_signups_at on public.discord_signups (at);
alter table public.discord_signups enable row level security;
revoke all on public.discord_signups from anon, authenticated;

-- The limits, whoever adds the row: 3 webhooks each at once (WEBHOOKS_EACH in src/lib/discord.ts), 10
-- sign-ups each a day, and 30 across the whole site an hour, so nobody can fill the table or use the
-- site to post in a lot of channels. The discord-add function tells players which one they hit.
create or replace function public.discord_webhooks_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- One sign-up at a time, so two at once can't both squeeze under a limit.
  perform pg_advisory_xact_lock(hashtext('discord_webhooks_limit'));
  if (select count(*) from public.discord_webhooks where user_id = new.user_id) >= 3 then
    raise exception 'too many discord webhooks';
  end if;
  if (select count(*) from public.discord_signups where user_id = new.user_id and at > now() - interval '1 day') >= 10 then
    raise exception 'too many discord sign-ups today';
  end if;
  if (select count(*) from public.discord_signups where at > now() - interval '1 hour') >= 30 then
    raise exception 'too many discord sign-ups this hour';
  end if;
  delete from public.discord_signups where at < now() - interval '1 day';
  insert into public.discord_signups (user_id) values (new.user_id);
  return new;
end;
$$;
revoke all on function public.discord_webhooks_limit() from public;
drop trigger if exists discord_webhooks_limit on public.discord_webhooks;
create trigger discord_webhooks_limit before insert on public.discord_webhooks
  for each row execute function public.discord_webhooks_limit();

-- Who a channel's posts ping (Settings → Discord): up to 5 people or roles each as Discord writes them
-- (<@id> a person, <@&id> a role, @everyone, @here), a space between. The same pattern is
-- DISCORD_MENTIONS in src/lib/discord.ts, so keep the two in step. The posts let Discord ping these and
-- nobody else.
alter table public.discord_webhooks add column if not exists mention text
  check (mention ~ '^(<@&?[0-9]{17,20}>|@everyone|@here)( (<@&?[0-9]{17,20}>|@everyone|@here)){0,4}$');
grant select (mention) on public.discord_webhooks to authenticated;
grant update (mention) on public.discord_webhooks to authenticated;

-- Groups: friends who plank together. This is the one place a player sees anything of anyone else's, so
-- every table still shows a player only their own rows. Members see each other only through group_board
-- (names, photos, the days they planked today's song, and whether today's was held with no breaks), and
-- anyone with a public group's link through group_invite. Never XP, breaks, attempts or the ladder.
-- Making, joining, leaving and changing a group all go through the functions below, which check the limits.
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  -- private: the group's day needs everyone; public: anyone, and its link shows the group. Fixed once made.
  kind text not null check (kind in ('private', 'public')),
  -- The invite link's code: random and unguessable. Anyone who has it can join.
  invite_code text not null unique check (invite_code ~ '^[0-9a-f]{20}$'),
  -- Who can rename it, make a new link and remove members: its maker, then whoever joined first.
  made_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The day they joined, in their own time zone: the group's days count them from here.
  joined_on date not null,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user on public.group_members (user_id);

-- Is the player a member of this group? Its own function, so the rules below can ask without reading
-- group_members through its own rule (which would go round in circles).
create or replace function public.in_group(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.group_members where group_id = p_group and user_id = auth.uid())
$$;
revoke all on function public.in_group(uuid) from public;
grant execute on function public.in_group(uuid) to authenticated;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
drop policy if exists "members read their groups" on public.groups;
drop policy if exists "members read their groups' members" on public.group_members;
create policy "members read their groups" on public.groups for select to authenticated using (public.in_group(id));
create policy "members read their groups' members" on public.group_members for select to authenticated using (public.in_group(group_id));
revoke all on public.groups, public.group_members from anon, authenticated;
grant select on public.groups, public.group_members to authenticated;

-- A day from the site is the player's today: within a day of the server's, whatever their time zone.
create or replace function public.group_day(p_day date)
returns date
language plpgsql
stable
set search_path = public
as $$
begin
  if p_day is null or p_day < current_date - 1 or p_day > current_date + 1 then
    raise exception 'day out of range';
  end if;
  return p_day;
end;
$$;

-- The player calling a group function: signed in, and with a name for the group to see.
create or replace function public.group_player()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'sign in first';
  end if;
  if not exists (select 1 from public.plank_profiles where user_id = me and btrim(coalesce(display_name, '')) <> '') then
    raise exception 'a name first';
  end if;
  return me;
end;
$$;
revoke all on function public.group_player() from public;

create or replace function public.group_code()
returns text
language sql
volatile
set search_path = public
as $$
  select substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 20)
$$;
revoke all on function public.group_code() from public;

create or replace function public.group_name(p_name text)
returns text
language plpgsql
immutable
as $$
begin
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 40 then
    raise exception 'a name of 1 to 40 characters';
  end if;
  return btrim(p_name);
end;
$$;

-- Makes a group, with its maker as its first member. At most 10 groups each.
create or replace function public.create_group(p_name text, p_kind text, p_today date)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.group_player();
  made public.groups;
begin
  if p_kind is null or p_kind not in ('private', 'public') then
    raise exception 'private or public';
  end if;
  -- One of the player's own group changes at a time, so two at once can't pass the limit together.
  perform pg_advisory_xact_lock(hashtext('group player ' || me::text));
  if (select count(*) from public.group_members where user_id = me) >= 10 then
    raise exception 'too many groups';
  end if;
  insert into public.groups (name, kind, invite_code, made_by)
  values (public.group_name(p_name), p_kind, public.group_code(), me)
  returning * into made;
  insert into public.group_members (group_id, user_id, joined_on) values (made.id, me, public.group_day(p_today));
  return made;
end;
$$;

-- Joins the group an invite code is for. At most 50 members, and 10 groups each. Joining again does nothing.
create or replace function public.join_group(p_code text, p_today date)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.group_player();
  found_group public.groups;
begin
  -- The group's row is held until this finishes, so two joining at once can't pass 50 together.
  select * into found_group from public.groups where invite_code = lower(btrim(coalesce(p_code, ''))) for update;
  if not found then
    raise exception 'no such group';
  end if;
  if exists (select 1 from public.group_members where group_id = found_group.id and user_id = me) then
    return found_group;
  end if;
  perform pg_advisory_xact_lock(hashtext('group player ' || me::text));
  if (select count(*) from public.group_members where user_id = me) >= 10 then
    raise exception 'too many groups';
  end if;
  if (select count(*) from public.group_members where group_id = found_group.id) >= 50 then
    raise exception 'group full';
  end if;
  insert into public.group_members (group_id, user_id, joined_on) values (found_group.id, me, public.group_day(p_today));
  return found_group;
end;
$$;

create or replace function public.leave_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.group_members where group_id = p_group and user_id = auth.uid();
end;
$$;

-- Only the group's maker (see made_by) can rename it, make a new link, or remove a member.
create or replace function public.group_maker(p_group uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.groups where id = p_group and made_by = auth.uid()) then
    raise exception 'only the group''s maker can do that';
  end if;
end;
$$;
revoke all on function public.group_maker(uuid) from public;

create or replace function public.rename_group(p_group uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.group_maker(p_group);
  update public.groups set name = public.group_name(p_name) where id = p_group;
end;
$$;

-- A new invite code: the old link stops working.
create or replace function public.new_group_code(p_group uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code text := public.group_code();
begin
  perform public.group_maker(p_group);
  update public.groups set invite_code = code where id = p_group;
  return code;
end;
$$;

create or replace function public.remove_from_group(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.group_maker(p_group);
  if p_user = auth.uid() then
    raise exception 'leave the group instead';
  end if;
  delete from public.group_members where group_id = p_group and user_id = p_user;
end;
$$;

-- Whoever leaves (or is removed, or deletes their account): the last one out takes the group with them,
-- and if the maker went, the member who joined first takes over.
create or replace function public.group_members_left()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Their Discord channels stop posting the group.
  update public.discord_webhooks set group_id = null where group_id = old.group_id and user_id = old.user_id;
  if not exists (select 1 from public.group_members where group_id = old.group_id) then
    delete from public.groups where id = old.group_id;
  elsif exists (select 1 from public.groups where id = old.group_id and (made_by is null or made_by = old.user_id)) then
    update public.groups
    set made_by = (select user_id from public.group_members where group_id = old.group_id order by joined_at, user_id limit 1)
    where id = old.group_id;
  end if;
  return null;
end;
$$;
revoke all on function public.group_members_left() from public;
drop trigger if exists group_members_left on public.group_members;
create trigger group_members_left after delete on public.group_members
  for each row execute function public.group_members_left();

-- The group page's one way in to other players' planks, for members only: for each member, their name
-- and photo, the day they joined, the days they planked today's song, and whether `p_today`'s was held
-- with no breaks (null if they haven't planked it). Nothing else.
create or replace function public.group_board(p_group uuid, p_today date)
returns table (user_id uuid, name text, avatar_url text, joined_on date, days date[], clean_today boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.in_group(p_group) then
    raise exception 'not in this group';
  end if;
  perform public.group_day(p_today);
  return query
  select
    m.user_id,
    coalesce(nullif(btrim(p.display_name), ''), 'A planker'),
    p.avatar_url,
    m.joined_on,
    coalesce((select array_agg(c.day order by c.day) from public.plank_completions c where c.user_id = m.user_id and c.mode = 'daily'), '{}'::date[]),
    (select c.pauses is null or jsonb_array_length(c.pauses) = 0
     from public.plank_completions c
     where c.user_id = m.user_id and c.mode = 'daily' and c.day = p_today)
  from public.group_members m
  left join public.plank_profiles p on p.user_id = m.user_id
  where m.group_id = p_group
  order by m.joined_at, m.user_id;
end;
$$;

-- What an invite link shows, before joining. A public group: its name, how many members, the days anyone
-- in it planked (for the group streak), and this month's contributors (name, photo, days planked), to
-- anyone with the link. A private group: its name and size to signed-in players only; nothing at all
-- signed out. Null for a code that isn't anyone's.
create or replace function public.group_invite(p_code text, p_today date)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  found_group public.groups;
  members int;
  mine boolean;
  month_start date;
begin
  perform public.group_day(p_today);
  select * into found_group from public.groups where invite_code = lower(btrim(coalesce(p_code, '')));
  if not found then
    return null;
  end if;
  if found_group.kind = 'private' and me is null then
    return json_build_object('kind', 'private');
  end if;
  members := (select count(*) from public.group_members where group_id = found_group.id);
  mine := me is not null and exists (select 1 from public.group_members where group_id = found_group.id and user_id = me);
  if found_group.kind = 'private' then
    return json_build_object('kind', 'private', 'name', found_group.name, 'members', members, 'id', case when mine then found_group.id end);
  end if;
  month_start := date_trunc('month', p_today)::date;
  return json_build_object(
    'kind', 'public',
    'name', found_group.name,
    'members', members,
    'id', case when mine then found_group.id end,
    'days', coalesce((
      select json_agg(d order by d)
      from (
        select distinct c.day as d
        from public.group_members m
        join public.plank_completions c on c.user_id = m.user_id and c.mode = 'daily' and c.day >= m.joined_on
        where m.group_id = found_group.id
      ) s
    ), '[]'::json),
    'contributors', coalesce((
      select json_agg(json_build_object('name', x.name, 'avatar_url', x.avatar_url, 'days', x.days) order by x.days desc, x.name)
      from (
        select
          coalesce(nullif(btrim(p.display_name), ''), 'A planker') as name,
          p.avatar_url,
          (select count(*) from public.plank_completions c
           where c.user_id = m.user_id and c.mode = 'daily' and c.day >= greatest(m.joined_on, month_start) and c.day <= p_today) as days
        from public.group_members m
        left join public.plank_profiles p on p.user_id = m.user_id
        where m.group_id = found_group.id
      ) x
    ), '[]'::json)
  );
end;
$$;

-- A Discord channel can post a group at night, instead of how everyone did: its streak, and who planked
-- today with their names and photos (Settings → Discord). Any member of a public group can choose that
-- (anyone with its link can see it already); only the maker of a private one. Leaving the group stops
-- it (group_members_left, above), and every member sees where it's posted (group_discord, below).
alter table public.discord_webhooks add column if not exists group_id uuid references public.groups (id) on delete set null;
grant select (group_id) on public.discord_webhooks to authenticated;
grant update (group_id) on public.discord_webhooks to authenticated;

create or replace function public.discord_webhooks_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.group_id is not null and not exists (
    select 1
    from public.groups g
    join public.group_members m on m.group_id = g.id and m.user_id = new.user_id
    where g.id = new.group_id and (g.kind = 'public' or g.made_by = new.user_id)
  ) then
    raise exception 'not allowed to post that group';
  end if;
  return new;
end;
$$;
revoke all on function public.discord_webhooks_group() from public;
drop trigger if exists discord_webhooks_group on public.discord_webhooks;
create trigger discord_webhooks_group before insert or update of group_id on public.discord_webhooks
  for each row execute function public.discord_webhooks_group();

-- Where a group is posted, for its members: each channel's name in the list of whoever added it, and
-- their name. Never the webhook's address.
create or replace function public.group_discord(p_group uuid)
returns table (label text, added_by text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.in_group(p_group) then
    raise exception 'not in this group';
  end if;
  return query
  select w.label, coalesce(nullif(btrim(p.display_name), ''), 'A planker')
  from public.discord_webhooks w
  left join public.plank_profiles p on p.user_id = w.user_id
  where w.group_id = p_group
  order by w.created_at;
end;
$$;

revoke all on function public.group_discord(uuid) from public;
grant execute on function public.group_discord(uuid) to authenticated;
revoke all on function public.create_group(text, text, date) from public;
revoke all on function public.join_group(text, date) from public;
revoke all on function public.leave_group(uuid) from public;
revoke all on function public.rename_group(uuid, text) from public;
revoke all on function public.new_group_code(uuid) from public;
revoke all on function public.remove_from_group(uuid, uuid) from public;
revoke all on function public.group_board(uuid, date) from public;
revoke all on function public.group_invite(text, date) from public;
grant execute on function public.create_group(text, text, date) to authenticated;
grant execute on function public.join_group(text, date) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.rename_group(uuid, text) to authenticated;
grant execute on function public.new_group_code(uuid) to authenticated;
grant execute on function public.remove_from_group(uuid, uuid) to authenticated;
grant execute on function public.group_board(uuid, date) to authenticated;
grant execute on function public.group_invite(text, date) to anon, authenticated;

-- The schedules: every 15 minutes, call the send-reminders function (only when anyone has reminders on)
-- and the discord-post function (only when any channel has the daily post). They need the pg_cron and
-- pg_net extensions (Database → Extensions) and two secrets in Vault, reminders_url and reminders_secret
-- (`npm run vapid` prints the lines). The Discord one is called at the same address with its own name on
-- the end, and with the same secret. Until the extensions are on, this does nothing, so the rest of the
-- script still runs. Scheduling again by the same name updates it.
do $schedule$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('send-reminders', '*/15 * * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      )
      where exists (select 1 from public.push_subscriptions)
    $job$);
    perform cron.schedule('discord-post', '*/15 * * * *', $job$
      select net.http_post(
        url := regexp_replace((select decrypted_secret from vault.decrypted_secrets where name = 'reminders_url'), 'send-reminders/?$', 'discord-post'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      )
      where exists (select 1 from public.discord_webhooks)
    $job$);
  end if;
end
$schedule$;

-- Limits on what a player can store, so nobody can fill the database through their own rows.
-- "not valid" checks new and changed rows only, so older rows never stop this script.
-- The most a plank can earn is double its seconds (no breaks on a 6-minute-plus song), plus 5 for each
-- aurora light caught: that 5 is LIGHT_XP in src/lib/xp.ts, so keep the two in step.
-- A plank keeps its first 100 breaks, and an attempt its breaks only up to 100: BREAKS_PER_PLANK in
-- src/lib/account.ts, so keep the two in step.
alter table public.plank_completions drop constraint if exists plank_completions_limits;
alter table public.plank_completions add constraint plank_completions_limits check (
  char_length(song_id) <= 100
  and seconds <= 3600
  and (xp is null or xp <= 2 * seconds + 5 * coalesce(lights, 0))
  and (pauses is null or case
    when jsonb_typeof(pauses) = 'array' then jsonb_array_length(pauses) <= 100 and octet_length(pauses::text) <= 4000
    else false
  end)
) not valid;

alter table public.plank_attempts drop constraint if exists plank_attempts_limits;
alter table public.plank_attempts add constraint plank_attempts_limits check (
  char_length(song_id) <= 100 and reached <= 3600 and pauses <= 1000
  and (breaks is null or case
    when jsonb_typeof(breaks) = 'array' then jsonb_array_length(breaks) <= 100 and octet_length(breaks::text) <= 4000
    else false
  end)
) not valid;

-- A photo link can only be the player's own photo, with the version the site adds to get past caches.
-- The host can't be checked here, so the site and the functions check it before showing or fetching one:
-- a link to any other server would tell it who opened the page.
create or replace function public.is_own_photo_link(p_link text, p_user uuid)
returns boolean
language sql
immutable
as $$
  select p_link ~ ('^https://[^/?#@]+/storage/v1/object/public/avatars/' || p_user::text || '/avatar\.jpg(\?v=[0-9]{1,16})?$')
$$;
-- Any other link is cleared first. The site shows none of them anyway, and one would stop its row changing.
update public.plank_profiles set avatar_url = null
where avatar_url is not null and not public.is_own_photo_link(avatar_url, user_id);
alter table public.plank_profiles drop constraint if exists plank_profiles_avatar;
alter table public.plank_profiles add constraint plank_profiles_avatar check (
  avatar_url is null or public.is_own_photo_link(avatar_url, user_id)
) not valid;

-- At most 10,000 planks and 20,000 attempts each: years of the keenest planking, but nowhere near enough
-- for one account to fill the database. Raise them here if anyone ever gets close.
-- Checked once per insert, only for the players it added rows for.
create or replace function public.rows_each_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  over boolean;
begin
  execute format(
    'select exists (select 1 from (select distinct user_id from added) a where (select count(*) from %I.%I t where t.user_id = a.user_id) > $1)',
    tg_table_schema,
    tg_table_name
  ) into over using tg_argv[0]::int;
  if over then
    raise exception 'too many rows in %', tg_table_name;
  end if;
  return null;
end;
$$;
revoke all on function public.rows_each_limit() from public;
drop trigger if exists plank_completions_limit on public.plank_completions;
create trigger plank_completions_limit after insert on public.plank_completions
  referencing new table as added
  for each statement execute function public.rows_each_limit('10000');
drop trigger if exists plank_attempts_limit on public.plank_attempts;
create trigger plank_attempts_limit after insert on public.plank_attempts
  referencing new table as added
  for each statement execute function public.rows_each_limit('20000');

-- Planking now: each group has a private Realtime channel, group-planking:<group id>, where members' devices
-- say they're planking (Realtime presence: their user id, and until when). Only the group's members can join
-- it, see who's planking in it, or say they are. Nothing is stored: presence lasts while the device is there.
create or replace function public.planking_channel_member(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_topic ~ '^group-planking:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.in_group(substr(p_topic, 16)::uuid)
    else false
  end
$$;
revoke all on function public.planking_channel_member(text) from public;
grant execute on function public.planking_channel_member(text) to authenticated;

drop policy if exists "group members see who's planking" on realtime.messages;
create policy "group members see who's planking" on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'presence' and public.planking_channel_member(realtime.topic()));
drop policy if exists "group members say they're planking" on realtime.messages;
create policy "group members say they're planking" on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'presence' and public.planking_channel_member(realtime.topic()));

-- Friends: players who add each other, one to one (docs/roadmap-parts/part-13-friends.md). Nobody reads these
-- tables directly: everything goes through the functions below, which check who's asking. A friend sees the
-- same as a group does (name, photo, whether today's song is planked and if with no breaks) plus whether
-- they're online or planking now, unless they've hidden it. Never XP, breaks, attempts, rank or the ladder.
-- There's no search: people find each other by a friend code, or through a group they share.

-- Each player's friend code, whether friends see them online, when the site last checked in, and until when
-- they're planking. Made the first time it's needed.
create table if not exists public.friend_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- 8 of 23456789ABCDEFGHJKLMNPQRSTUVWXYZ (no 0, O, 1 or I), shown as XXXX-XXXX. FRIEND_CODE in src/lib/friends.ts.
  code text not null unique check (code ~ '^[2-9A-HJ-NP-Z]{8}$'),
  show_online boolean not null default true,
  seen_at timestamptz,
  planking_until timestamptz
);

-- One row per pair of friends, the smaller id first.
create table if not exists public.friendships (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  since timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists friendships_b on public.friendships (user_b);

create table if not exists public.friend_requests (
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_user, to_user),
  check (from_user <> to_user)
);
create index if not exists friend_requests_to on public.friend_requests (to_user);

-- Who each player has blocked. Requests and invites between the two then go nowhere, either way.
create table if not exists public.friend_blocks (
  blocker uuid not null references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index if not exists friend_blocks_blocked on public.friend_blocks (blocked);

-- An invite from a friend: into a plank-together room (its code and song, for 30 minutes), or into a group
-- (for 7 days). One at a time from each friend for rooms, and one for each group.
create table if not exists public.friend_invites (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('room', 'group')),
  room_code text check (room_code ~ '^[a-z0-9]{10}$'),
  song_id text check (song_id ~ '^[a-z0-9-]{1,100}$'),
  group_id uuid references public.groups (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (
    (kind = 'room' and room_code is not null and song_id is not null and group_id is null)
    or (kind = 'group' and group_id is not null and room_code is null and song_id is null)
  )
);
create unique index if not exists friend_invites_one on public.friend_invites (from_user, to_user, kind, coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists friend_invites_to on public.friend_invites (to_user);

-- Requests and invites sent, kept a day, for the limits: they count even once answered.
create table if not exists public.friend_sends (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('request', 'invite')),
  at timestamptz not null default now()
);
create index if not exists friend_sends_user on public.friend_sends (user_id, kind, at);

alter table public.friend_profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friend_blocks enable row level security;
alter table public.friend_invites enable row level security;
alter table public.friend_sends enable row level security;
revoke all on public.friend_profiles, public.friendships, public.friend_requests, public.friend_blocks, public.friend_invites, public.friend_sends
  from anon, authenticated;

-- Are these two friends?
create or replace function public.are_friends(p_one uuid, p_two uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.friendships where user_a = least(p_one, p_two) and user_b = greatest(p_one, p_two))
$$;
revoke all on function public.are_friends(uuid, uuid) from public, anon, authenticated;

-- Has either of these two blocked the other?
create or replace function public.friend_blocked(p_one uuid, p_two uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friend_blocks
    where (blocker = p_one and blocked = p_two) or (blocker = p_two and blocked = p_one)
  )
$$;
revoke all on function public.friend_blocked(uuid, uuid) from public, anon, authenticated;

-- A new friend code, unused by anyone. 32 letters, so each byte of the hash picks one evenly.
create or replace function public.friend_code_new()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  letters constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  bytes bytea;
  made text;
begin
  loop
    bytes := decode(md5(gen_random_uuid()::text || clock_timestamp()::text), 'hex');
    select string_agg(substr(letters, 1 + get_byte(bytes, i) % 32, 1), '' order by i) into made from generate_series(0, 7) i;
    exit when not exists (select 1 from public.friend_profiles where code = made);
  end loop;
  return made;
end;
$$;
revoke all on function public.friend_code_new() from public, anon, authenticated;

-- The player's own row, made with a code the first time.
create or replace function public.friend_profile_for(p_user uuid)
returns public.friend_profiles
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  mine public.friend_profiles;
begin
  select * into mine from public.friend_profiles where user_id = p_user;
  if not found then
    insert into public.friend_profiles (user_id, code) values (p_user, public.friend_code_new())
    on conflict (user_id) do nothing;
    select * into mine from public.friend_profiles where user_id = p_user;
  end if;
  return mine;
end;
$$;
revoke all on function public.friend_profile_for(uuid) from public, anon, authenticated;

-- A code as typed or pasted: capitals, without the dash or spaces.
create or replace function public.friend_code_read(p_code text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'))
$$;

-- Each limit counts what was sent in the last day (requests) or hour (invites).
create or replace function public.friend_sent(p_user uuid, p_kind text, p_within interval)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.friend_sends where user_id = p_user and kind = p_kind and at > now() - p_within
$$;
revoke all on function public.friend_sent(uuid, text, interval) from public, anon, authenticated;

create or replace function public.friend_count(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.friendships where user_a = p_user or user_b = p_user
$$;
revoke all on function public.friend_count(uuid) from public, anon, authenticated;

-- Makes two players friends, and clears the requests between them. At most 200 friends each.
create or replace function public.friends_make(p_one uuid, p_two uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if public.friend_count(p_one) >= 200 or public.friend_count(p_two) >= 200 then
    raise exception 'too many friends';
  end if;
  insert into public.friendships (user_a, user_b) values (least(p_one, p_two), greatest(p_one, p_two)) on conflict do nothing;
  delete from public.friend_requests where (from_user = p_one and to_user = p_two) or (from_user = p_two and to_user = p_one);
end;
$$;
revoke all on function public.friends_make(uuid, uuid) from public, anon, authenticated;

-- A request from one player to another, however they found each other. Returns 'sent', or 'friends' when the
-- other had already asked. To someone who's blocked the sender, it quietly goes nowhere, and still says 'sent'.
create or replace function public.friend_request_to(p_me uuid, p_to uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_to = p_me then
    raise exception 'that''s your own code';
  end if;
  -- One of the player's own friend changes at a time, so two at once can't pass the limits together.
  perform pg_advisory_xact_lock(hashtext('friend player ' || p_me::text));
  if exists (select 1 from public.friend_blocks where blocker = p_me and blocked = p_to) then
    raise exception 'unblock them first';
  end if;
  if public.are_friends(p_me, p_to) then
    return 'friends';
  end if;
  if exists (select 1 from public.friend_blocks where blocker = p_to and blocked = p_me) then
    return 'sent';
  end if;
  if exists (select 1 from public.friend_requests where from_user = p_to and to_user = p_me) then
    perform public.friends_make(p_me, p_to);
    return 'friends';
  end if;
  if exists (select 1 from public.friend_requests where from_user = p_me and to_user = p_to) then
    return 'sent';
  end if;
  if public.friend_count(p_me) >= 200 then
    raise exception 'too many friends';
  end if;
  if (select count(*) from public.friend_requests where from_user = p_me) >= 50 then
    raise exception 'too many requests waiting';
  end if;
  if public.friend_sent(p_me, 'request', interval '1 day') >= 30 then
    raise exception 'too many requests today';
  end if;
  delete from public.friend_sends where at < now() - interval '1 day';
  insert into public.friend_sends (user_id, kind) values (p_me, 'request');
  insert into public.friend_requests (from_user, to_user) values (p_me, p_to);
  return 'sent';
end;
$$;
revoke all on function public.friend_request_to(uuid, uuid) from public, anon, authenticated;

-- Who a friend code belongs to, for its link's page: their name and photo, and where the two of you stand
-- ('me', 'friends', 'sent', 'received', 'blocked' or 'none'). Null for a code that isn't anyone's, and for
-- someone who's blocked you.
create or replace function public.friend_lookup(p_code text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  them uuid;
begin
  if me is null then
    raise exception 'sign in first';
  end if;
  select user_id into them from public.friend_profiles where code = public.friend_code_read(p_code);
  if them is null or exists (select 1 from public.friend_blocks where blocker = them and blocked = me) then
    return null;
  end if;
  return (
    select json_build_object(
      'user_id', them,
      'name', coalesce(nullif(btrim(p.display_name), ''), 'A planker'),
      'avatar_url', p.avatar_url,
      'status', case
        when them = me then 'me'
        when public.are_friends(me, them) then 'friends'
        when exists (select 1 from public.friend_blocks where blocker = me and blocked = them) then 'blocked'
        when exists (select 1 from public.friend_requests where from_user = me and to_user = them) then 'sent'
        when exists (select 1 from public.friend_requests where from_user = them and to_user = me) then 'received'
        else 'none'
      end
    )
    from (select 1) one
    left join public.plank_profiles p on p.user_id = them
  );
end;
$$;

create or replace function public.my_friend_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  return (public.friend_profile_for(public.group_player())).code;
end;
$$;

-- A new code: the old one, and its link, stop working.
create or replace function public.new_friend_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := public.group_player();
  made text := public.friend_code_new();
begin
  perform public.friend_profile_for(me);
  update public.friend_profiles set code = made where user_id = me;
  return made;
end;
$$;

create or replace function public.request_friend(p_code text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := public.group_player();
  them uuid;
begin
  select user_id into them from public.friend_profiles where code = public.friend_code_read(p_code);
  if them is null then
    raise exception 'no such friend code';
  end if;
  return public.friend_request_to(me, them);
end;
$$;

-- Someone you share a group with, from the group's members: no code needed.
create or replace function public.request_friend_from_group(p_user uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := public.group_player();
begin
  if not exists (
    select 1 from public.group_members mine join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = me and theirs.user_id = p_user
  ) then
    raise exception 'not in a group with them';
  end if;
  return public.friend_request_to(me, p_user);
end;
$$;

-- Accepts or declines a request. Declining is quiet: it's just gone from the sender's list.
create or replace function public.answer_friend_request(p_from uuid, p_accept boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := public.group_player();
begin
  perform pg_advisory_xact_lock(hashtext('friend player ' || me::text));
  if not exists (select 1 from public.friend_requests where from_user = p_from and to_user = me) then
    raise exception 'no such request';
  end if;
  if p_accept then
    perform public.friends_make(me, p_from);
  else
    delete from public.friend_requests where from_user = p_from and to_user = me;
  end if;
end;
$$;

create or replace function public.cancel_friend_request(p_to uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  delete from public.friend_requests where from_user = auth.uid() and to_user = p_to;
end;
$$;

-- Either friend can end it. Invites between them go too.
create or replace function public.remove_friend(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  delete from public.friendships where user_a = least(me, p_user) and user_b = greatest(me, p_user);
  delete from public.friend_invites where (from_user = me and to_user = p_user) or (from_user = p_user and to_user = me);
end;
$$;

-- Blocking ends the friendship and clears everything between the two. They're never told.
create or replace function public.block_player(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'sign in first';
  end if;
  if p_user = me then
    raise exception 'that''s you';
  end if;
  insert into public.friend_blocks (blocker, blocked) values (me, p_user) on conflict do nothing;
  perform public.remove_friend(p_user);
  delete from public.friend_requests where (from_user = me and to_user = p_user) or (from_user = p_user and to_user = me);
end;
$$;

create or replace function public.unblock_player(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  delete from public.friend_blocks where blocker = auth.uid() and blocked = p_user;
end;
$$;

create or replace function public.set_show_online(p_show boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'sign in first';
  end if;
  perform public.friend_profile_for(me);
  update public.friend_profiles set show_online = coalesce(p_show, true) where user_id = me;
end;
$$;

-- Invites friends into a plank-together room (p_room and p_song) or a group (p_group). Anyone in the list who
-- isn't a friend, has blocked you, or is in the group already is skipped. Returns how many went. A new room
-- invite to a friend replaces the last one. At most 50 invites an hour.
create or replace function public.invite_friends(p_kind text, p_users uuid[], p_room text, p_song text, p_group uuid)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := public.group_player();
  friend uuid;
  sent int := 0;
begin
  if p_kind is null or p_kind not in ('room', 'group') then
    raise exception 'a room or a group';
  end if;
  if p_kind = 'group' and not public.in_group(p_group) then
    raise exception 'not in this group';
  end if;
  if coalesce(array_length(p_users, 1), 0) > 50 then
    raise exception 'too many invites';
  end if;
  perform pg_advisory_xact_lock(hashtext('friend player ' || me::text));
  for friend in select distinct u from unnest(coalesce(p_users, '{}'::uuid[])) u loop
    continue when not public.are_friends(me, friend) or public.friend_blocked(me, friend);
    continue when p_kind = 'group' and exists (select 1 from public.group_members where group_id = p_group and user_id = friend);
    if public.friend_sent(me, 'invite', interval '1 hour') >= 50 then
      raise exception 'too many invites';
    end if;
    delete from public.friend_invites
    where from_user = me and to_user = friend and kind = p_kind and (p_kind = 'room' or group_id = p_group);
    insert into public.friend_invites (from_user, to_user, kind, room_code, song_id, group_id, expires_at)
    values (
      me, friend, p_kind,
      case when p_kind = 'room' then p_room end,
      case when p_kind = 'room' then p_song end,
      case when p_kind = 'group' then p_group end,
      now() + case when p_kind = 'room' then interval '30 minutes' else interval '7 days' end
    );
    insert into public.friend_sends (user_id, kind) values (me, 'invite');
    sent := sent + 1;
  end loop;
  delete from public.friend_sends where at < now() - interval '1 day';
  return sent;
end;
$$;

create or replace function public.dismiss_invite(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  delete from public.friend_invites where id = p_id and to_user = auth.uid();
end;
$$;

-- Joins the group a friend invited you to, on the group's own limits, while the friend is still in it.
create or replace function public.accept_group_invite(p_id uuid, p_today date)
returns public.groups
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := public.group_player();
  invite public.friend_invites;
  joined public.groups;
begin
  select * into invite from public.friend_invites where id = p_id and to_user = me and kind = 'group' and expires_at > now();
  if not found or not exists (select 1 from public.group_members where group_id = invite.group_id and user_id = invite.from_user) then
    raise exception 'no such invite';
  end if;
  joined := public.join_group((select invite_code from public.groups where id = invite.group_id), p_today);
  delete from public.friend_invites where id = p_id;
  return joined;
end;
$$;

-- People you plank with in your groups who aren't your friends yet: name, photo and a group you share.
create or replace function public.friend_suggestions()
returns table (user_id uuid, name text, avatar_url text, group_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
begin
  return query
  select distinct on (them.user_id)
    them.user_id,
    coalesce(nullif(btrim(p.display_name), ''), 'A planker'),
    p.avatar_url,
    g.name
  from public.group_members mine
  join public.group_members them on them.group_id = mine.group_id and them.user_id <> me
  join public.groups g on g.id = mine.group_id
  left join public.plank_profiles p on p.user_id = them.user_id
  where mine.user_id = me
    and not public.are_friends(me, them.user_id)
    and not public.friend_blocked(me, them.user_id)
    and not exists (
      select 1 from public.friend_requests r
      where (r.from_user = me and r.to_user = them.user_id) or (r.from_user = them.user_id and r.to_user = me)
    )
  order by them.user_id, g.name
  limit 50;
end;
$$;

-- One friend in full, for their card: the days they planked today's song (for their streak), since when you've
-- been friends, and the groups you share.
create or replace function public.friend_card(p_user uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.are_friends(me, p_user) then
    raise exception 'not your friend';
  end if;
  return json_build_object(
    'since', (select since from public.friendships where user_a = least(me, p_user) and user_b = greatest(me, p_user)),
    'days', coalesce((select json_agg(c.day order by c.day) from public.plank_completions c where c.user_id = p_user and c.mode = 'daily'), '[]'::json),
    'groups', coalesce((
      select json_agg(json_build_object('id', g.id, 'name', g.name) order by g.name)
      from public.groups g
      where exists (select 1 from public.group_members where group_id = g.id and user_id = me)
        and exists (select 1 from public.group_members where group_id = g.id and user_id = p_user)
    ), '[]'::json)
  );
end;
$$;

-- The friends list's one call, every 45 seconds while the site is in view: checks the player in (and says
-- until when they're planking, or null), then returns their code (once they have a name, as friends need)
-- and everything the list shows. For each
-- friend: name, photo, since when, online and planking (false for anyone hiding it), when last seen and when
-- they planked `p_today`'s song (null for anyone hiding it), and whether that was with no breaks.
create or replace function public.friends_now(p_today date, p_planking_until timestamptz)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  mine public.friend_profiles;
begin
  if me is null then
    raise exception 'sign in first';
  end if;
  perform public.group_day(p_today);
  mine := public.friend_profile_for(me);
  update public.friend_profiles
  -- At most 2 hours ahead, so a plank screen left open stops counting. Null: not planking.
  set seen_at = now(), planking_until = case when p_planking_until is not null then least(p_planking_until, now() + interval '2 hours') end
  where user_id = me;
  delete from public.friend_invites where to_user = me and expires_at <= now();
  return json_build_object(
    'code', case when exists (
      select 1 from public.plank_profiles where user_id = me and btrim(coalesce(display_name, '')) <> ''
    ) then mine.code end,
    'show_online', mine.show_online,
    'friends', coalesce((
      select json_agg(f order by f.since desc)
      from (
        select
          them.id as user_id,
          coalesce(nullif(btrim(p.display_name), ''), 'A planker') as name,
          p.avatar_url,
          fr.since,
          coalesce(fp.show_online and fp.seen_at > now() - interval '2 minutes', false) as online,
          coalesce(fp.show_online and fp.planking_until > now(), false) as planking,
          case when fp.show_online then fp.seen_at end as seen_at,
          case when fp.show_online then c.completed_at end as planked_at,
          c.user_id is not null as planked_today,
          case when c.user_id is not null then c.pauses is null or jsonb_array_length(c.pauses) = 0 end as clean_today,
          c.song_id as planked_song
        from public.friendships fr
        cross join lateral (select case when fr.user_a = me then fr.user_b else fr.user_a end as id) them
        left join public.plank_profiles p on p.user_id = them.id
        left join public.friend_profiles fp on fp.user_id = them.id
        left join public.plank_completions c on c.user_id = them.id and c.mode = 'daily' and c.day = p_today
        where fr.user_a = me or fr.user_b = me
      ) f
    ), '[]'::json),
    'requests_in', coalesce((
      select json_agg(json_build_object('user_id', r.from_user, 'name', coalesce(nullif(btrim(p.display_name), ''), 'A planker'), 'avatar_url', p.avatar_url, 'at', r.created_at) order by r.created_at desc)
      from public.friend_requests r left join public.plank_profiles p on p.user_id = r.from_user
      where r.to_user = me
    ), '[]'::json),
    'requests_out', coalesce((
      select json_agg(json_build_object('user_id', r.to_user, 'name', coalesce(nullif(btrim(p.display_name), ''), 'A planker'), 'avatar_url', p.avatar_url, 'at', r.created_at) order by r.created_at desc)
      from public.friend_requests r left join public.plank_profiles p on p.user_id = r.to_user
      where r.from_user = me
    ), '[]'::json),
    'blocked', coalesce((
      select json_agg(json_build_object('user_id', b.blocked, 'name', coalesce(nullif(btrim(p.display_name), ''), 'A planker'), 'avatar_url', p.avatar_url) order by b.created_at desc)
      from public.friend_blocks b left join public.plank_profiles p on p.user_id = b.blocked
      where b.blocker = me
    ), '[]'::json),
    'invites', coalesce((
      select json_agg(json_build_object(
        'id', i.id, 'from_user', i.from_user, 'name', coalesce(nullif(btrim(p.display_name), ''), 'A planker'), 'avatar_url', p.avatar_url,
        'kind', i.kind, 'room_code', i.room_code, 'song_id', i.song_id, 'group_id', i.group_id, 'group_name', g.name,
        'at', i.created_at, 'expires_at', i.expires_at
      ) order by i.created_at desc)
      from public.friend_invites i
      left join public.plank_profiles p on p.user_id = i.from_user
      left join public.groups g on g.id = i.group_id
      where i.to_user = me and i.expires_at > now() and public.are_friends(me, i.from_user)
    ), '[]'::json)
  );
end;
$$;

-- The site's calls: signed-in players only.
revoke all on function public.friend_lookup(text) from public, anon;
revoke all on function public.my_friend_code() from public, anon;
revoke all on function public.new_friend_code() from public, anon;
revoke all on function public.request_friend(text) from public, anon;
revoke all on function public.request_friend_from_group(uuid) from public, anon;
revoke all on function public.answer_friend_request(uuid, boolean) from public, anon;
revoke all on function public.cancel_friend_request(uuid) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.block_player(uuid) from public, anon;
revoke all on function public.unblock_player(uuid) from public, anon;
revoke all on function public.set_show_online(boolean) from public, anon;
revoke all on function public.invite_friends(text, uuid[], text, text, uuid) from public, anon;
revoke all on function public.dismiss_invite(uuid) from public, anon;
revoke all on function public.accept_group_invite(uuid, date) from public, anon;
revoke all on function public.friend_suggestions() from public, anon;
revoke all on function public.friend_card(uuid) from public, anon;
revoke all on function public.friends_now(date, timestamptz) from public, anon;
grant execute on function public.friend_lookup(text) to authenticated;
grant execute on function public.my_friend_code() to authenticated;
grant execute on function public.new_friend_code() to authenticated;
grant execute on function public.request_friend(text) to authenticated;
grant execute on function public.request_friend_from_group(uuid) to authenticated;
grant execute on function public.answer_friend_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.block_player(uuid) to authenticated;
grant execute on function public.unblock_player(uuid) to authenticated;
grant execute on function public.set_show_online(boolean) to authenticated;
grant execute on function public.invite_friends(text, uuid[], text, text, uuid) to authenticated;
grant execute on function public.dismiss_invite(uuid) to authenticated;
grant execute on function public.accept_group_invite(uuid, date) to authenticated;
grant execute on function public.friend_suggestions() to authenticated;
grant execute on function public.friend_card(uuid) to authenticated;
grant execute on function public.friends_now(date, timestamptz) to authenticated;

-- Each player's friend inbox: a private Realtime channel, friend-inbox:<their id>, where a request, an answer or
-- an invite sends a nudge with nothing in it, so their site checks in straight away. Only they can listen. Only
-- their friends, or someone with a request waiting for them, can nudge, and never someone they've blocked.
create or replace function public.friend_inbox_listener(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_topic = 'friend-inbox:' || auth.uid()::text
$$;
revoke all on function public.friend_inbox_listener(text) from public, anon;
grant execute on function public.friend_inbox_listener(text) to authenticated;

create or replace function public.friend_inbox_sender(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  them uuid;
begin
  if p_topic !~ '^friend-inbox:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or auth.uid() is null then
    return false;
  end if;
  them := substr(p_topic, 14)::uuid;
  return not public.friend_blocked(auth.uid(), them) and (
    public.are_friends(auth.uid(), them)
    or exists (select 1 from public.friend_requests where from_user = auth.uid() and to_user = them)
  );
end;
$$;
revoke all on function public.friend_inbox_sender(text) from public, anon;
grant execute on function public.friend_inbox_sender(text) to authenticated;

drop policy if exists "players hear their friend inbox" on realtime.messages;
create policy "players hear their friend inbox" on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.friend_inbox_listener(realtime.topic()));
drop policy if exists "friends nudge each other's inbox" on realtime.messages;
create policy "friends nudge each other's inbox" on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and public.friend_inbox_sender(realtime.topic()));
