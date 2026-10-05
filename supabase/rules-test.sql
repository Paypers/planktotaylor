-- Checks the rules in schema.sql with made-up players: the groups (Ana and Ben in a group, Cat not in it,
-- Dee with no name, and someone signed out), then photos and the limits on what a player can store.
-- Paste into Supabase → SQL Editor → Run, after schema.sql.
-- It keeps nothing: everything it makes is rolled back at the end. A check that fails stops it with its
-- message; if it finishes with no error, every check held.

begin;

-- Four made-up players (with names, except Dee), and some planks.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'rules-test-ana@example.invalid'),
  ('00000000-0000-4000-8000-00000000000b', 'rules-test-ben@example.invalid'),
  ('00000000-0000-4000-8000-00000000000c', 'rules-test-cat@example.invalid'),
  ('00000000-0000-4000-8000-00000000000d', 'rules-test-dee@example.invalid');
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
create function public.rules_test_as(p_player text)
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
create function public.rules_test_refused(query text)
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
select public.rules_test_as('ana');
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
  assert public.rules_test_refused($q$ select public.create_group(repeat('x', 41), 'private', current_date) $q$), 'a name over 40 characters is refused';
  assert public.rules_test_refused($q$ select public.create_group('Club', 'secret', current_date) $q$), 'only private or public';
  assert public.rules_test_refused($q$ select public.create_group('Club', 'private', current_date + 5) $q$), 'a day far from today is refused';
  assert public.rules_test_refused($q$ insert into public.groups (name, kind, invite_code) values ('Mine', 'public', '0123456789abcdef0123') $q$), 'no making groups directly';
  assert public.rules_test_refused(format($q$ insert into public.group_members (group_id, user_id, joined_on) values (%L, auth.uid(), current_date) $q$, made.id)), 'no joining directly';
end;
$$;

-- Ben joins with the link. Before that he sees nothing but what the link shows.
select public.rules_test_as('ben');
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
  assert public.rules_test_refused($q$ select * from public.group_board(current_setting('test.gym')::uuid, current_date + 5) $q$), 'the board only tells today''s 🟩';
  -- Still nothing of Ana's directly.
  assert (select count(*) from public.plank_completions where user_id = '00000000-0000-4000-8000-00000000000a') = 0, 'Ben can''t read Ana''s planks';
  assert (select count(*) from public.plank_attempts where user_id = '00000000-0000-4000-8000-00000000000a') = 0, 'or her attempts';
  assert (select count(*) from public.plank_profiles where user_id = '00000000-0000-4000-8000-00000000000a') = 0, 'or her profile';
  -- Only the maker changes the group.
  assert public.rules_test_refused(format($q$ select public.rename_group(%L, 'Ben''s now') $q$, current_setting('test.gym'))), 'Ben can''t rename it';
  assert public.rules_test_refused(format($q$ select public.new_group_code(%L) $q$, current_setting('test.gym'))), 'or make a new link';
  assert public.rules_test_refused(format($q$ select public.remove_from_group(%L, '00000000-0000-4000-8000-00000000000a') $q$, current_setting('test.gym'))), 'or remove Ana';
  assert public.rules_test_refused($q$ update public.groups set name = 'Hacked' $q$) or (select name from public.groups) = 'Gym buddies', 'or change it directly';
  assert public.rules_test_refused($q$ delete from public.group_members where user_id = '00000000-0000-4000-8000-00000000000a' $q$) or (select count(*) from public.group_members) = 2, 'or remove anyone directly';
end;
$$;

-- Planking now: only the group's members join its Realtime channel.
do $$
begin
  assert public.planking_channel_member('group-planking:' || current_setting('test.gym')), 'Ben joins the group''s planking channel';
  assert not public.planking_channel_member('group-planking:' || gen_random_uuid()), 'but not a group he isn''t in';
  assert not public.planking_channel_member('plank-together:' || current_setting('test.gym')), 'or any other channel by this rule';
  assert not public.planking_channel_member('group-planking:not-a-group'), 'and a made-up topic is just refused';
end;
$$;
select public.rules_test_as('cat');
do $$
begin
  assert not public.planking_channel_member('group-planking:' || current_setting('test.gym')), 'Cat can''t join the group''s planking channel';
end;
$$;
select public.rules_test_as('anon');
do $$
begin
  assert not public.planking_channel_member('group-planking:' || current_setting('test.gym')), 'signed out, never';
end;
$$;

-- Cat isn't in it, and sees none of it.
select public.rules_test_as('cat');
do $$
declare
  invite json;
begin
  assert (select count(*) from public.groups) = 0, 'Cat can''t read the group';
  assert (select count(*) from public.group_members) = 0, 'or its members';
  assert public.rules_test_refused(format($q$ select * from public.group_board(%L, current_date) $q$, current_setting('test.gym'))), 'or its board';
  assert (select count(*) from public.plank_completions where user_id <> auth.uid()) = 0, 'or anyone''s planks';
  assert public.rules_test_refused(format($q$ select public.rename_group(%L, 'Cat''s') $q$, current_setting('test.gym'))), 'or rename it';
  assert public.rules_test_refused(format($q$ select public.remove_from_group(%L, '00000000-0000-4000-8000-00000000000b') $q$, current_setting('test.gym'))), 'or remove anyone';
  perform public.leave_group(current_setting('test.gym')::uuid);
  assert (select count(*) from public.group_members where group_id = current_setting('test.gym')::uuid) = 0, 'leaving a group she''s not in does nothing';
  invite := public.group_invite('0123456789abcdef0123', current_date);
  assert invite is null, 'a made-up code finds nothing';
