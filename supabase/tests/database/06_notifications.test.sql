begin;
\ir _helpers.psql
select no_plan();

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
create temp table fx (key text primary key, id uuid);
grant all on fx to anon, authenticated;

insert into fx values
  ('owner', tests.create_user('n.owner@example.test')),
  ('other', tests.create_user('n.other@example.test')),
  ('moderator', tests.create_user('n.moderator@example.test')),
  ('admin', tests.create_user('n.admin@example.test')),
  ('support', tests.create_user('n.support@example.test')),
  ('marketing', tests.create_user('n.marketing@example.test'));

select tests.grant_role((select id from fx where key = 'owner'), 'owner');
select tests.grant_role((select id from fx where key = 'moderator'), 'moderator');
select tests.grant_role((select id from fx where key = 'admin'), 'administrator');
select tests.grant_role((select id from fx where key = 'support'), 'support');
select tests.grant_role((select id from fx where key = 'marketing'), 'marketing');

with t as (
  insert into public.listings (title, purpose, owner_id, status, submitted_at)
  values ('Notification test flat', 'rent', (select id from fx where key = 'owner'), 'pending_review', now())
  returning id
)
insert into fx select 'listing', id from t;

with t as (
  insert into public.enquiries (listing_id, name, email, message, assigned_to)
  values ((select id from fx where key = 'listing'), 'Visitor', 'visitor@example.test', 'Is it available?',
          (select id from fx where key = 'owner'))
  returning id
)
insert into fx select 'enquiry', id from t;

select is(
  (select count(*)::int from public.notification_preferences where user_id = (select id from fx where key = 'owner')),
  1, 'every new account gets notification preferences'
);
select is(
  (select email_enabled and push_enabled and not whatsapp_enabled from public.notification_preferences
   where user_id = (select id from fx where key = 'owner')),
  true, 'defaults: email and push on, WhatsApp off until the person opts in'
);

-- ---------------------------------------------------------------------------
-- Fan-out from a business event
-- ---------------------------------------------------------------------------
select tests.as_user('n.moderator@example.test');
select lives_ok(
  $$ select public.moderate_listing((select id from fx where key = 'listing'), 'reject', 'Please add photos') $$,
  'moderator rejects the listing'
);
select tests.as_postgres();

select is(
  (select count(*)::int from public.notifications
   where user_id = (select id from fx where key = 'owner') and kind = 'listing_decision'),
  1, 'the owner gets an in-app notification'
);
select is(
  (select array_agg(channel::text order by channel::text) from public.notification_outbox
   where recipient_user_id = (select id from fx where key = 'owner') and template = 'listing_decision'),
  array['email'], 'without a phone registered or WhatsApp consent, only email is queued'
);
select isnt(
  (select notification_id from public.notification_outbox
   where recipient_user_id = (select id from fx where key = 'owner') and template = 'listing_decision'),
  null, 'the email delivery is linked to the in-app notification'
);

-- ---------------------------------------------------------------------------
-- Inbox privacy
-- ---------------------------------------------------------------------------
select tests.as_user('n.other@example.test');
select is((select count(*)::int from public.notifications), 0, 'people cannot read other accounts'' notifications');
select is((select public.mark_notifications_read()), 0, 'marking read only touches your own notifications');
select tests.as_user('n.owner@example.test');
select is((select count(*)::int from public.notifications where read_at is null), 1, 'owner sees one unread notification');
select is((select public.mark_notifications_read()), 1, 'owner marks it read');
select is((select count(*)::int from public.notifications where read_at is null), 0, 'nothing unread afterwards');
select throws_ok(
  $$ update public.notifications set kind = 'hacked' $$,
  '42501', null, 'notifications cannot be edited directly'
);

