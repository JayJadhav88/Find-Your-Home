begin;
\ir _helpers.psql
select no_plan();

create temp table fx (key text primary key, id uuid);
grant all on fx to anon, authenticated;

insert into fx values
  ('owner', tests.create_user('x.owner@example.test')),
  ('scammer', tests.create_user('x.scammer@example.test')),
  ('buyer', tests.create_user('x.buyer@example.test')),
  ('moderator', tests.create_user('x.moderator@example.test'));
select tests.grant_role((select id from fx where key = 'owner'), 'owner');
select tests.grant_role((select id from fx where key = 'scammer'), 'owner');
select tests.grant_role((select id from fx where key = 'moderator'), 'moderator');

update public.currencies set is_enabled = true where code = 'INR';
with t as (insert into public.property_types (slug, name) values ('x-flat', 'X flat') returning id)
insert into fx select 'type', id from t;
with t as (insert into public.locations (level, name, slug, country_code) values ('country', 'Xland', 'xland', 'XX') returning id)
insert into fx select 'country', id from t;
with t as (insert into public.locations (parent_id, level, name, slug, country_code)
  values ((select id from fx where key = 'country'), 'city', 'X City', 'x-city', 'XX') returning id)
insert into fx select 'city', id from t;

-- Five ordinary rentals at 20,000 and one suspicious one at 3,000 in the same city.
insert into public.listings (title, purpose, owner_id, status, published_at, city_id, property_type_id, currency, price_amount, price_period)
select 'Normal flat ' || g, 'rent', (select id from fx where key = 'owner'), 'published', now() - interval '2 days',
       (select id from fx where key = 'city'), (select id from fx where key = 'type'), 'INR', 20000, 'per_month'
from generate_series(1, 5) g;
with t as (
  insert into public.listings (title, purpose, owner_id, status, published_at, city_id, property_type_id, currency, price_amount, price_period)
  values ('Too good to be true', 'rent', (select id from fx where key = 'scammer'), 'published', now(),
          (select id from fx where key = 'city'), (select id from fx where key = 'type'), 'INR', 3000, 'per_month')
  returning id
)
insert into fx select 'scam', id from t;

-- Same photo on an owner's listing and the scammer's listing; same phone on both accounts.
insert into public.listing_media (listing_id, upload_key, kind, content_hash)
select l.id, l.id || '/1.jpg', 'image', repeat('a', 64)
from public.listings l where l.title in ('Normal flat 1', 'Too good to be true');
update public.profiles set phone = '+91 98765 43210' where id = (select id from fx where key = 'owner');
update public.profiles set phone = '098765-43210' where id = (select id from fx where key = 'scammer');

-- ---------------------------------------------------------------------------
-- Reports and fraud signals
-- ---------------------------------------------------------------------------
select tests.as_anon();
select lives_ok(
  $$ select public.report_listing((select id from fx where key = 'scam'), 'fraud', 'Asked for a deposit before viewing') $$,
  'visitors can report a listing without signing in'
);
select throws_ok(
  $$ select public.report_listing((select id from fx where key = 'scam'), 'because', null) $$,
  '23514', null, 'only known report reasons are accepted'
);
select throws_ok($$ select count(*) from public.listing_reports $$, '42501', null, 'visitors cannot read reports');

select tests.as_user('x.buyer@example.test');
select throws_ok(
  $$ select * from public.admin_listing_flags((select id from fx where key = 'scam')) $$,
  '42501', null, 'members cannot see fraud checks'
);

select tests.as_user('x.moderator@example.test');
select is(
  (select array_agg(flag order by flag) from public.admin_listing_flags((select id from fx where key = 'scam'))),
  array['duplicate_photos', 'open_reports', 'price_far_below', 'shared_phone'],
  'moderators see reused photos, shared phone, a suspicious price and the open report'
);
select is(
  (select array_agg(flag) from public.admin_listing_flags((select id from public.listings where title = 'Normal flat 2'))),
  array['shared_phone'], 'an ordinary listing only carries its owner''s shared-phone signal'
);
select lives_ok(
  $$ select public.admin_handle_report((select max(id) from public.listing_reports), 'resolved') $$,
  'moderators resolve reports'
);
select tests.as_postgres();
select is(
  (select count(*)::int from public.notifications where kind = 'listing_reported' and user_id = (select id from fx where key = 'moderator')),
  1, 'reviewers are alerted about reports'
);

