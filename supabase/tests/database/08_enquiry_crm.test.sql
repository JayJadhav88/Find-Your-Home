begin;
\ir _helpers.psql
select no_plan();

create temp table fx (key text primary key, id uuid);
grant all on fx to anon, authenticated;

insert into fx values
  ('admin', tests.create_user('c.admin@example.test')),
  ('support', tests.create_user('c.support@example.test')),
  ('marketing', tests.create_user('c.marketing@example.test')),
  ('owner', tests.create_user('c.owner@example.test')),
  ('visitor', tests.create_user('c.visitor@example.test'));

select tests.grant_role((select id from fx where key = 'admin'), 'administrator');
select tests.grant_role((select id from fx where key = 'support'), 'support');
select tests.grant_role((select id from fx where key = 'marketing'), 'marketing');
select tests.grant_role((select id from fx where key = 'owner'), 'owner');

with t as (
  insert into public.listings (title, purpose, owner_id, status, contact_via_form, published_at)
  values ('CRM test home', 'rent', (select id from fx where key = 'owner'), 'published', true, now())
  returning id
)
insert into fx select 'listing', id from t;

-- Support wants WhatsApp + in-app alerts for new enquiries; the admin wants email only.
update public.notification_preferences
set enquiry_alerts = array['in_app', 'whatsapp'], whatsapp_enabled = true, whatsapp_number = '+919800000001',
    whatsapp_opt_in_at = now()
where user_id = (select id from fx where key = 'support');
update public.notification_preferences set enquiry_alerts = array['email']
where user_id = (select id from fx where key = 'admin');
update public.notification_preferences set enquiry_alerts = array['email']
where user_id = (select id from fx where key = 'marketing');

-- Google Sheets switched on.
update public.integration_settings
set sheets_enabled = true, sheets_webhook_url = 'https://script.google.com/macros/s/AKfycbxTESTTESTTEST123/exec';

-- ---------------------------------------------------------------------------
-- A new enquiry alerts the team and goes to the sheet
-- ---------------------------------------------------------------------------
select tests.as_anon();
with t as (
  select public.submit_enquiry((select id from fx where key = 'listing'), 'Asha', 'asha@example.test', 'Is it still available?') as id
)
insert into fx select 'enquiry', id from t;
select tests.as_postgres();

select is(
  (select array_agg(channel::text order by channel::text) from public.notification_outbox
   where template = 'enquiry_alert' and recipient_user_id = (select id from fx where key = 'support')),
  array['whatsapp'], 'support gets the alert on WhatsApp as chosen'
);
select is(
  (select count(*)::int from public.notifications
   where kind = 'enquiry_alert' and user_id = (select id from fx where key = 'support')),
  1, 'and in the app'
);
select is(
  (select array_agg(channel::text) from public.notification_outbox
   where template = 'enquiry_alert' and recipient_user_id = (select id from fx where key = 'admin')),
  array['email'], 'the admin gets email only, as chosen'
);
select is(
  (select count(*)::int from public.notifications
   where kind = 'enquiry_alert' and user_id = (select id from fx where key = 'admin')),
  0, 'without in-app for the admin'
);
select is(
  (select count(*)::int from public.notification_outbox
   where template = 'enquiry_alert' and recipient_user_id = (select id from fx where key = 'marketing')),
  0, 'marketing staff never get enquiry alerts'
);
select is(
  (select count(*)::int from public.job_queue
   where kind = 'sync_enquiry_sheet' and payload ->> 'enquiry_id' = (select id from fx where key = 'enquiry')::text),
  1, 'the enquiry is queued for the Google Sheet'
);