end;
$$;

-- Dee has no name: she needs one to join or make a group.
select public.rules_test_as('dee');
do $$
begin
  assert public.rules_test_refused(format($q$ select public.join_group(%L, current_date) $q$, current_setting('test.gym_code'))), 'no name, no joining';
  assert public.rules_test_refused($q$ select public.create_group('Dee''s', 'private', current_date) $q$), 'no name, no making';
end;
$$;

-- Signed out: a private link shows nothing, and nothing else is open.
select public.rules_test_as('anon');
do $$
declare
  invite json;
begin
  invite := public.group_invite(current_setting('test.gym_code'), current_date);
  assert invite::jsonb = '{"kind": "private"}'::jsonb, 'signed out, a private link shows only that it''s private: ' || invite::text;
  assert public.rules_test_refused($q$ select count(*) from public.groups $q$), 'no reading groups signed out';
  assert public.rules_test_refused($q$ select count(*) from public.group_members $q$), 'or members';
  assert public.rules_test_refused(format($q$ select * from public.group_board(%L, current_date) $q$, current_setting('test.gym'))), 'or boards';
  assert public.rules_test_refused($q$ select public.create_group('Nobody', 'public', current_date) $q$), 'or making groups';
end;
$$;

-- Ana, the maker: renames it, makes a new link (the old one stops working), removes Ben.
select public.rules_test_as('ana');
do $$
declare
  code text;
begin
  perform public.rename_group(current_setting('test.gym')::uuid, 'Plank crew');
  assert (select name from public.groups where id = current_setting('test.gym')::uuid) = 'Plank crew', 'the maker renames it';
  code := public.new_group_code(current_setting('test.gym')::uuid);
  assert code <> current_setting('test.gym_code') and public.group_invite(current_setting('test.gym_code'), current_date) is null, 'a new link, and the old one finds nothing';
  perform set_config('test.gym_code', code, true);
  assert public.rules_test_refused(format($q$ select public.remove_from_group(%L, auth.uid()) $q$, current_setting('test.gym'))), 'the maker leaves rather than removing herself';
  perform public.remove_from_group(current_setting('test.gym')::uuid, '00000000-0000-4000-8000-00000000000b');
  assert (select count(*) from public.group_members where group_id = current_setting('test.gym')::uuid) = 1, 'the maker removes Ben';
end;
$$;

select public.rules_test_as('ben');
do $$
begin
  assert (select count(*) from public.groups) = 0, 'removed, Ben sees the group no more';
  assert public.rules_test_refused(format($q$ select * from public.group_board(%L, current_date) $q$, current_setting('test.gym'))), 'or its board';
end;
$$;

-- A public group: Ben makes it, Cat joins. Its link shows the group, even signed out.
select public.rules_test_as('ben');
do $$
declare
  made public.groups;
begin
  made := public.create_group('Swifties', 'public', current_date);
  perform set_config('test.club', made.id::text, true);
  perform set_config('test.club_code', made.invite_code, true);
end;
$$;
select public.rules_test_as('cat');
do $$
begin
  perform public.join_group(current_setting('test.club_code'), current_date);
end;
$$;
select public.rules_test_as('anon');
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

-- Discord: a channel can post a group at night (names and photos). A public group: any member. A private
-- group: only its maker. Every member can see where it's posted.
reset role;
insert into public.discord_webhooks (id, user_id, url, channel_id, label, time_zone) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a', 'https://discord.com/api/webhooks/100000000000000001/' || repeat('a', 68), '200000000000000001', 'Ana''s channel', 'UTC'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b', 'https://discord.com/api/webhooks/100000000000000002/' || repeat('b', 68), '200000000000000002', 'Ben''s channel', 'UTC'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000000c', 'https://discord.com/api/webhooks/100000000000000003/' || repeat('c', 68), '200000000000000003', 'Cat''s channel', 'UTC');
select public.rules_test_as('ana');
do $$
begin
  update public.discord_webhooks set group_id = current_setting('test.gym')::uuid where id = '00000000-0000-4000-8000-0000000000a1';
  assert (select group_id from public.discord_webhooks where id = '00000000-0000-4000-8000-0000000000a1') = current_setting('test.gym')::uuid, 'Ana posts her private group: she made it';
  assert public.rules_test_refused(format($q$ update public.discord_webhooks set group_id = %L where id = '00000000-0000-4000-8000-0000000000a1' $q$, current_setting('test.club'))), 'but not a group she isn''t in';
  update public.discord_webhooks set group_id = current_setting('test.gym')::uuid where id = '00000000-0000-4000-8000-0000000000b1';
  assert (select count(*) from public.group_discord(current_setting('test.gym')::uuid)) = 1, 'and nobody else''s channel: Ben''s is untouched';