-- ---------------------------------------------------------------------------
-- Preferences, consent and push tokens
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update public.notification_preferences set whatsapp_opt_in_at = now() - interval '1 year' $$,
  '42501', null, 'consent time cannot be written by the client'
);
select throws_ok(
  $$ update public.notification_preferences set whatsapp_enabled = true $$,
  '23514', null, 'WhatsApp needs a number'
);
update public.notification_preferences set whatsapp_enabled = true, whatsapp_number = '+919876543210';
select isnt(
  (select whatsapp_opt_in_at from public.notification_preferences), null,
  'switching WhatsApp on records the consent time'
);
select throws_ok(
  $$ update public.notification_preferences set timezone = 'Mars/Olympus' $$,
  '22023', null, 'unknown time zones are rejected'
);
select lives_ok(
  $$ select public.register_push_token('ExponentPushToken[abcdefghijklmnop]', 'android') $$,
  'owner registers a phone for push'
);
select throws_ok(
  $$ select public.register_push_token('not-a-token', 'android') $$,
  '23514', null, 'malformed push tokens are rejected'
);
select tests.as_user('n.other@example.test');
select is((select count(*)::int from public.push_tokens), 0, 'people cannot see other accounts'' devices');
select is((select count(*)::int from public.notification_preferences), 1, 'people only see their own preferences');
update public.notification_preferences set email_enabled = false where user_id = (select id from fx where key = 'owner');
select tests.as_postgres();
select is(
  (select email_enabled from public.notification_preferences where user_id = (select id from fx where key = 'owner')),
  true, 'people cannot change other accounts'' preferences'
);

-- Owner now has a phone and WhatsApp consent: the next event goes to every channel.
select app.enqueue_notification('enquiry_received', (select id from fx where key = 'owner'), null, '{"title":"x"}');
select is(
  (select array_agg(channel::text order by channel::text) from public.notification_outbox
   where recipient_user_id = (select id from fx where key = 'owner') and template = 'enquiry_received'),
  array['email', 'push', 'whatsapp'], 'an account with a phone and WhatsApp consent gets all three channels'
);

update public.notification_preferences set email_enabled = false where user_id = (select id from fx where key = 'owner');
select app.enqueue_notification('visit_cancelled', (select id from fx where key = 'owner'), null, '{}');
select is(
  (select array_agg(channel::text order by channel::text) from public.notification_outbox
   where recipient_user_id = (select id from fx where key = 'owner') and template = 'visit_cancelled'),
  array['push', 'whatsapp'], 'switching email off stops email deliveries'
);
select is(
  (select count(*)::int from public.notifications where user_id = (select id from fx where key = 'owner') and kind = 'visit_cancelled'),
  1, 'in-app notifications are always kept'
);

-- Worker claims only the channels it asks for.
select is(
  (select count(*)::int from public.worker_claim_notifications(100, array['push']::public.notification_channel[]) c
   where c.template in ('enquiry_received', 'visit_cancelled')),
  2, 'push worker claims push deliveries only'
);
select is(
  (select c.recipient_phone from public.worker_claim_notifications(100, array['whatsapp']::public.notification_channel[]) c
   where c.template = 'enquiry_received'),
  '+919876543210', 'WhatsApp deliveries resolve the consented number'
);

-- Quiet hours: a window covering the whole day except the next hour pushes delivery later.
update public.site_settings
set default_timezone = 'UTC',
    quiet_start_hour = extract(hour from now() at time zone 'UTC')::smallint,
    quiet_end_hour = ((extract(hour from now() at time zone 'UTC')::int + 2) % 24)::smallint;
select ok(app.next_delivery_time((select id from fx where key = 'other')) > now(), 'non-urgent messages wait for quiet hours to end');
update public.notification_preferences set quiet_hours_enabled = false where user_id = (select id from fx where key = 'other');
select ok(app.next_delivery_time((select id from fx where key = 'other')) <= now(), 'people can switch quiet hours off');

-- ---------------------------------------------------------------------------
-- Team roles
-- ---------------------------------------------------------------------------
select tests.as_user('n.support@example.test');
select is((select count(*)::int from public.enquiries where id = (select id from fx where key = 'enquiry')), 1,
  'support staff read every enquiry');
select ok((select app.is_team()), 'support staff may open the admin panel');
select throws_ok(
  $$ select public.moderate_listing((select id from fx where key = 'listing'), 'approve') $$,
  '42501', null, 'support staff cannot review listings'
);
select tests.as_user('n.marketing@example.test');
select is((select count(*)::int from public.enquiries), 0, 'marketing staff do not see enquiries');
select ok((select app.can_send_broadcasts()), 'marketing staff may send broadcasts');
select tests.as_user('n.moderator@example.test');
select ok(not (select app.can_send_broadcasts()), 'moderators cannot send broadcasts');

