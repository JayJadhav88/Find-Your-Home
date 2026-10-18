begin;
\ir _helpers.psql
select no_plan();

create temp table fx (key text primary key, id uuid);
grant all on fx to anon, authenticated;

insert into fx values
  ('owner', tests.create_user('cat.owner@example.test')),
  ('builder', tests.create_user('cat.builder@example.test')),
  ('admin', tests.create_user('cat.admin@example.test')),
  ('buyer', tests.create_user('cat.buyer@example.test'));
select tests.grant_role((select id from fx where key = 'owner'), 'owner');
select tests.grant_role((select id from fx where key = 'admin'), 'administrator');

update public.currencies set is_enabled = true where code = 'USD';
with t as (insert into public.locations (level, name, slug, country_code) values ('country', 'Catland', 'catland', 'ZX') returning id)
insert into fx select 'country', id from t;
with t as (insert into public.locations (parent_id, level, name, slug, country_code)
           values ((select id from fx where key = 'country'), 'city', 'Cat City', 'cat-city', 'ZX') returning id)
insert into fx select 'city', id from t;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
select tests.as_user('cat.owner@example.test');
with t as (insert into public.listings (title, purpose, owner_id) values ('Legacy sale', 'sale', auth.uid()) returning id)
insert into fx select 'legacy', id from t;
select is((select category::text from public.listings where id = (select id from fx where key = 'legacy')), 'resale',
  'a sale listing without a category becomes resale');

with t as (insert into public.listings (title, category, owner_id, purpose) values ('Flat to let', 'rental', auth.uid(), 'sale') returning id)
insert into fx select 'rental', id from t;
select is((select purpose::text from public.listings where id = (select id from fx where key = 'rental')), 'rent',
  'rental listings are kept as rent for older filters');

select throws_ok(
  $$insert into public.listings (title, category, owner_id, purpose) values ('Fake project', 'new_project', auth.uid(), 'sale')$$,
  '42501', 'Only verified builders can list new projects', 'owners cannot list new projects');
select throws_ok(
  $$update public.listings set category = 'new_project' where id = (select id from fx where key = 'legacy')$$,
  '42501', null, 'owners cannot switch a listing to new project');

-- Builder role, granted by an administrator, creates a public builder profile.
select tests.as_user('cat.admin@example.test');
select lives_ok($$select public.admin_set_role((select id from fx where key = 'builder'), 'builder', true)$$,
  'administrators can approve a builder');
select tests.as_anon();
select is((select company_name from public.builder_profiles where user_id = (select id from fx where key = 'builder')),
  'cat.builder', 'the builder profile is public');

select tests.as_user('cat.builder@example.test');
with t as (
  insert into public.listings (title, category, owner_id, purpose, description, property_type_id, price_amount, currency,
                               country_id, city_id, area_unit, area_value)
  values ('Skyline Residences — 2 BHK', 'new_project', auth.uid(), 'rent',
          'Brand new two-bedroom homes in a gated project, possession next year.',
          (select id from public.property_types where slug = 'apartment'), 120000, 'USD',
          (select id from fx where key = 'country'), (select id from fx where key = 'city'), 'sq_m', 70)
  returning id)
insert into fx select 'project', id from t;
select is((select purpose::text from public.listings where id = (select id from fx where key = 'project')), 'sale',
  'new projects are always for sale');
select lives_ok($$update public.builder_profiles set registration_number = 'REG-123' where user_id = auth.uid()$$,
  'builders edit their own profile');

-- Videos
select lives_ok(
  $$insert into public.listing_videos (listing_id, provider, video_id) values ((select id from fx where key = 'project'), 'youtube', 'dQw4w9WgXcQ')$$,
  'builders add a YouTube video');
select lives_ok(
  $$insert into public.listing_videos (listing_id, provider, video_id, instagram_kind) values ((select id from fx where key = 'project'), 'instagram', 'C1a2B3c4D5e', 'reel')$$,
  'builders add an Instagram reel');
select throws_ok(
  $$insert into public.listing_videos (listing_id, provider, video_id) values ((select id from fx where key = 'project'), 'youtube', '<script>')$$,
  '23514', null, 'invalid video ids are rejected');

-- Submitting a new project needs a project name.
select tests.as_postgres();
select tests.fake_upload('listing-uploads', (select id from fx where key = 'project')::text || '/1b6d1c56-6f1e-4b8e-9a43-9a0e2f1d6c11.jpg');
insert into public.listing_media (listing_id, upload_key, is_cover, mime_type, bytes)
values ((select id from fx where key = 'project'), (select id from fx where key = 'project')::text || '/1b6d1c56-6f1e-4b8e-9a43-9a0e2f1d6c11.jpg', true, 'image/jpeg', 1000);
select tests.as_user('cat.builder@example.test');
select throws_ok($$select public.submit_listing((select id from fx where key = 'project'))$$,
  '22023', 'Listing is incomplete', 'a new project needs a project name before review');
