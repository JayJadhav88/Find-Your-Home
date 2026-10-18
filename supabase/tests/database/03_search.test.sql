begin;
\ir _helpers.psql
select no_plan();

create temp table fx (key text primary key, id uuid);
grant all on fx to anon, authenticated;

insert into fx values ('owner', tests.create_user('search.owner@example.test'));
update public.currencies set is_enabled = true where code in ('USD', 'EUR');
-- Start from a clean slate so demo seed rows do not affect counts.
update public.listings set status = 'archived', published_at = null where status = 'published';

with t as (insert into public.locations (level, name, slug, country_code) values ('country', 'Searchland', 'searchland', 'ZY') returning id)
insert into fx select 'country', id from t;
with t as (insert into public.locations (parent_id, level, name, slug, country_code)
           values ((select id from fx where key = 'country'), 'city', 'Findville', 'findville', 'ZY') returning id)
insert into fx select 'city', id from t;
with t as (insert into public.locations (parent_id, level, name, slug, country_code)
           values ((select id from fx where key = 'country'), 'city', 'Othertown', 'othertown', 'ZY') returning id)
insert into fx select 'other_city', id from t;

-- Six published listings with known prices and dates, one draft.
insert into public.listings (owner_id, title, description, purpose, status, published_at, first_published_at,
                             price_amount, currency, price_display, bedrooms, city_id, country_id, area_unit, area_value)
select (select id from fx where key = 'owner'), v.title, v.description, v.purpose::public.listing_purpose, 'published',
       now() - v.age, now() - v.age, v.price, v.currency, v.display::public.price_display, v.beds,
       (select id from fx where key = v.city), (select id from fx where key = 'country'), 'sq_m', v.area
from (values
  ('Garden villa', 'quiet garden near school', 'sale', interval '1 day', 500000, 'USD', 'show', 4, 'city', 200),
  ('City flat', 'balcony with river view', 'sale', interval '2 days', 200000, 'USD', 'show', 2, 'city', 80),
  ('Budget studio', 'compact studio', 'rent', interval '3 days', 700, 'USD', 'show', 0, 'city', 30),
  ('Euro loft', 'loft with garden terrace', 'sale', interval '4 days', 300000, 'EUR', 'show', 3, 'other_city', 120),
  ('Mystery mansion', 'ask for price, garden', 'sale', interval '5 days', null, 'USD', 'on_request', 6, 'city', 600),
  ('Old cottage', 'garden cottage', 'sale', interval '400 days', 150000, 'USD', 'show', 2, 'city', 90)
) as v (title, description, purpose, age, price, currency, display, beds, city, area);

insert into public.listings (owner_id, title, purpose, price_amount, currency, city_id)
values ((select id from fx where key = 'owner'), 'Hidden draft garden', 'sale', 1, 'USD', (select id from fx where key = 'city'));

select tests.as_anon();

select is((select count(*)::int from public.search_listings()), 6, 'visitors find all published listings and no drafts');
select is((select title from public.search_listings() limit 1), 'Garden villa', 'newest first by default');
select is((select count(*)::int from public.search_listings(p_purpose => 'rent')), 1, 'filter by purpose');
select is((select count(*)::int from public.search_listings(p_q => 'garden')), 4, 'keyword search matches title and description');
select is((select title from public.search_listings(p_q => 'garden', p_sort => 'relevance') limit 1), 'Garden villa',
  'relevance sort ranks title matches first');
select is((select count(*)::int from public.search_listings(p_location_id => (select id from fx where key = 'other_city'))), 1,
  'filter by city');
select is((select count(*)::int from public.search_listings(p_location_id => (select id from fx where key = 'country'))), 6,
  'a country filter includes all its cities');
select is((select count(*)::int from public.search_listings(p_currency => 'USD', p_min_price => 180000, p_max_price => 600000)), 2,
  'price range within one currency, excluding price-on-request');
select is((select count(*)::int from public.search_listings(p_min_bedrooms => 3::smallint)), 3, 'minimum bedrooms');
select is((select count(*)::int from public.search_listings(p_area_unit => 'sq_m', p_min_area => 100)), 3, 'minimum area');
select is((select count(*)::int from public.search_listings(p_listed_within_days => 30)), 5, 'recently listed');
select throws_ok($$select * from public.search_listings(p_min_price => 1)$$, '22023', null,
  'price filters require a currency');

select is(
  (select array_agg(title) from public.search_listings(p_currency => 'USD', p_sort => 'price_asc')),
  array['Budget studio', 'Old cottage', 'City flat', 'Garden villa', 'Mystery mansion'],
  'price ascending puts price-on-request last');
select is(
  (select array_agg(title) from public.search_listings(p_currency => 'USD', p_sort => 'price_desc')),
  array['Garden villa', 'City flat', 'Old cottage', 'Budget studio', 'Mystery mansion'],
  'price descending puts price-on-request last');

-- Keyset pagination: two pages of 2 + remainder, no duplicates or gaps.
create temp table pages (title text, cursor text, page int);
grant all on pages to anon, authenticated;
insert into pages select title, cursor, 1 from public.search_listings(p_limit => 2);
select is((select count(*)::int from pages where page = 1), 3, 'a page returns limit + 1 rows to signal more');
insert into pages select title, cursor, 2 from public.search_listings(
  p_limit => 2, p_cursor => (select cursor from pages where page = 1 order by cursor desc offset 1 limit 1));
select is((select array_agg(title order by cursor desc) from pages where page = 2),
  array['Budget studio', 'Euro loft', 'Mystery mansion'], 'the next page continues after the cursor');
select throws_ok($$select * from public.search_listings(p_cursor => 'garbage')$$, '22023', null, 'bad cursors are rejected');

select * from finish();
rollback;