-- ---------------------------------------------------------------------------
-- Integrations and secrets
-- ---------------------------------------------------------------------------
select tests.as_user('n.support@example.test');
select is((select count(*)::int from public.integration_settings), 0, 'only administrators see integration settings');
select throws_ok(
  $$ select public.admin_set_integration_secret('resend_api_key', 're_test_1234567890') $$,
  '42501', null, 'only administrators store API keys'
);
select tests.as_user('n.admin@example.test');
select lives_ok(
  $$ select public.admin_set_integration_secret('resend_api_key', 're_test_1234567890') $$,
  'administrator stores an API key'
);
select lives_ok(
  $$ select public.admin_set_integration_secret('resend_api_key', 're_test_0987654321') $$,
  'administrator replaces the key'
);
select throws_ok(
  $$ select public.admin_set_integration_secret('database_password', 'whatever-123') $$,
  '22023', null, 'only known integration keys can be stored'
);
select is(
  (select is_set from public.admin_integration_secrets() where name = 'resend_api_key'),
  true, 'the admin page sees that the key is set'
);
select throws_ok(
  $$ select decrypted_secret from vault.decrypted_secrets $$,
  '42501', null, 'the key itself cannot be read back through the API'
);
select throws_ok(
  $$ select public.worker_integration_config() $$,
  '42501', null, 'signed-in users cannot call the worker config function'
);
select throws_ok(
  $$ update public.integration_settings set sheets_webhook_url = 'https://evil.example/collect' $$,
  '23514', null, 'the Sheets webhook must be a Google Apps Script address'
);
select lives_ok(
  $$ update public.integration_settings set whatsapp_enabled = true, whatsapp_phone_number_id = '123456789012' $$,
  'administrator configures WhatsApp'
);
select tests.as_postgres();
select is(
  (select public.worker_integration_config() -> 'secrets' ->> 'resend_api_key'),
  're_test_0987654321', 'the worker receives the latest key'
);
select is(
  (select (public.worker_integration_config() ->> 'whatsapp_phone_number_id')),
  '123456789012', 'the worker receives the settings'
);
select is(
  (select count(*)::int from public.audit_log where entity_type = 'integration' and after is null),
  2, 'key changes are audited without the value'
);

select tests.as_user('n.admin@example.test');
select lives_ok(
  $$ select public.admin_set_integration_secret('resend_api_key', '') $$,
  'administrator removes the key'
);
select is(
  (select is_set from public.admin_integration_secrets() where name = 'resend_api_key'),
  false, 'removed keys show as not set'
);

-- ---------------------------------------------------------------------------
-- Browser push subscriptions
-- ---------------------------------------------------------------------------
select tests.as_user('n.other@example.test');
select throws_ok(
  $$ select public.register_web_push('https://attacker.example/collect', repeat('A', 87), repeat('B', 22)) $$,
  '23514', null, 'browser subscriptions must point at a known push service'
);
select lives_ok(
  $$ select public.register_web_push('https://fcm.googleapis.com/fcm/send/abc123', repeat('A', 87), repeat('B', 22)) $$,
  'a Chrome subscription is accepted'
);
select tests.as_postgres();
select app.enqueue_notification('visit_cancelled', (select id from fx where key = 'other'), null, '{}');
select is(
  (select count(*)::int from public.notification_outbox
   where recipient_user_id = (select id from fx where key = 'other') and channel = 'push'),
  1, 'a browser subscription alone is enough to queue push'
);
select is(
  (select jsonb_array_length(c.web_push) from public.worker_claim_notifications(100, array['push']::public.notification_channel[]) c
   where c.template = 'visit_cancelled' and c.push_tokens = '{}'),
  1, 'the worker receives the browser subscription'
);
select tests.as_user('n.owner@example.test');
select is((select count(*)::int from public.web_push_subscriptions), 0, 'people cannot see other accounts'' browsers');
select lives_ok(
  $$ select public.unregister_web_push('https://fcm.googleapis.com/fcm/send/abc123') $$,
  'removing someone else''s subscription does nothing'
);
select tests.as_postgres();
select is((select count(*)::int from public.web_push_subscriptions), 1, 'the other account''s subscription is untouched');

select * from finish();
rollback;
