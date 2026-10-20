begin;
\ir _helpers.psql
select no_plan();

create temp table fx (key text primary key, id uuid);
grant all on fx to anon, authenticated;

insert into fx values
  ('builder_user', tests.create_user('g.builder@example.test')),
  ('owner', tests.create_user('g.owner@example.test')),
  ('moderator', tests.create_user('g.moderator@example.test'));
select tests.grant_role((select id from fx where key = 'owner'), 'owner');
select tests.grant_role((select id from fx where key = 'moderator'), 'moderator');

-- A builder account gets a directory entry through its company profile.
select tests.grant_role((select id from fx where key = 'builder_user'), 'builder');
insert into public.builder_profiles (user_id, company_name) values ((select id from fx where key = 'builder_user'), 'Skyline  Homes');
select is((select name from public.builders where user_id = (select id from fx where key = 'builder_user')),
  'Skyline Homes', 'a builder account appears in the builder directory with a tidy name');
select throws_ok(
  $$ insert into public.builders (name) values ('skyline homes') $$,
  '23505', null, 'the same builder cannot be added twice under a different capitalisation'
);
insert into public.builders (name) values ('Riverside Developers');
insert into fx select 'riverside', id from public.builders where name = 'Riverside Developers';
insert into fx select 'skyline', id from public.builders where name = 'Skyline Homes';

-- ---------------------------------------------------------------------------
-- New projects and builders
-- ---------------------------------------------------------------------------
select tests.as_user('g.builder@example.test');
with t as (
  insert into public.listings (title, category, purpose, owner_id, builder_id, registration_verified, configurations, price_amount, price_max)
  values ('Skyline Towers', 'new_project', 'sale', auth.uid(), (select id from fx where key = 'riverside'), true,
          array['2 BHK', ' 3 BHK ', '2 BHK', ''], 5000000, 9000000)
  returning id
)
insert into fx select 'project', id from t;
select tests.as_postgres();
select is(
  (select builder_id from public.listings where id = (select id from fx where key = 'project')),
  (select id from fx where key = 'skyline'), 'a builder''s project is always filed under their own builder record'
);
select ok(not (select registration_verified from public.listings where id = (select id from fx where key = 'project')),
  'builders cannot mark their own registration number as checked');
select is((select configurations from public.listings where id = (select id from fx where key = 'project')),
  array['2 BHK', '3 BHK'], 'configurations are tidied and de-duplicated');
select throws_ok(
  $$ update public.listings set price_max = 100 where id = (select id from fx where key = 'project') $$,
  '23514', null, 'the top of a price range cannot be below the starting price'
);

select tests.as_user('g.owner@example.test');
select throws_ok(
  $$ insert into public.listings (title, category, purpose, owner_id) values ('Fake launch', 'new_project', 'sale', auth.uid()) $$,
  '42501', null, 'owners without a builder record cannot list new projects'
);

-- The team can file a project under any builder and confirm the registration.
select tests.as_postgres();
update public.listings set status = 'published', published_at = now(), city_id = null where id = (select id from fx where key = 'project');
select tests.as_user('g.moderator@example.test');
select lives_ok(
  $$ select public.admin_set_listing_project((select id from fx where key = 'project'), (select id from fx where key = 'riverside'), true) $$,
  'moderators move a project to another builder and confirm its registration'
);
select tests.as_postgres();
select ok((select registration_verified from public.listings where id = (select id from fx where key = 'project')),
  'the team''s confirmation is kept');

select tests.as_anon();
select is(
  (select count(*)::int from public.search_listings(p_builder_id => (select id from fx where key = 'riverside'))),
  1, 'search filters by builder'
);
select is(
  (select builder_name from public.search_listings(p_builder_id => (select id from fx where key = 'riverside'))),
  'Riverside Developers', 'results carry the builder name'
);