-- ---------------------------------------------------------------------------
-- Pipeline updates
-- ---------------------------------------------------------------------------
select tests.as_user('c.owner@example.test');
select throws_ok(
  $$ select public.admin_update_enquiry((select id from fx where key = 'enquiry'), 'in_progress', null, null) $$,
  '42501', null, 'listers cannot use team actions'
);
select tests.as_user('c.support@example.test');
select throws_ok(
  $$ select public.admin_update_enquiry((select id from fx where key = 'enquiry'), 'in_progress',
       (select id from fx where key = 'marketing'), null) $$,
  'PT409', null, 'enquiries can only be assigned to the enquiries team'
);
select lives_ok(
  $$ select public.admin_update_enquiry((select id from fx where key = 'enquiry'), 'visit_scheduled',
       (select id from fx where key = 'admin'), now() + interval '2 days') $$,
  'support moves the enquiry on and assigns the admin'
);
select tests.as_postgres();
select is(
  (select status::text || '/' || (team_assignee = (select id from fx where key = 'admin'))::text || '/' || (follow_up_at is not null)::text
   from public.enquiries where id = (select id from fx where key = 'enquiry')),
  'visit_scheduled/true/true', 'status, owner and follow-up are saved'
);
select is(
  (select count(*)::int from public.notifications
   where kind = 'enquiry_assigned' and user_id = (select id from fx where key = 'admin')),
  1, 'the new owner is told'
);
select is(
  (select count(*)::int from public.job_queue
   where kind = 'sync_enquiry_sheet' and payload ->> 'enquiry_id' = (select id from fx where key = 'enquiry')::text),
  2, 'the sheet row is refreshed after the change'
);
select is(
  (select count(*)::int from public.audit_log where action = 'enquiry.update'
   and entity_id = (select id from fx where key = 'enquiry')::text),
  1, 'team changes are audited'
);

-- ---------------------------------------------------------------------------
-- Internal notes
-- ---------------------------------------------------------------------------
select tests.as_user('c.support@example.test');
select lives_ok(
  $$ select public.add_enquiry_note((select id from fx where key = 'enquiry'), 'Called, visit on Saturday.') $$,
  'support adds a note'
);
select is((select count(*)::int from public.enquiry_notes where enquiry_id = (select id from fx where key = 'enquiry')), 1, 'support reads notes');
select tests.as_user('c.owner@example.test');
select is((select count(*)::int from public.enquiry_notes), 0, 'notes are internal: listers cannot read them');
select throws_ok(
  $$ select public.add_enquiry_note((select id from fx where key = 'enquiry'), 'hi') $$,
  '42501', null, 'listers cannot add internal notes'
);

-- ---------------------------------------------------------------------------
-- Sheets setup
-- ---------------------------------------------------------------------------
select tests.as_user('c.support@example.test');
select throws_ok($$ select public.admin_new_sheets_secret() $$, '42501', null, 'only administrators create the sheet secret');
select tests.as_user('c.admin@example.test');
select matches((select public.admin_new_sheets_secret()), '^[0-9a-f]{48}$', 'administrators get a new secret once');
select is(
  (select is_set from public.admin_integration_secrets() where name = 'sheets_webhook_secret'),
  true, 'the secret is stored'
);
select ok((select public.admin_sync_all_enquiries_to_sheet()) >= 1, 'all enquiries can be sent to the sheet');

-- Without Sheets switched on, nothing is queued.
select tests.as_postgres();
update public.integration_settings set sheets_enabled = false;
delete from public.job_queue where kind = 'sync_enquiry_sheet';
select tests.as_anon();
select public.submit_enquiry((select id from fx where key = 'listing'), 'Ben', 'ben@example.test', 'Second question');
select tests.as_postgres();
select is((select count(*)::int from public.job_queue where kind = 'sync_enquiry_sheet'), 0, 'no sheet jobs while Sheets is off');

-- Reviewers get submission alerts by their review preferences.
select is(
  (select count(*)::int from public.notification_preferences where review_alerts = array['in_app', 'email', 'push']
   and user_id = (select id from fx where key = 'admin')),
  1, 'review alerts default to in-app, email and push'
);

select * from finish();
rollback;