end;
$$;
select public.rules_test_as('cat');
do $$
begin
  assert public.rules_test_refused(format($q$ update public.discord_webhooks set group_id = %L where id = '00000000-0000-4000-8000-0000000000c1' $q$, current_setting('test.gym'))), 'Cat can''t post a group she isn''t in';
  update public.discord_webhooks set group_id = current_setting('test.club')::uuid where id = '00000000-0000-4000-8000-0000000000c1';
  assert (select group_id from public.discord_webhooks) = current_setting('test.club')::uuid, 'Cat posts the public group she''s in';
  assert public.rules_test_refused(format($q$ select * from public.group_discord(%L) $q$, current_setting('test.gym'))), 'and can''t see where a group she isn''t in is posted';
end;
$$;
-- Cat in the private group too, but she didn't make it: she can't post it.
reset role;
insert into public.group_members (group_id, user_id, joined_on) values (current_setting('test.gym')::uuid, '00000000-0000-4000-8000-00000000000c', current_date);
select public.rules_test_as('cat');
do $$
declare
  shown record;
  keys text[];
begin
  assert public.rules_test_refused(format($q$ update public.discord_webhooks set group_id = %L $q$, current_setting('test.gym'))), 'a private group: only its maker posts it';
  select * into shown from public.group_discord(current_setting('test.gym')::uuid);
  assert shown.label = 'Ana''s channel' and shown.added_by = 'Ana', 'but every member sees where it''s posted, and who by';
  select array_agg(k order by k) into keys
    from jsonb_object_keys((select to_jsonb(r) from public.group_discord(current_setting('test.gym')::uuid) r limit 1)) k;
  assert keys = array['added_by', 'label'], 'only the channel''s name and who added it: ' || keys::text;
end;
$$;
reset role;
delete from public.group_members where group_id = current_setting('test.gym')::uuid and user_id = '00000000-0000-4000-8000-00000000000c';
select public.rules_test_as('ben');
do $$
begin
  update public.discord_webhooks set group_id = current_setting('test.club')::uuid where id = '00000000-0000-4000-8000-0000000000b1';
  assert (select group_id from public.discord_webhooks) = current_setting('test.club')::uuid, 'Ben posts his public group too';
end;
$$;
-- Discord: who a channel's posts ping, as Discord writes each mention. Only its adder chooses.
do $$
begin
  update public.discord_webhooks set mention = '<@100000000000000001> <@&100000000000000002> @here';
  assert (select mention from public.discord_webhooks) = '<@100000000000000001> <@&100000000000000002> @here', 'Ben''s channel pings who he chose';
  assert public.rules_test_refused($q$ update public.discord_webhooks set mention = '@taylor' $q$), 'only mentions as Discord writes them, never a name';
  assert public.rules_test_refused($q$ update public.discord_webhooks set mention = '<@100000000000000001>  @here' $q$), 'in one form';
  assert public.rules_test_refused(
    $q$ update public.discord_webhooks set mention = '<@100000000000000001> <@100000000000000002> <@100000000000000003> <@100000000000000004> <@100000000000000005> <@100000000000000006>' $q$
  ), 'and 5 at most';
  update public.discord_webhooks set mention = '@everyone' where id = '00000000-0000-4000-8000-0000000000a1';
  assert not found, 'never in anyone else''s channel';
  update public.discord_webhooks set mention = null;
  assert (select mention from public.discord_webhooks) is null, 'and he can stop the pings';
end;
$$;

-- Limits: 50 members (48 more made up here), and 10 groups each.
reset role;
insert into auth.users (id, email)
select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'rules-test-' || n || '@example.invalid' from generate_series(100, 147) n;
insert into public.group_members (group_id, user_id, joined_on)
select current_setting('test.club')::uuid, ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, current_date from generate_series(100, 147) n;
select public.rules_test_as('ana');
do $$
begin
  assert public.rules_test_refused(format($q$ select public.join_group(%L, current_date) $q$, current_setting('test.club_code'))), 'a 51st member is refused';
  for i in 1..9 loop
    perform public.create_group('Group ' || i, 'private', current_date);
  end loop;
  assert (select count(*) from public.group_members where user_id = auth.uid()) = 10, 'Ana is in 10 groups';
  assert public.rules_test_refused($q$ select public.create_group('Eleven', 'private', current_date) $q$), 'an 11th is refused';
end;
$$;

-- The maker leaves: whoever joined first takes over. The last one out: the group goes.
select public.rules_test_as('ben');
do $$
begin
  perform public.leave_group(current_setting('test.club')::uuid);
end;
$$;
reset role;
do $$
begin
  assert (select made_by from public.groups where id = current_setting('test.club')::uuid) = '00000000-0000-4000-8000-00000000000c', 'Cat, who joined first after Ben, takes over';
  assert (select group_id from public.discord_webhooks where id = '00000000-0000-4000-8000-0000000000b1') is null, 'Ben left: his channel stops posting the group';
  assert (select group_id from public.discord_webhooks where id = '00000000-0000-4000-8000-0000000000c1') = current_setting('test.club')::uuid, 'Cat''s still does';