-- ---------------------------------------------------------------------------
-- Owner insights
-- ---------------------------------------------------------------------------
select tests.as_anon();
select public.record_listing_view((select id from public.listings where title = 'Normal flat 1'), 'visitor-a');
select public.record_listing_view((select id from public.listings where title = 'Normal flat 1'), 'visitor-a');
select public.record_listing_view((select id from public.listings where title = 'Normal flat 1'), 'visitor-b');
select tests.as_user('x.owner@example.test');
select public.record_listing_view((select id from public.listings where title = 'Normal flat 1'));
select is(
  (select views_30d from public.my_listing_stats() where listing_id = (select id from public.listings where title = 'Normal flat 1')),
  2, 'one view per visitor per day, and the owner''s own visits do not count'
);
select is((select count(*)::int from public.my_listing_stats()), 5, 'owners see stats for their own listings only');
select tests.as_user('x.buyer@example.test');
select is((select count(*)::int from public.my_listing_stats()), 0, 'other members see no stats');

-- ---------------------------------------------------------------------------
-- Expiry and renewal
-- ---------------------------------------------------------------------------
select tests.as_postgres();
update public.site_settings set listing_expiry_days = 30;
update public.listings set published_at = now() - interval '25 days' where title = 'Normal flat 2';
update public.listings set published_at = now() - interval '31 days' where title = 'Normal flat 3';
select is(
  (select public.worker_expire_listings()),
  '{"expired": 1, "reminded": 1}'::jsonb, 'one listing is reminded, one expires'
);
select is((select status::text from public.listings where title = 'Normal flat 3'), 'archived', 'the expired listing is hidden');
select is(
  (select count(*)::int from public.notifications where kind in ('listing_expiring', 'listing_expired')),
  2, 'the owner is told about both'
);
select is((select public.worker_expire_listings() ->> 'reminded'), '0', 'reminders are sent once');

insert into fx select 'flat3', id from public.listings where title = 'Normal flat 3';
select tests.as_user('x.buyer@example.test');
select throws_ok(
  $$ select public.renew_listing((select id from fx where key = 'flat3')) $$,
  '42501', null, 'only the lister renews'
);
select tests.as_user('x.owner@example.test');
select is(
  (select public.renew_listing((select id from public.listings where title = 'Normal flat 3'))::text),
  'published', 'an expired listing comes back when renewed'
);
select is(
  (select public.renew_listing((select id from public.listings where title = 'Normal flat 2'))::text),
  'published', 'a live listing can be renewed early'
);
select tests.as_postgres();
select ok(
  (select app.listing_expires_at(l) > now() + interval '29 days' from public.listings l where title = 'Normal flat 2'),
  'renewing starts a new period'
);
select is(
  (select count(*)::int from public.job_queue where kind = 'publish_listing_media'
   and listing_id = (select id from public.listings where title = 'Normal flat 3')),
  1, 'photos are published again for the renewed listing'
);

-- ---------------------------------------------------------------------------
-- Saved searches and alerts
-- ---------------------------------------------------------------------------
select tests.as_user('x.buyer@example.test');
insert into public.saved_searches (name, filters, query_string)
values ('Rentals in X City', jsonb_build_object('p_purpose', 'rent', 'p_location_id', (select id from fx where key = 'city')),
        'purpose=rent');
select throws_ok(
  $$ insert into public.saved_searches (name, query_string) values ('Bad', 'a=<script>') $$,
  '23514', null, 'saved query strings are restricted to safe characters'
);
select tests.as_user('x.owner@example.test');
select is((select count(*)::int from public.saved_searches), 0, 'saved searches are private');

select tests.as_postgres();
update public.saved_searches set last_checked_at = now() - interval '2 hours';
update public.listings set published_at = now() - interval '1 hour' where title = 'Normal flat 4';
select is((select public.worker_run_saved_search_alerts()), 1, 'new matches trigger an alert');
select is(
  (select (data ->> 'count')::int from public.notifications where kind = 'saved_search_match' and user_id = (select id from fx where key = 'buyer')),
  3, 'the alert counts homes published since the last check (new, renewed and the suspicious one)'
);
select is((select public.worker_run_saved_search_alerts()), 0, 'searches are checked at most hourly');

update public.notification_preferences set alerts_enabled = false where user_id = (select id from fx where key = 'buyer');
update public.saved_searches set last_checked_at = now() - interval '2 hours';
select is((select public.worker_run_saved_search_alerts()), 0, 'people who switched alerts off get none');

select * from finish();
rollback;
