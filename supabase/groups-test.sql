-- Checks the groups rules in schema.sql with made-up players: Ana and Ben in a group, Cat not in it, Dee
-- with no name, and someone signed out. Paste into Supabase → SQL Editor → Run, after schema.sql.
-- It keeps nothing: everything it makes is rolled back at the end. A check that fails stops it with its
-- message; if it finishes with no error, every check held.

begin;

-- Four made-up players (with names, except Dee), and some planks.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'groups-test-ana@example.invalid'),
  ('00000000-0000-4000-8000-00000000000b', 'groups-test-ben@example.invalid'),
  ('00000000-0000-4000-8000-00000000000c', 'groups-test-cat@example.invalid'),
  ('00000000-0000-4000-8000-00000000000d', 'groups-test-dee@example.invalid');
insert into public.plank_profiles (user_id, display_name) values
  ('00000000-0000-4000-8000-00000000000a', 'Ana'),
  ('00000000-0000-4000-8000-00000000000b', 'Ben'),
  ('00000000-0000-4000-8000-00000000000c', 'Cat'),
  ('00000000-0000-4000-8000-00000000000d', null);
insert into public.plank_completions (user_id, day, mode, song_id, seconds, pauses, xp, lights) values
  ('00000000-0000-4000-8000-00000000000a', current_date, 'daily', 'style', 231, null, 347, 2),
  ('00000000-0000-4000-8000-00000000000a', current_date, 'ladder', 'wood', 150, null, 225, null),
  ('00000000-0000-4000-8000-00000000000b', current_date, 'daily', 'style', 231, '[{"at": 30, "ms": 4000}]', 231, null),
  ('00000000-0000-4000-8000-00000000000b', current_date - 1, 'daily', 'wood', 150, null, 225, null),
  ('00000000-0000-4000-8000-00000000000c', current_date, 'daily', 'style', 231, null, 347, null);
insert into public.plank_attempts (user_id, id, song_id, kind, started_at, ended_at, outcome, reached, pauses) values
  ('00000000-0000-4000-8000-00000000000a', gen_random_uuid(), 'style', 'daily', now(), now(), 'finished', 231, 0);

-- Acts as a player ('ana', 'ben', 'cat', 'dee', or 'anon' for signed out), the way the site's key does.
create function public.groups_test_as(p_player text)
returns void
language plpgsql
as $$
declare
  id text := case p_player
    when 'ana' then '00000000-0000-4000-8000-00000000000a'
    when 'ben' then '00000000-0000-4000-8000-00000000000b'
    when 'cat' then '00000000-0000-4000-8000-00000000000c'
    when 'dee' then '00000000-0000-4000-8000-00000000000d'
  end;
