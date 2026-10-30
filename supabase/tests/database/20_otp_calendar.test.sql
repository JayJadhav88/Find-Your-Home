begin;
\ir _helpers.psql
select no_plan();

create temp table fx (key text primary key, id uuid, token text);
grant all on fx to anon, authenticated;
insert into fx (key, id) values ('owner', tests.create_user('oc.owner@example.test'));
insert into fx (key, id) values ('admin', tests.create_user('oc.admin@example.test'));
select tests.grant_role((select id from fx where key = 'owner'), 'owner');
select tests.grant_role((select id from fx where key = 'admin'), 'administrator');
update public.profiles set phone = '+91 90000 33333' where id = (select id from fx where key = 'owner');

with t as (
  insert into public.listings (title, description, category, purpose, owner_id, status, published_at, first_published_at, show_phone, contact_via_form)
  values ('OC flat', 'A flat used by the OTP and calendar tests, near the park.', 'resale', 'sale',
          (select id from fx where key = 'owner'), 'published', now(), now(), true, true)
  returning id
)
insert into fx (key, id) select 'listing', id from t;

-- ---------------------------------------------------------------------------
-- Public flags never include keys
-- ---------------------------------------------------------------------------
select tests.as_anon();
select is((public.public_integration_flags() ->> 'otp_leads')::boolean, false, 'OTP for leads is off by default');
select is(public.public_integration_flags() ->> 'maps_provider', 'osm', 'OpenStreetMap by default');
select throws_ok($$ select * from public.integration_settings $$, '42501', null, 'visitors cannot read integration settings');

-- ---------------------------------------------------------------------------
-- Lead pop-up with phone verification switched on
-- ---------------------------------------------------------------------------
select tests.as_postgres();
update public.integration_settings set sms_provider = 'msg91', otp_leads_enabled = true where id;
select vault.create_secret('test-sms-key-123', 'fyh_sms_api_key', 'test');

select tests.as_anon();
select is((public.public_integration_flags() ->> 'otp_leads')::boolean, true, 'switched on once a provider and key are set');
select throws_ok(
  format($$ select public.submit_gated_lead(%L, 'contact_reveal', 'Asha', '98888 77777') $$, (select id from fx where key = 'listing')),
  'PT428', null, 'without a code the phone must be verified first'
);
select throws_ok($$ select public.otp_create('98888 77777') $$, '42501', null, 'visitors cannot make codes themselves');

select tests.as_postgres();
set local role service_role;
create temp table codes as select public.otp_create('98888 77777') as code;
reset role;
select tests.as_anon();
select throws_ok(
  format($$ select public.submit_gated_lead(%L, 'contact_reveal', 'Asha', '98888 77777', p_otp => '000000') $$, (select id from fx where key = 'listing')),
  null, null, 'a wrong code is refused'
);
select tests.as_postgres();
insert into fx (key, token)
select 'token', public.submit_gated_lead((select id from fx where key = 'listing'), 'contact_reveal', 'Asha', '+91 98888 77777',
                                          p_otp => (select code from codes)) ->> 'verify_token';
select ok((select token ~ '^[0-9a-f]{48}$' from fx where key = 'token'), 'the right code releases the number and gives a token');
select ok(
  (select message like '%Phone verified by SMS.%' from public.enquiries where listing_id = (select id from fx where key = 'listing') and kind = 'contact_reveal'),
  'the lead says the phone was verified'
);
select tests.as_anon();
select lives_ok(
  format($$ select public.submit_gated_lead(%L, 'callback', 'Asha', '9888877777', p_callback_at => now() + interval '1 day', p_otp => %L) $$,
    (select id from fx where key = 'listing'), (select token from fx where key = 'token')),
  'the token works again for the same phone'
);
select throws_ok(
  format($$ select public.submit_gated_lead(%L, 'callback', 'Ravi', '97777 66666', p_otp => %L) $$,
    (select id from fx where key = 'listing'), (select token from fx where key = 'token')),
  'PT428', null, 'but not for another phone'
);

-- ---------------------------------------------------------------------------
-- Phone sign-up keeps the number and counts as verified
-- ---------------------------------------------------------------------------
select tests.as_postgres();
insert into auth.users (id, instance_id, aud, role, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '919876500000', now(), '{}', now(), now());
select is((select p.phone from public.profiles p join auth.users u on u.id = p.id where u.phone = '919876500000'), '+919876500000', 'the phone number is on the profile');

-- ---------------------------------------------------------------------------
-- Team calendar
-- ---------------------------------------------------------------------------
select tests.as_user('oc.owner@example.test');
select throws_ok($$ select * from public.team_calendar(now(), now() + interval '7 days') $$, '42501', null, 'owners cannot see the team calendar');
select tests.as_user('oc.admin@example.test');
select ok((select count(*) >= 1 from public.team_calendar(now(), now() + interval '30 days') where kind = 'callback'), 'callbacks show on the team calendar');
insert into fx (key, token) select 'cal', public.admin_new_calendar_link();
select tests.as_anon();
select ok((select count(*) >= 0 from public.calendar_feed((select token from fx where key = 'cal'))), 'the secret calendar link works');
select throws_ok(format($$ select * from public.calendar_feed(%L) $$, repeat('a', 48)), '42501', null, 'a made-up link does not');

select * from finish();
rollback;
