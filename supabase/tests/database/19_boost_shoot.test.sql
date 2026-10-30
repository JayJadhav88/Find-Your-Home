begin;
\ir _helpers.psql
select no_plan();

create temp table fx (key text primary key, id uuid);
grant all on fx to anon, authenticated;
insert into fx values ('owner', tests.create_user('bs.owner@example.test'));
insert into fx values ('other', tests.create_user('bs.other@example.test'));
insert into fx values ('mod', tests.create_user('bs.mod@example.test'));
select tests.grant_role((select id from fx where key = 'owner'), 'owner');
select tests.grant_role((select id from fx where key = 'other'), 'owner');
select tests.grant_role((select id from fx where key = 'mod'), 'moderator');

with t as (
  insert into public.listings (title, description, category, purpose, owner_id, status)
  values ('BS draft flat', 'A flat used by the boost and shoot tests, near the station.', 'resale', 'sale',
          (select id from fx where key = 'owner'), 'draft')
  returning id
)
insert into fx select 'listing', id from t;

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------
select tests.as_anon();
select ok((select count(*) from public.boost_plans) >= 2, 'visitors see the boost plans');
select tests.as_user('bs.owner@example.test');
select is(tests.rows_affected($$ update public.boost_plans set price_paise = 100 $$), 0, 'owners cannot change prices');

-- ---------------------------------------------------------------------------
-- Boost bought before approval starts when the property goes live
-- ---------------------------------------------------------------------------
select tests.as_postgres();
insert into public.listing_boosts (listing_id, plan_id, buyer_id, plan_name, days, amount_paise, razorpay_order_id)
select (select id from fx where key = 'listing'), id, (select id from fx where key = 'owner'), name, days, price_paise, 'order_test_1'
from public.boost_plans where days = 7 limit 1;

select tests.as_user('bs.owner@example.test');
select throws_ok($$ select public.boost_mark_paid('order_test_1', 'pay_1') $$, '42501', null, 'owners cannot mark a boost paid');
select is((select count(*)::int from public.listing_boosts), 1, 'the owner sees their own boost');
select tests.as_user('bs.other@example.test');
select is((select count(*)::int from public.listing_boosts), 0, 'other owners do not see it');

select tests.as_postgres();
set local role service_role;
select is((select public.boost_mark_paid('order_test_1', 'pay_1') ->> 'live'), 'false', 'paid while still a draft');
reset role;
select is((select status from public.listing_boosts where razorpay_order_id = 'order_test_1'), 'paid', 'the boost waits for approval');
select is((select is_featured from public.listings where id = (select id from fx where key = 'listing')), false, 'not featured yet');

update public.listings set status = 'published', published_at = now(), first_published_at = now() where id = (select id from fx where key = 'listing');
select ok(
  (select is_featured and featured_until between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour'
   from public.listings where id = (select id from fx where key = 'listing')),
  'going live starts the boost: featured for 7 days'
);
select is((select status from public.listing_boosts where razorpay_order_id = 'order_test_1'), 'active', 'the boost is active');

-- A second boost on a live property extends the featured time.
insert into public.listing_boosts (listing_id, buyer_id, plan_name, days, amount_paise, razorpay_order_id)
values ((select id from fx where key = 'listing'), (select id from fx where key = 'owner'), 'Boost 30 days', 30, 149900, 'order_test_2');
set local role service_role;
select public.boost_mark_paid('order_test_2', 'pay_2');
reset role;
select ok(
  (select featured_until > now() + interval '36 days' from public.listings where id = (select id from fx where key = 'listing')),
  'a second boost runs after the first one'
);

-- Expiry
update public.listing_boosts set ends_at = now() - interval '1 minute' where listing_id = (select id from fx where key = 'listing');
update public.listings set featured_until = now() - interval '1 minute' where id = (select id from fx where key = 'listing');
select app.expire_boosts();
select is((select is_featured from public.listings where id = (select id from fx where key = 'listing')), false, 'featured time runs out');

-- ---------------------------------------------------------------------------
-- Shoot requests
-- ---------------------------------------------------------------------------
select tests.as_user('bs.owner@example.test');
select throws_ok(
  format($$ select public.request_shoot(%L, current_date + 2, 'morning') $$, (select id from fx where key = 'listing')),
  'PT409', null, 'a phone number is needed first'
);
select tests.as_postgres();
update public.profiles set phone = '+91 90000 22222' where id = (select id from fx where key = 'owner');
select tests.as_user('bs.owner@example.test');
select lives_ok(
  format($$ select public.request_shoot(%L, current_date + 2, 'morning', 'Keys with the watchman') $$, (select id from fx where key = 'listing')),
  'the owner requests a shoot'
);
select throws_ok(
  format($$ select public.request_shoot(%L, current_date + 3, 'evening') $$, (select id from fx where key = 'listing')),
  'PT409', null, 'only one open shoot per property'
);
select throws_ok(
  format($$ select public.admin_update_shoot(%L, 'confirmed', now() + interval '2 days') $$, (select id from public.shoot_requests limit 1)),
  '42501', null, 'owners cannot confirm their own shoot'
);
select tests.as_user('bs.other@example.test');
select throws_ok(
  format($$ select public.request_shoot(%L, current_date + 2, 'morning') $$, (select id from fx where key = 'listing')),
  '42501', null, 'nobody else can request a shoot for the property'
);
select tests.as_user('bs.mod@example.test');
select throws_ok(
  format($$ select public.admin_update_shoot(%L, 'confirmed') $$, (select id from public.shoot_requests limit 1)),
  'PT409', null, 'confirming needs a date and time'
);
select lives_ok(
  format($$ select public.admin_update_shoot(%L, 'confirmed', now() + interval '2 days', 'Photographer: Ravi') $$, (select id from public.shoot_requests limit 1)),
  'the team confirms the shoot'
);

-- ---------------------------------------------------------------------------
-- Uploaded video files
-- ---------------------------------------------------------------------------
select tests.as_postgres();
update public.listings set status = 'draft', published_at = null where id = (select id from fx where key = 'listing');
select tests.as_user('bs.owner@example.test');
select throws_ok(
  format($$ insert into public.listing_video_files (listing_id, storage_key) values (%L, %L) $$,
    (select id from fx where key = 'listing'), (select id from fx where key = 'listing')::text || '/11111111-2222-3333-4444-555555555555.mp4'),
  'PT409', null, 'the file must be uploaded first'
);
select tests.as_postgres();
select tests.fake_upload('listing-videos', (select id from fx where key = 'listing')::text || '/11111111-2222-3333-4444-555555555555.mp4', 'video/mp4', 5000000);
select tests.as_user('bs.owner@example.test');
select lives_ok(
  format($$ insert into public.listing_video_files (listing_id, storage_key) values (%L, %L) $$,
    (select id from fx where key = 'listing'), (select id from fx where key = 'listing')::text || '/11111111-2222-3333-4444-555555555555.mp4'),
  'the owner adds an uploaded video'
);
select tests.as_user('bs.other@example.test');
select is(tests.rows_affected(format($$ delete from public.listing_video_files where listing_id = %L $$, (select id from fx where key = 'listing'))), 0,
  'others cannot remove it');

select * from finish();
rollback;
