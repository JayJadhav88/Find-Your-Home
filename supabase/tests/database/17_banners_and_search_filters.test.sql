begin;
\ir _helpers.psql
select no_plan();

create temp table fx (key text primary key, id uuid);
grant all on fx to anon, authenticated;
insert into fx values ('owner', tests.create_user('s.owner@example.test'));
select tests.grant_role((select id from fx where key = 'owner'), 'owner');

-- ---------------------------------------------------------------------------
-- Banner areas
-- ---------------------------------------------------------------------------
insert into public.banners (title) values ('S old style banner');
select is((select placement from public.banners where title = 'S old style banner'), 'top', 'banners default to the top area');
insert into public.banners (title, placement) values ('S offer', 'offers');
select is((select placement from public.banners where title = 'S offer'), 'offers', 'banners can go in the offers row');
select throws_ok($$ insert into public.banners (title, placement) values ('S bad', 'sidebar') $$, '23514', null, 'only the two areas exist');
select tests.as_anon();
select is((select count(*)::int from public.banners where title in ('S old style banner', 'S offer')), 2, 'visitors see live banners in both areas');

-- ---------------------------------------------------------------------------
-- Parking and photos filters
-- ---------------------------------------------------------------------------
select tests.as_postgres();
with t as (
  insert into public.listings (title, description, category, purpose, owner_id, status, published_at, first_published_at, parking_spaces)
  values ('S flat with two parking', 'Zqxparking test flat with two car parking spaces and photos.', 'resale', 'sale',
          (select id from fx where key = 'owner'), 'published', now(), now(), 2)
  returning id
)
insert into fx select 'parking2', id from t;
with t as (
  insert into public.listings (title, description, category, purpose, owner_id, status, published_at, first_published_at, parking_spaces)
  values ('S flat without parking', 'Zqxparking test flat without car parking and without photos.', 'resale', 'sale',
          (select id from fx where key = 'owner'), 'published', now(), now(), 0)
  returning id
)
insert into fx select 'parking0', id from t;
select tests.fake_upload('listing-uploads', (select id from fx where key = 'parking2')::text || '/3b6d1c56-6f1e-4b8e-9a43-9a0e2f1d6c11.jpg');
insert into public.listing_media (listing_id, upload_key, public_key, is_cover)
values ((select id from fx where key = 'parking2'),
        (select id from fx where key = 'parking2')::text || '/3b6d1c56-6f1e-4b8e-9a43-9a0e2f1d6c11.jpg',
        (select id from fx where key = 'parking2')::text || '/public.jpg', true);

select tests.as_anon();
select is(
  (select array_agg(title order by title) from public.search_listings(p_q => 'zqxparking', p_min_parking => 1::smallint)),
  array['S flat with two parking'], 'at least one parking space leaves out homes without parking'
);
select is(
  (select array_agg(title order by title) from public.search_listings(p_q => 'zqxparking', p_with_photos => true)),
  array['S flat with two parking'], 'with photos only leaves out homes without photos'
);
select is(
  (select count(*)::int from public.search_listings(p_q => 'zqxparking')),
  2, 'without the new filters both homes are found'
);

select * from finish();
rollback;