begin
  perform set_config('request.jwt.claim.sub', coalesce(id, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', id, 'role', case when id is null then 'anon' else 'authenticated' end)::text, true);
  perform set_config('role', case when id is null then 'anon' else 'authenticated' end, true);
end;
$$;

-- True when running `query` is refused.
create function public.groups_test_refused(query text)
returns boolean
language plpgsql
as $$
begin
  execute query;
  return false;
exception when others then
  return true;
end;
$$;

-- Ana makes a private group.
select public.groups_test_as('ana');
do $$
declare
  made public.groups;
begin
  made := public.create_group('  Gym buddies  ', 'private', current_date);
  perform set_config('test.gym', made.id::text, true);
  perform set_config('test.gym_code', made.invite_code, true);
  assert made.name = 'Gym buddies', 'the name is tidied';
  assert char_length(made.invite_code) = 20, 'the invite code is 20 characters';
  assert (select count(*) from public.groups) = 1, 'Ana sees her group';
  assert (select count(*) from public.group_members) = 1, 'Ana is its first member';
  assert public.groups_test_refused($q$ select public.create_group(repeat('x', 41), 'private', current_date) $q$), 'a name over 40 characters is refused';
  assert public.groups_test_refused($q$ select public.create_group('Club', 'secret', current_date) $q$), 'only private or public';
  assert public.groups_test_refused($q$ select public.create_group('Club', 'private', current_date + 5) $q$), 'a day far from today is refused';
  assert public.groups_test_refused($q$ insert into public.groups (name, kind, invite_code) values ('Mine', 'public', '0123456789abcdef0123') $q$), 'no making groups directly';
  assert public.groups_test_refused(format($q$ insert into public.group_members (group_id, user_id, joined_on) values (%L, auth.uid(), current_date) $q$, made.id)), 'no joining directly';
end;
$$;

-- Ben joins with the link. Before that he sees nothing but what the link shows.
select public.groups_test_as('ben');
do $$
declare
  invite json;
  board_keys text[];
begin
  assert (select count(*) from public.groups) = 0, 'before joining, Ben sees no group';
  invite := public.group_invite(current_setting('test.gym_code'), current_date);
  assert invite ->> 'name' = 'Gym buddies' and (invite ->> 'members')::int = 1 and invite ->> 'id' is null, 'a private link shows a signed-in player its name and size';
  assert invite -> 'days' is null and invite -> 'contributors' is null, 'but nothing about its members';
  perform public.join_group(upper(' ' || current_setting('test.gym_code') || ' '), current_date);
  perform public.join_group(current_setting('test.gym_code'), current_date);
  assert (select count(*) from public.group_members where group_id = current_setting('test.gym')::uuid) = 2, 'Ben joined, once';
  assert (select count(*) from public.groups) = 1, 'Ben sees the group';
  assert (select count(*) from public.group_members) = 2, 'and its members';
  assert (select count(*) from public.group_board(current_setting('test.gym')::uuid, current_date)) = 2, 'and its board';
  select array_agg(k order by k) into board_keys
  from (select to_jsonb(b) as j from public.group_board(current_setting('test.gym')::uuid, current_date) b limit 1) r, jsonb_object_keys(r.j) k;
  assert board_keys = array['avatar_url', 'clean_today', 'days', 'joined_on', 'name', 'user_id'], 'the board has only name, photo, joining day, days planked and today''s 🟩: ' || board_keys::text;
  assert (select clean_today from public.group_board(current_setting('test.gym')::uuid, current_date) where name = 'Ana'), 'Ana held today''s with no breaks: 🟩';
  assert not (select clean_today from public.group_board(current_setting('test.gym')::uuid, current_date) where name = 'Ben'), 'Ben had breaks: no 🟩, and no count of them';
  assert (select cardinality(days) from public.group_board(current_setting('test.gym')::uuid, current_date) where name = 'Ben') = 2, 'the days each member planked today''s song';
  assert (select cardinality(days) from public.group_board(current_setting('test.gym')::uuid, current_date) where name = 'Ana') = 1, 'today''s song only, never ladder levels';
  assert public.groups_test_refused($q$ select * from public.group_board(current_setting('test.gym')::uuid, current_date + 5) $q$), 'the board only tells today''s 🟩';
  -- Still nothing of Ana's directly.
  assert (select count(*) from public.plank_completions where user_id = '00000000-0000-4000-8000-00000000000a') = 0, 'Ben can''t read Ana''s planks';
  assert (select count(*) from public.plank_attempts where user_id = '00000000-0000-4000-8000-00000000000a') = 0, 'or her attempts';
  assert (select count(*) from public.plank_profiles where user_id = '00000000-0000-4000-8000-00000000000a') = 0, 'or her profile';
  -- Only the maker changes the group.
  assert public.groups_test_refused(format($q$ select public.rename_group(%L, 'Ben''s now') $q$, current_setting('test.gym'))), 'Ben can''t rename it';
  assert public.groups_test_refused(format($q$ select public.new_group_code(%L) $q$, current_setting('test.gym'))), 'or make a new link';
  assert public.groups_test_refused(format($q$ select public.remove_from_group(%L, '00000000-0000-4000-8000-00000000000a') $q$, current_setting('test.gym'))), 'or remove Ana';
  assert public.groups_test_refused($q$ update public.groups set name = 'Hacked' $q$) or (select name from public.groups) = 'Gym buddies', 'or change it directly';
  assert public.groups_test_refused($q$ delete from public.group_members where user_id = '00000000-0000-4000-8000-00000000000a' $q$) or (select count(*) from public.group_members) = 2, 'or remove anyone directly';
end;
$$;

-- Cat isn't in it, and sees none of it.
select public.groups_test_as('cat');
do $$
declare
  invite json;
begin
  assert (select count(*) from public.groups) = 0, 'Cat can''t read the group';
  assert (select count(*) from public.group_members) = 0, 'or its members';
  assert public.groups_test_refused(format($q$ select * from public.group_board(%L, current_date) $q$, current_setting('test.gym'))), 'or its board';
  assert (select count(*) from public.plank_completions where user_id <> auth.uid()) = 0, 'or anyone''s planks';
  assert public.groups_test_refused(format($q$ select public.rename_group(%L, 'Cat''s') $q$, current_setting('test.gym'))), 'or rename it';
  assert public.groups_test_refused(format($q$ select public.remove_from_group(%L, '00000000-0000-4000-8000-00000000000b') $q$, current_setting('test.gym'))), 'or remove anyone';
  perform public.leave_group(current_setting('test.gym')::uuid);
  assert (select count(*) from public.group_members where group_id = current_setting('test.gym')::uuid) = 0, 'leaving a group she''s not in does nothing';
  invite := public.group_invite('0123456789abcdef0123', current_date);
  assert invite is null, 'a made-up code finds nothing';
end;
$$;

-- Dee has no name: she needs one to join or make a group.
select public.groups_test_as('dee');
do $$
begin
  assert public.groups_test_refused(format($q$ select public.join_group(%L, current_date) $q$, current_setting('test.gym_code'))), 'no name, no joining';
  assert public.groups_test_refused($q$ select public.create_group('Dee''s', 'private', current_date) $q$), 'no name, no making';
end;
$$;

-- Signed out: a private link shows nothing, and nothing else is open.
select public.groups_test_as('anon');
do $$
declare
  invite json;
begin
  invite := public.group_invite(current_setting('test.gym_code'), current_date);
  assert invite::jsonb = '{"kind": "private"}'::jsonb, 'signed out, a private link shows only that it''s private: ' || invite::text;
  assert public.groups_test_refused($q$ select count(*) from public.groups $q$), 'no reading groups signed out';
  assert public.groups_test_refused($q$ select count(*) from public.group_members $q$), 'or members';
  assert public.groups_test_refused(format($q$ select * from public.group_board(%L, current_date) $q$, current_setting('test.gym'))), 'or boards';
  assert public.groups_test_refused($q$ select public.create_group('Nobody', 'public', current_date) $q$), 'or making groups';
end;
$$;

-- Ana, the maker: renames it, makes a new link (the old one stops working), removes Ben.
select public.groups_test_as('ana');
do $$
declare
  code text;
begin
  perform public.rename_group(current_setting('test.gym')::uuid, 'Plank crew');
  assert (select name from public.groups where id = current_setting('test.gym')::uuid) = 'Plank crew', 'the maker renames it';
  code := public.new_group_code(current_setting('test.gym')::uuid);
  assert code <> current_setting('test.gym_code') and public.group_invite(current_setting('test.gym_code'), current_date) is null, 'a new link, and the old one finds nothing';
  perform set_config('test.gym_code', code, true);
  assert public.groups_test_refused(format($q$ select public.remove_from_group(%L, auth.uid()) $q$, current_setting('test.gym'))), 'the maker leaves rather than removing herself';
  perform public.remove_from_group(current_setting('test.gym')::uuid, '00000000-0000-4000-8000-00000000000b');
  assert (select count(*) from public.group_members where group_id = current_setting('test.gym')::uuid) = 1, 'the maker removes Ben';
end;
$$;

select public.groups_test_as('ben');
do $$
begin
  assert (select count(*) from public.groups) = 0, 'removed, Ben sees the group no more';
  assert public.groups_test_refused(format($q$ select * from public.group_board(%L, current_date) $q$, current_setting('test.gym'))), 'or its board';
end;
$$;

-- A public group: Ben makes it, Cat joins. Its link shows the group, even signed out.
select public.groups_test_as('ben');
do $$
declare
  made public.groups;
begin
  made := public.create_group('Swifties', 'public', current_date);
  perform set_config('test.club', made.id::text, true);
  perform set_config('test.club_code', made.invite_code, true);
end;
$$;
select public.groups_test_as('cat');
do $$
begin
  perform public.join_group(current_setting('test.club_code'), current_date);
end;
$$;
select public.groups_test_as('anon');
do $$
declare
  invite jsonb := public.group_invite(current_setting('test.club_code'), current_date)::jsonb;
  keys text[];
begin
  assert invite ->> 'kind' = 'public' and invite ->> 'name' = 'Swifties' and (invite ->> 'members')::int = 2, 'signed out, a public link shows the group';
  assert invite ->> 'id' is null, 'but not its id';
  assert invite -> 'days' = jsonb_build_array(current_date), 'the days anyone planked since joining (Ben''s plank from before he made it doesn''t count): ' || (invite -> 'days')::text;
  assert jsonb_array_length(invite -> 'contributors') = 2, 'every member as a contributor';
  select array_agg(k order by k) into keys from jsonb_object_keys(invite -> 'contributors' -> 0) k;
  assert keys = array['avatar_url', 'days', 'name'], 'each with only a name, a photo and days planked this month: ' || keys::text;
  assert (invite -> 'contributors' -> 0 ->> 'days')::int = 1, 'one day each this month';
end;
$$;

-- Limits: 50 members (48 more made up here), and 10 groups each.
reset role;
insert into auth.users (id, email)
select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'groups-test-' || n || '@example.invalid' from generate_series(100, 147) n;
insert into public.group_members (group_id, user_id, joined_on)
select current_setting('test.club')::uuid, ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, current_date from generate_series(100, 147) n;
select public.groups_test_as('ana');
do $$
begin
  assert public.groups_test_refused(format($q$ select public.join_group(%L, current_date) $q$, current_setting('test.club_code'))), 'a 51st member is refused';
  for i in 1..9 loop
    perform public.create_group('Group ' || i, 'private', current_date);
  end loop;
  assert (select count(*) from public.group_members where user_id = auth.uid()) = 10, 'Ana is in 10 groups';
  assert public.groups_test_refused($q$ select public.create_group('Eleven', 'private', current_date) $q$), 'an 11th is refused';
end;
$$;

-- The maker leaves: whoever joined first takes over. The last one out: the group goes.
select public.groups_test_as('ben');
do $$
begin
  perform public.leave_group(current_setting('test.club')::uuid);
end;
$$;
reset role;
do $$
begin
  assert (select made_by from public.groups where id = current_setting('test.club')::uuid) = '00000000-0000-4000-8000-00000000000c', 'Cat, who joined first after Ben, takes over';
end;
$$;
select public.groups_test_as('ana');
do $$
begin
  perform public.leave_group(current_setting('test.gym')::uuid);
end;
$$;
reset role;
do $$
begin
  assert not exists (select 1 from public.groups where id = current_setting('test.gym')::uuid), 'the last one out: the group is gone';
  delete from auth.users where id = '00000000-0000-4000-8000-00000000000c';
  assert not exists (select 1 from public.group_members where user_id = '00000000-0000-4000-8000-00000000000c'), 'a deleted account leaves its groups';
  assert (select made_by from public.groups where id = current_setting('test.club')::uuid) is not null, 'and its groups get a new maker';
end;
$$;

rollback;