update public.listings set project_name = 'Skyline Residences' where id = (select id from fx where key = 'project');
select is(public.submit_listing((select id from fx where key = 'project'))::text, 'pending_review', 'complete new projects can be submitted');

select tests.as_anon();
select is((select count(*)::int from public.listing_videos where listing_id = (select id from fx where key = 'project')), 0,
  'videos of unpublished listings are hidden');
select tests.as_postgres();
update public.listings set status = 'published', published_at = now() where id = (select id from fx where key = 'project');
select tests.as_anon();
select is((select count(*)::int from public.listing_videos where listing_id = (select id from fx where key = 'project')), 2,
  'videos of published listings are public');
select is((select category::text from public.search_listings(p_category => 'new_project') where id = (select id from fx where key = 'project')),
  'new_project', 'search filters by category');
select is((select count(*)::int from public.search_listings(p_category => 'rental') where id = (select id from fx where key = 'project')), 0,
  'new projects do not appear under rentals');

-- ---------------------------------------------------------------------------
-- Spreadsheet import
-- ---------------------------------------------------------------------------
select tests.as_user('cat.owner@example.test');
select throws_ok(
  $$select public.admin_import_listings(auth.uid(), true, 'x.xlsx', '[{"row_number": 2, "title": "Nope"}]')$$,
  '42501', null, 'only administrators can import');

select tests.as_user('cat.admin@example.test');
create temp table import_result as
select public.admin_import_listings(
  (select id from fx where key = 'owner'), true, 'listings.xlsx',
  jsonb_build_array(
    jsonb_build_object('row_number', 2, 'title', 'Imported resale with photo', 'category', 'resale',
      'description', 'Imported listing with a photo link and a video link for testing.',
      'property_type_id', (select id from public.property_types where slug = 'house'),
      'price_amount', 350000, 'currency', 'USD', 'country_id', (select id from fx where key = 'country'),
      'city_id', (select id from fx where key = 'city'), 'area_unit', 'sq_m', 'area_value', 140, 'bedrooms', 3,
      'image_urls', jsonb_build_array('https://images.example.test/house.jpg'),
      'videos', jsonb_build_array(jsonb_build_object('provider', 'youtube', 'video_id', 'dQw4w9WgXcQ')),
      'amenity_ids', jsonb_build_array((select id from public.amenities where slug = 'parking')),
      'street_address', '9 Import Lane'),
    jsonb_build_object('row_number', 3, 'title', 'Imported rental without photos', 'category', 'rental',
      'price_amount', 900, 'currency', 'USD', 'price_period', 'per_month'),
    jsonb_build_object('row_number', 4, 'title', 'Project for a non-builder', 'category', 'new_project'),
    jsonb_build_object('row_number', 5, 'title', 'x')
  )
) as result;
grant select on import_result to authenticated;

select is((select (result ->> 'imported')::int from import_result), 2, 'valid rows are imported');
select is((select r ->> 'error' from import_result, jsonb_array_elements(result -> 'results') r where r ->> 'row' = '4'),
  'New projects must belong to a builder account', 'a new project for a non-builder fails with a clear reason');
select ok((select (r ->> 'ok')::boolean = false from import_result, jsonb_array_elements(result -> 'results') r where r ->> 'row' = '5'),
  'a row that breaks a database rule fails without stopping the others');
select is((select r ->> 'status' from import_result, jsonb_array_elements(result -> 'results') r where r ->> 'row' = '2'),
  'draft', 'rows with image links wait for the image worker');
select is((select r ->> 'status' from import_result, jsonb_array_elements(result -> 'results') r where r ->> 'row' = '3'),
  'pending_review', 'incomplete rows go to review even when publishing was requested');

select tests.as_postgres();
select is((select count(*)::int from public.job_queue j join public.listings l on l.id = j.listing_id
           where j.kind = 'import_listing_images' and l.title = 'Imported resale with photo'
             and j.payload -> 'urls' ->> 0 = 'https://images.example.test/house.jpg' and (j.payload ->> 'publish')::boolean),
  1, 'an image job carries the links and the publish choice');
select is((select count(*)::int from public.listing_videos v join public.listings l on l.id = v.listing_id
           where l.title = 'Imported resale with photo'), 1, 'videos are imported');
select is((select street_address from public.listing_private_details d join public.listings l on l.id = d.listing_id
           where l.title = 'Imported resale with photo'), '9 Import Lane', 'private address is imported');
select is((select count(*)::int from public.audit_log
           where action = 'import.listings' and entity_id = (select result ->> 'batch_id' from import_result)),
  1, 'the import is audited');

select tests.as_user('cat.admin@example.test');
select throws_ok(
  $$select public.worker_finalize_import((select id from public.listings where title = 'Imported resale with photo'), true)$$,
  '42501', null, 'only the worker can finalise imports');

select * from finish();
rollback;