end;
$$;
select public.rules_test_as('ana');
do $$
begin
  perform public.leave_group(current_setting('test.gym')::uuid);
end;
$$;
reset role;
do $$
begin
  assert not exists (select 1 from public.groups where id = current_setting('test.gym')::uuid), 'the last one out: the group is gone';
  assert (select group_id from public.discord_webhooks where id = '00000000-0000-4000-8000-0000000000a1') is null, 'and no channel posts it any more';
  delete from auth.users where id = '00000000-0000-4000-8000-00000000000c';
  assert not exists (select 1 from public.group_members where user_id = '00000000-0000-4000-8000-00000000000c'), 'a deleted account leaves its groups';
  assert (select made_by from public.groups where id = current_setting('test.club')::uuid) is not null, 'and its groups get a new maker';
end;
$$;

-- Photos: each player has one file, <their id>/avatar.jpg, and their photo link can only be that file.
select public.rules_test_as('ana');
do $$
declare
  photo text := 'https://example.supabase.co/storage/v1/object/public/avatars/' || auth.uid() || '/avatar.jpg';
  add_file text := $q$ insert into storage.objects (bucket_id, name) values ('avatars', %L) $q$;
  set_link text := $q$ update public.plank_profiles set avatar_url = %L where user_id = auth.uid() $q$;
begin
  execute format(add_file, auth.uid() || '/avatar.jpg');
  assert public.rules_test_refused(format(add_file, auth.uid() || '/pixel.png')), 'no other files in her folder';
  assert public.rules_test_refused(format(add_file, '00000000-0000-4000-8000-00000000000b/avatar.jpg')), 'or in anyone else''s';
  execute format(set_link, photo || '?v=1727300000000');
  assert (select avatar_url from public.plank_profiles where user_id = auth.uid()) = photo || '?v=1727300000000', 'her photo link, as the site saves it';
  assert public.rules_test_refused(format(set_link, replace(photo, auth.uid()::text, '00000000-0000-4000-8000-00000000000b'))), 'not Ben''s photo';
  assert public.rules_test_refused(format(set_link, replace(photo, 'avatar.jpg', 'pixel.png'))), 'or another file';
  assert public.rules_test_refused(format(set_link, photo || '/../../../../rest/v1/')), 'or a path out of the bucket';
  assert public.rules_test_refused(format(set_link, replace(photo, 'https://', 'http://'))), 'or a link that isn''t https';
end;
$$;

-- Limits on what a player can store: a plank or an attempt keeps at most 100 breaks, and nobody has more
-- than 10,000 planks or 20,000 attempts. Anything within them saves as normal, a whole history at once included.
select public.rules_test_as('ana');
do $$
declare
  breaks jsonb := (select jsonb_agg(jsonb_build_object('at', 612.3, 'ms', 12345678)) from generate_series(1, 100));
  plank text := $q$ insert into public.plank_completions (day, mode, song_id, seconds, pauses) values (current_date, 'ladder', 'dear-john', 404, %L) $q$;
  attempt text := $q$ insert into public.plank_attempts (id, song_id, kind, started_at, ended_at, outcome, reached, pauses, breaks) values (gen_random_uuid(), 'dear-john', 'ladder', now(), now(), 'gave-up', 90, %s, %L) $q$;
begin
  assert public.rules_test_refused(format(plank, breaks || '[{"at": 1, "ms": 1000}]'::jsonb)), 'a plank with 101 breaks is refused';
  assert public.rules_test_refused(format(plank, '{"at": 1, "ms": 1000}')), 'breaks are a list';
  execute format(plank, breaks);
  assert (select jsonb_array_length(pauses) from public.plank_completions where user_id = auth.uid() and song_id = 'dear-john') = 100, 'a plank with 100 long breaks saves';
  assert public.rules_test_refused(format(attempt, 101, breaks || '[{"at": 1, "ms": 1000}]'::jsonb)), 'an attempt with 101 breaks is refused';
  assert public.rules_test_refused(format(attempt, 1, '{"at": 1, "ms": 1000}')), 'its breaks are a list too';
  execute format(attempt, 2, '[{"at": 30.5, "ms": 4000}, {"at": 61, "ms": 12000}]');
  assert (select a.breaks from public.plank_attempts a where a.user_id = auth.uid() and a.song_id = 'dear-john') = '[{"at": 30.5, "ms": 4000}, {"at": 61, "ms": 12000}]', 'an attempt saves with its breaks';
  -- Signing in brings the browser's whole history in one go: here, all she has room for.
  insert into public.plank_completions (day, mode, song_id, seconds, xp)
  select current_date - n, 'daily', 'style', 231, 347 from generate_series(1, 10000 - (select count(*) from public.plank_completions where user_id = auth.uid())::int) n;
  assert (select count(*) from public.plank_completions where user_id = auth.uid()) = 10000, '10,000 planks save, at once';
  insert into public.plank_completions (day, mode, song_id, seconds) values (current_date - 1, 'daily', 'style', 231) on conflict do nothing;
  insert into public.plank_completions (day, mode, song_id, seconds, xp) values (current_date - 1, 'daily', 'style', 231, 300)
    on conflict (user_id, day, mode, song_id) do update set xp = excluded.xp;
  assert (select xp from public.plank_completions where user_id = auth.uid() and day = current_date - 1 and mode = 'daily') = 300, 'at the limit, planks already saved can still change';
  assert public.rules_test_refused($q$ insert into public.plank_completions (day, mode, song_id, seconds) values (current_date, 'ladder', 'the-next-one', 231) $q$), 'but a 10,001st is refused';
  insert into public.plank_attempts (id, song_id, kind, started_at, ended_at, outcome, reached)
  select gen_random_uuid(), 'style', 'daily', now(), now(), 'gave-up', 1 from generate_series(1, 20000 - (select count(*) from public.plank_attempts where user_id = auth.uid()));
  assert public.rules_test_refused($q$ insert into public.plank_attempts (id, song_id, kind, started_at, ended_at, outcome, reached) values (gen_random_uuid(), 'style', 'daily', now(), now(), 'gave-up', 1) $q$), 'and a 20,001st attempt';
