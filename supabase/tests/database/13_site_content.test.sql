begin;
\ir _helpers.psql
select no_plan();

create temp table fx (key text primary key, id uuid);
grant all on fx to anon, authenticated;

insert into fx values
  ('content', tests.create_user('s.content@example.test')),
  ('admin', tests.create_user('s.admin@example.test')),
  ('member', tests.create_user('s.member@example.test'));
select tests.grant_role((select id from fx where key = 'content'), 'content_manager');
select tests.grant_role((select id from fx where key = 'admin'), 'administrator');

-- ---------------------------------------------------------------------------
-- Banners
-- ---------------------------------------------------------------------------
select tests.as_user('s.member@example.test');
select throws_ok(
  $$ insert into public.banners (title) values ('Hack') $$,
  '42501', null, 'members cannot add banners'
);

select tests.as_user('s.content@example.test');
select throws_ok(
  $$ insert into public.banners (title, target_url) values ('Bad', 'javascript:alert(1)') $$,
  '23514', null, 'banner links must be a page on this site or https'
);
with t as (
  insert into public.banners (title, target_url, sort_order) values ('Diwali offers', '/search?category=new_project', 1)
  returning id
)
insert into fx select 'live', id from t;
insert into public.banners (title, target_url, starts_at) values ('Next month', '/search', now() + interval '30 days');
insert into public.banners (title, target_url, is_active) values ('Switched off', '/search', false);

select tests.as_anon();
select is(
  (select array_agg(title) from public.banners where title in ('Diwali offers', 'Next month', 'Switched off')),
  array['Diwali offers'], 'visitors see only live, in-date banners'
);

-- ---------------------------------------------------------------------------
-- Floating button
-- ---------------------------------------------------------------------------
select tests.as_user('s.content@example.test');
select throws_ok(
  $$ update public.floating_action set is_active = true, target_url = null $$,
  '23514', null, 'the floating button needs a link to be switched on'
);
select lives_ok(
  $$ update public.floating_action set is_active = true, icon = 'whatsapp', label = 'Chat on WhatsApp', target_url = 'https://wa.me/919800000000' $$,
  'content managers set up the floating button'
);

-- ---------------------------------------------------------------------------
-- Click counting (destination always comes from the database)
-- ---------------------------------------------------------------------------
select tests.as_anon();
select is((select public.follow_site_link('floating', 'visitor-1')), 'https://wa.me/919800000000', 'a click returns the configured link');
select public.follow_site_link('floating', 'visitor-1');
select public.follow_site_link('floating', 'visitor-2');
select is(
  (select public.follow_site_link('banner:' || (select id from fx where key = 'live')::text, 'visitor-1')),
  '/search?category=new_project', 'banner clicks return the banner''s link'
);
select is((select public.follow_site_link('banner:00000000-0000-0000-0000-000000000000')), null, 'unknown links go nowhere');
select is((select public.follow_site_link('https://evil.example')), null, 'arbitrary addresses are never returned');
select tests.as_postgres();
select is((select clicks from public.link_clicks where link_key = 'floating' and day = current_date), 2,
  'each visitor counts once an hour');
select tests.as_user('s.member@example.test');
select is((select count(*)::int from public.link_clicks), 0, 'members cannot see click counts');

-- ---------------------------------------------------------------------------
-- Feature switches
-- ---------------------------------------------------------------------------
select tests.as_anon();
select ok(not (select app.feature_enabled('referral_programme')), 'future modules start switched off');
select ok(not (select app.feature_enabled('no_such_feature')), 'unknown features count as off');
select tests.as_user('s.content@example.test');
select is(
  (select tests.rows_affected($$ update public.feature_flags set enabled = true where key = 'popup' $$)),
  0, 'content managers cannot change feature switches'
);
select tests.as_user('s.admin@example.test');
select lives_ok($$ update public.feature_flags set enabled = true where key = 'map_view' $$, 'administrators switch features on');
select throws_ok($$ update public.feature_flags set label = 'x' where key = 'map_view' $$, '42501', null, 'only the on/off state can be changed');
select tests.as_postgres();
select ok((select app.feature_enabled('map_view')), 'the switch takes effect');
select is((select count(*)::int from public.audit_log where action = 'feature.on' and entity_id = 'map_view'), 1, 'switch changes are audited');

select * from finish();
rollback;