select tests.as_user('g.moderator@example.test');
select is((select public.admin_merge_builders((select id from fx where key = 'riverside'), (select id from fx where key = 'skyline'))),
  1, 'merging moves the duplicate builder''s projects');
select tests.as_postgres();
select is((select builder_id from public.listings where id = (select id from fx where key = 'project')),
  (select id from fx where key = 'skyline'), 'the project now belongs to the kept builder');

-- ---------------------------------------------------------------------------
-- Availability
-- ---------------------------------------------------------------------------
with t as (
  insert into public.listings (title, purpose, owner_id, status, published_at, postal_code, public_lat, public_lng)
  values ('Near flat', 'rent', (select id from fx where key = 'owner'), 'published', now(), '411 045', 18.56, 73.78),
         ('Far flat', 'rent', (select id from fx where key = 'owner'), 'published', now(), '400001', 18.94, 72.83)
  returning id, title
)
insert into fx select case title when 'Near flat' then 'near' else 'far' end, id from t;

select tests.as_user('g.owner@example.test');
select lives_ok(
  $$ select public.set_listing_availability((select id from fx where key = 'near'), 'under_negotiation') $$,
  'the owner marks a listing as under negotiation'
);
select tests.as_anon();
select is(
  (select availability from public.search_listings(p_postal_code => '411045')),
  'under_negotiation', 'it still shows in search, labelled'
);
select tests.as_user('g.owner@example.test');
select public.set_listing_availability((select id from fx where key = 'near'), 'unavailable');
select tests.as_anon();
select is((select count(*)::int from public.search_listings(p_postal_code => '411045')), 0,
  'unavailable listings leave search results');
select tests.as_user('g.moderator@example.test');
select public.set_listing_availability((select id from fx where key = 'near'), 'available');

-- ---------------------------------------------------------------------------
-- PIN code and distance
-- ---------------------------------------------------------------------------
select tests.as_anon();
select is(
  (select array_agg(title) from public.search_listings(p_postal_code => ' 411045 ')),
  array['Near flat'], 'PIN code search ignores spaces'
);
select is(
  (select array_agg(title) from public.search_listings(p_near_lat => 18.52, p_near_lng => 73.86, p_radius_km => 15, p_sort => 'distance')),
  array['Near flat'], 'near-me search only returns homes within the radius'
);
select ok(
  (select distance_km between 5 and 15 from public.search_listings(p_near_lat => 18.52, p_near_lng => 73.86, p_radius_km => 15)),
  'results carry the distance'
);
select is(
  (select array_agg(title) from public.search_listings(p_near_lat => 18.52, p_near_lng => 73.86, p_radius_km => 100, p_sort => 'distance')),
  array['Near flat'], 'Mumbai is more than 100 km from Pune, so it stays out'
);
select throws_ok(
  $$ select * from public.search_listings(p_near_lat => 123, p_near_lng => 73) $$,
  '22023', null, 'impossible coordinates are refused'
);

-- Coordinates are stored rounded for approximate addresses.
select tests.as_postgres();
select public.worker_set_listing_coordinates((select id from fx where key = 'far'), 18.938912, 72.835321);
select tests.as_postgres();
select is((select public_lat::text || ',' || public_lng::text from public.listings where id = (select id from fx where key = 'far')),
  '18.94000,72.84000', 'approximate addresses keep only about 1 km precision');
select ok(
  (select count(*) from public.job_queue where kind = 'geocode_listing' and listing_id = (select id from fx where key = 'near')) >= 1,
  'new listings with a PIN code are queued for map coordinates'
);

-- Projects the team adds for a builder account (e.g. the Excel import) link to that builder.
select tests.as_postgres();
insert into public.listings (title, category, purpose, owner_id)
values ('Imported Skyline Heights', 'new_project', 'sale', (select id from fx where key = 'builder_user'));
select is((select builder_id from public.listings where title = 'Imported Skyline Heights'),
  (select id from fx where key = 'skyline'), 'a project added by the team for a builder account links to that builder');

select * from finish();
rollback;