end;
$$;
select public.rules_test_as('ben');
do $$
begin
  insert into public.plank_completions (day, mode, song_id, seconds) values (current_date, 'ladder', 'wood', 150);
  assert (select count(*) from public.plank_completions where user_id = auth.uid() and song_id = 'wood' and day = current_date) = 1, 'Ana at her limit holds nobody else up';
end;
$$;

-- Friends, with four more made-up players of their own: Eve, Fay and Gus, and Hal with no name. Eve and Fay
-- become friends; Gus is a stranger to Eve, then shares a group with Fay.
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'rules-test-eve@example.invalid'),
  ('00000000-0000-4000-8000-0000000000e2', 'rules-test-fay@example.invalid'),
  ('00000000-0000-4000-8000-0000000000e3', 'rules-test-gus@example.invalid'),
  ('00000000-0000-4000-8000-0000000000e4', 'rules-test-hal@example.invalid');
insert into public.plank_profiles (user_id, display_name) values
  ('00000000-0000-4000-8000-0000000000e1', 'Eve'),
  ('00000000-0000-4000-8000-0000000000e2', 'Fay'),
  ('00000000-0000-4000-8000-0000000000e3', 'Gus'),
  ('00000000-0000-4000-8000-0000000000e4', null);
insert into public.plank_completions (user_id, day, mode, song_id, seconds, pauses) values
  ('00000000-0000-4000-8000-0000000000e2', current_date, 'daily', 'style', 231, '[{"at": 30, "ms": 4000}]'),
  ('00000000-0000-4000-8000-0000000000e2', current_date - 1, 'daily', 'wood', 150, null),
  ('00000000-0000-4000-8000-0000000000e2', current_date, 'ladder', 'cruel-summer', 178, null);

-- Acts as one of them, by id, the way rules_test_as does.
create function public.rules_test_be(p_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_id::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', case when p_id is null then 'anon' else 'authenticated' end)::text, true);
  perform set_config('role', case when p_id is null then 'anon' else 'authenticated' end, true);
end;
$$;

-- Eve's code. Nobody reads the tables, or the helpers that would make friends of anyone.
select public.rules_test_be('00000000-0000-4000-8000-0000000000e1');
do $$
declare
  code text := public.my_friend_code();
begin
  perform set_config('test.eve_code', code, true);
  assert code ~ '^[2-9A-HJ-NP-Z]{8}$', 'a friend code is 8 letters and digits with no look-alikes: ' || code;
  assert public.my_friend_code() = code, 'and stays the same';
  assert public.rules_test_refused($q$ select * from public.friend_profiles $q$), 'no reading friend codes directly';
  assert public.rules_test_refused($q$ select * from public.friendships $q$), 'or friendships';
  assert public.rules_test_refused($q$ select * from public.friend_requests $q$), 'or requests';
  assert public.rules_test_refused($q$ select * from public.friend_invites $q$), 'or invites';
  assert public.rules_test_refused($q$ insert into public.friendships (user_a, user_b) values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e3') $q$), 'no making friends directly';
  assert public.rules_test_refused($q$ select public.friends_make('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e3') $q$), 'or through the helper';
  assert public.rules_test_refused($q$ select public.friend_request_to('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000e1') $q$), 'or sending someone else''s request';
  assert public.rules_test_refused($q$ select public.are_friends('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000e3') $q$), 'or asking about two other players';
end;
$$;
select public.rules_test_be('00000000-0000-4000-8000-0000000000e4');
do $$
begin
  assert public.rules_test_refused($q$ select public.my_friend_code() $q$), 'Hal needs a name for a friend code';
  assert public.friends_now(current_date, null) ->> 'code' is null, 'and his friends list has none to share';
end;
$$;
select public.rules_test_be(null);
do $$
begin
  assert public.rules_test_refused($q$ select public.friends_now(current_date, null) $q$), 'signed out, there''s no friends list';
  assert public.rules_test_refused(format($q$ select public.friend_lookup(%L) $q$, current_setting('test.eve_code'))), 'and no looking up a code';
end;
$$;

-- Fay finds Eve by her code, typed loosely, and asks.
select public.rules_test_be('00000000-0000-4000-8000-0000000000e2');
do $$
declare
  code text := current_setting('test.eve_code');
  found json := public.friend_lookup(' ' || lower(substr(code, 1, 4)) || '-' || lower(substr(code, 5)) || ' ');
begin
  assert found ->> 'name' = 'Eve' and found ->> 'status' = 'none', 'a code shows its player''s name, and that they aren''t friends yet';
  assert (select array_agg(k order by k) from json_object_keys(found) k) = array['avatar_url', 'name', 'status', 'user_id'], 'and nothing else';
  assert public.friend_lookup('ZZZZZZZZ') is null, 'a code that isn''t anyone''s finds nobody';
  assert public.rules_test_refused($q$ select public.request_friend('ZZZZZZZZ') $q$), 'or can be asked';
  assert public.request_friend(code) = 'sent', 'Fay asks';
  assert public.request_friend(code) = 'sent', 'asking again changes nothing';
  assert public.friend_lookup(code) ->> 'status' = 'sent', 'and her request is waiting';
  assert json_array_length(public.friends_now(current_date, null) -> 'requests_out') = 1, 'in her list of requests sent';
  assert public.rules_test_refused(format($q$ select public.request_friend(%L) $q$, public.my_friend_code())), 'nobody asks themselves';
end;
$$;

-- Eve accepts. Friends see each other's name, photo, online, planking now, and today's song: nothing else.
select public.rules_test_be('00000000-0000-4000-8000-0000000000e1');
do $$
declare
  now_list json := public.friends_now(current_date, null);
  fay json;
begin
  assert json_array_length(now_list -> 'requests_in') = 1 and now_list -> 'requests_in' -> 0 ->> 'name' = 'Fay', 'Eve has Fay''s request';
  assert json_array_length(now_list -> 'friends') = 0, 'before she answers, no friends';
  assert public.rules_test_refused($q$ select public.answer_friend_request('00000000-0000-4000-8000-0000000000e3', true) $q$), 'there''s no request from Gus to accept';
  perform public.answer_friend_request('00000000-0000-4000-8000-0000000000e2', true);
  now_list := public.friends_now(current_date, null);
  fay := now_list -> 'friends' -> 0;
  assert json_array_length(now_list -> 'requests_in') = 0, 'the request has gone';
  assert fay ->> 'name' = 'Fay', 'and Fay is her friend';
  assert (select array_agg(k order by k) from json_object_keys(fay) k)
    = array['avatar_url', 'clean_today', 'name', 'online', 'planked_at', 'planked_song', 'planked_today', 'planking', 'seen_at', 'since', 'user_id'],
    'a friend shows only name, photo, since when, online, planking now and today''s song: ' || (select string_agg(k, ', ') from json_object_keys(fay) k);
  assert (fay ->> 'online')::boolean, 'Fay checked in a moment ago: online';
  assert (fay ->> 'planked_today')::boolean and not (fay ->> 'clean_today')::boolean, 'she planked today''s song, with breaks: no 🟩, and no count of them';
  assert fay ->> 'planked_song' = 'style', 'today''s song, never her ladder';
  assert json_array_length((public.friend_card('00000000-0000-4000-8000-0000000000e2') -> 'days')) = 2, 'her card has the days she planked today''s song, for her streak';
  assert public.rules_test_refused($q$ select public.friend_card('00000000-0000-4000-8000-0000000000e3') $q$), 'Gus isn''t a friend: no card';
end;
$$;

-- Fay planks, then hides that she's online.
select public.rules_test_be('00000000-0000-4000-8000-0000000000e2');
select public.friends_now(current_date, now() + interval '4 minutes');
select public.rules_test_be('00000000-0000-4000-8000-0000000000e1');
do $$
begin
  assert (public.friends_now(current_date, null) -> 'friends' -> 0 ->> 'planking')::boolean, 'Eve sees Fay planking now';
end;
$$;
select public.rules_test_be('00000000-0000-4000-8000-0000000000e2');
select public.friends_now(current_date, now() + interval '1 day');
select public.set_show_online(false);
select public.rules_test_be('00000000-0000-4000-8000-0000000000e1');
do $$
declare
  fay json := public.friends_now(current_date, null) -> 'friends' -> 0;
begin
  assert not (fay ->> 'online')::boolean and not (fay ->> 'planking')::boolean, 'hidden: never online or planking';
  assert fay ->> 'seen_at' is null and fay ->> 'planked_at' is null, 'and no times';
  assert (fay ->> 'planked_today')::boolean, 'but still whether she planked today''s song, as a group shows';
end;
$$;
reset role;
do $$
begin
  assert (select planking_until from public.friend_profiles where user_id = '00000000-0000-4000-8000-0000000000e2') <= now() + interval '2 hours',
    'a plank counts as planking now for 2 hours at most';
end;
$$;
select public.rules_test_be('00000000-0000-4000-8000-0000000000e2');
select public.set_show_online(true);
select public.friends_now(current_date, null);
select public.rules_test_be('00000000-0000-4000-8000-0000000000e1');
do $$
begin
  assert not (public.friends_now(current_date, null) -> 'friends' -> 0 ->> 'planking')::boolean, 'a plank over is over';
end;
$$;

-- Gus is a stranger to Eve: he can find her by code, and nothing more.
select public.rules_test_be('00000000-0000-4000-8000-0000000000e3');
do $$
begin
  assert json_array_length(public.friends_now(current_date, null) -> 'friends') = 0, 'Gus has no friends yet';
  assert public.invite_friends('room', array['00000000-0000-4000-8000-0000000000e1'::uuid], 'abcdefghij', 'style', null) = 0, 'and can''t invite Eve anywhere';
  assert not public.friend_inbox_sender('friend-inbox:00000000-0000-4000-8000-0000000000e1'), 'or nudge her inbox';
  assert not public.friend_inbox_listener('friend-inbox:00000000-0000-4000-8000-0000000000e1'), 'or listen to it';
  assert public.request_friend(current_setting('test.eve_code')) = 'sent', 'he asks';
  assert public.friend_inbox_sender('friend-inbox:00000000-0000-4000-8000-0000000000e1'), 'and can nudge her about it';
end;
$$;

-- Eve blocks him. Everything between them goes, and nothing he sends reaches her. He's never told.
select public.rules_test_be('00000000-0000-4000-8000-0000000000e1');
do $$
begin
  assert public.friend_inbox_listener('friend-inbox:00000000-0000-4000-8000-0000000000e1'), 'Eve listens to her own inbox';
  perform public.block_player('00000000-0000-4000-8000-0000000000e3');
  assert json_array_length(public.friends_now(current_date, null) -> 'requests_in') = 0, 'his request has gone';
  assert json_array_length(public.friends_now(current_date, null) -> 'blocked') = 1, 'and he''s on her blocked list';
end;
$$;
select public.rules_test_be('00000000-0000-4000-8000-0000000000e3');
do $$
begin
  assert public.request_friend(current_setting('test.eve_code')) = 'sent', 'Gus asks again, and it seems to go';
  assert public.friend_lookup(current_setting('test.eve_code')) is null, 'her code finds nobody for him';
  assert not public.friend_inbox_sender('friend-inbox:00000000-0000-4000-8000-0000000000e1'), 'and he can''t nudge her';
end;
$$;
select public.rules_test_be('00000000-0000-4000-8000-0000000000e1');
do $$
begin
  assert json_array_length(public.friends_now(current_date, null) -> 'requests_in') = 0, 'but it never reaches Eve';
  perform public.unblock_player('00000000-0000-4000-8000-0000000000e3');
  assert json_array_length(public.friends_now(current_date, null) -> 'blocked') = 0, 'she unblocks him';
end;
$$;

-- Invites: Eve invites Fay into a room, then a group. Gus, not a friend, is skipped.
select public.rules_test_be('00000000-0000-4000-8000-0000000000e1');
do $$
declare
  made public.groups := public.create_group('Tuesday crew', 'private', current_date);
begin
  perform set_config('test.crew', made.id::text, true);
  assert public.invite_friends('room', array['00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000e3']::uuid[], 'abcdefghij', 'style', null) = 1, 'a room invite goes to Fay, not Gus';
  assert public.invite_friends('room', array['00000000-0000-4000-8000-0000000000e2']::uuid[], 'klmnopqrst', 'wood', null) = 1, 'a second room invite';
  assert public.invite_friends('group', array['00000000-0000-4000-8000-0000000000e2']::uuid[], null, null, made.id) = 1, 'and a group invite';
  assert public.rules_test_refused($q$ select public.invite_friends('room', array['00000000-0000-4000-8000-0000000000e2']::uuid[], 'NOT A ROOM', 'style', null) $q$), 'only a real room code';
  assert public.rules_test_refused(format($q$ select public.invite_friends('group', array['00000000-0000-4000-8000-0000000000e2']::uuid[], null, null, %L) $q$, gen_random_uuid())), 'only into her own groups';
end;
$$;
select public.rules_test_be('00000000-0000-4000-8000-0000000000e2');
do $$
declare
  invites json := public.friends_now(current_date, null) -> 'invites';
  room json;
  team json;
begin
  assert json_array_length(invites) = 2, 'Fay has one room invite (the newer replaced the older) and one group invite: ' || invites::text;
  select value into room from json_array_elements(invites) where value ->> 'kind' = 'room';
  select value into team from json_array_elements(invites) where value ->> 'kind' = 'group';
  assert room ->> 'room_code' = 'klmnopqrst' and room ->> 'song_id' = 'wood', 'the room''s code and song';
  assert team ->> 'group_name' = 'Tuesday crew', 'and the group''s name';
  perform public.accept_group_invite((team ->> 'id')::uuid, current_date);
  assert exists (select 1 from public.group_members where group_id = current_setting('test.crew')::uuid and user_id = auth.uid()), 'accepting joins the group';
  perform public.dismiss_invite((room ->> 'id')::uuid);
  assert json_array_length(public.friends_now(current_date, null) -> 'invites') = 0, 'Not now clears the room invite';
end;
$$;
select public.rules_test_be('00000000-0000-4000-8000-0000000000e1');
do $$
begin
  assert public.invite_friends('group', array['00000000-0000-4000-8000-0000000000e2']::uuid[], null, null, current_setting('test.crew')::uuid) = 0, 'nobody is invited to a group they''re in';
end;
$$;

-- Gus and Fay share a group: they can ask each other from it, with no code. Gus and Eve can't.
select public.rules_test_be('00000000-0000-4000-8000-0000000000e3');
do $$
declare
  made public.groups := public.create_group('Gus club', 'public', current_date);
begin
  perform set_config('test.gus_club_code', made.invite_code, true);
end;
$$;
select public.rules_test_be('00000000-0000-4000-8000-0000000000e2');
do $$
begin
  perform public.join_group(current_setting('test.gus_club_code'), current_date);
  assert (select count(*) from public.friend_suggestions() where name = 'Gus') = 1, 'Fay is offered Gus, from the group they share';
  assert (select count(*) from public.friend_suggestions() where name = 'Eve') = 0, 'never a friend already';
  assert public.request_friend_from_group('00000000-0000-4000-8000-0000000000e3') = 'sent', 'Fay asks Gus from the group';
  assert (select count(*) from public.friend_suggestions() where name = 'Gus') = 0, 'and he''s not offered again';
end;
$$;
select public.rules_test_be('00000000-0000-4000-8000-0000000000e3');
do $$
begin
  assert public.rules_test_refused($q$ select public.request_friend_from_group('00000000-0000-4000-8000-0000000000e1') $q$), 'Gus shares no group with Eve: he needs her code';
  assert public.request_friend_from_group('00000000-0000-4000-8000-0000000000e2') = 'friends', 'asking someone who''s asked you makes you friends';
  perform public.remove_friend('00000000-0000-4000-8000-0000000000e2');
  assert json_array_length(public.friends_now(current_date, null) -> 'friends') = 0, 'either friend can end it';
end;
$$;

-- A new code: the old one stops working.
select public.rules_test_be('00000000-0000-4000-8000-0000000000e1');
do $$
declare
  old text := current_setting('test.eve_code');
  made text := public.new_friend_code();
begin
  assert made <> old and public.my_friend_code() = made, 'Eve has a new code';
  assert public.friend_lookup(old) is null, 'and the old one finds nobody';
end;
$$;

-- Limits: 30 requests sent a day, 50 waiting at once, and 200 friends each. 250 made-up players to ask.
reset role;
insert into auth.users (id, email)
select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'rules-test-' || n || '@example.invalid' from generate_series(1000, 1249) n;
insert into public.plank_profiles (user_id, display_name)
select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Player ' || n from generate_series(1000, 1249) n;
insert into public.friend_profiles (user_id, code)
select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, public.friend_code_new() from generate_series(1000, 1249) n;
select set_config('test.codes', (
  select string_agg(code, ',' order by user_id) from public.friend_profiles
  where user_id between '00000000-0000-4000-8000-000000001000' and '00000000-0000-4000-8000-000000001249'
), true);
select public.rules_test_be('00000000-0000-4000-8000-0000000000e3');
do $$
declare
  codes text[] := string_to_array(current_setting('test.codes'), ',');
  sent int := 0;
begin
  assert public.rules_test_refused($q$ delete from public.friend_sends $q$), 'no clearing the count of requests sent';
  -- Gus asked Eve earlier today: that counts towards the 30.
  for i in 1..40 loop
    exit when public.rules_test_refused(format($q$ select public.request_friend(%L) $q$, codes[i]));
    sent := sent + 1;
  end loop;
  assert sent = 29, 'Gus can send 30 requests a day, the one from earlier included: ' || sent;
end;
$$;
-- A new day, with 50 of his requests waiting.
reset role;
delete from public.friend_sends where user_id = '00000000-0000-4000-8000-0000000000e3';
insert into public.friend_requests (from_user, to_user)
select '00000000-0000-4000-8000-0000000000e3', ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from generate_series(1100, 1120) n;
select public.rules_test_be('00000000-0000-4000-8000-0000000000e3');
do $$
begin
  assert json_array_length(public.friends_now(current_date, null) -> 'requests_out') = 50, 'Gus has 50 requests waiting';
  assert public.rules_test_refused(format($q$ select public.request_friend(%L) $q$, (string_to_array(current_setting('test.codes'), ','))[200])), 'a 51st is refused';
end;
$$;
-- Eve with 200 friends.
reset role;
insert into public.friendships (user_a, user_b)
select '00000000-0000-4000-8000-0000000000e1', ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from generate_series(1050, 1248) n;
reset role;
insert into public.friend_requests (from_user, to_user) values ('00000000-0000-4000-8000-000000001249', '00000000-0000-4000-8000-0000000000e1');
select public.rules_test_be('00000000-0000-4000-8000-0000000000e1');
do $$
begin
  assert json_array_length(public.friends_now(current_date, null) -> 'friends') = 200, 'Eve has 200 friends';
  assert public.rules_test_refused($q$ select public.answer_friend_request('00000000-0000-4000-8000-000000001249', true) $q$), 'a 201st friend is refused';
  perform public.answer_friend_request('00000000-0000-4000-8000-000000001249', false);
  assert json_array_length(public.friends_now(current_date, null) -> 'requests_in') = 0, 'declining clears it quietly';
end;
$$;

rollback;
