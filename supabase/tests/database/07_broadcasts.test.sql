begin;
\ir _helpers.psql
select no_plan();

create temp table fx (key text primary key, id uuid);
grant all on fx to anon, authenticated;

insert into fx values
  ('admin', tests.create_user('b.admin@example.test')),
  ('marketing', tests.create_user('b.marketing@example.test')),
  ('support', tests.create_user('b.support@example.test')),
  ('owner', tests.create_user('b.owner@example.test')),
  ('fan', tests.create_user('b.fan@example.test')),
  ('quiet', tests.create_user('b.quiet@example.test'));

select tests.grant_role((select id from fx where key = 'admin'), 'administrator');
select tests.grant_role((select id from fx where key = 'marketing'), 'marketing');
select tests.grant_role((select id from fx where key = 'support'), 'support');
select tests.grant_role((select id from fx where key = 'owner'), 'owner');

-- The fan agreed to news; the quiet member did not.
update public.profiles set marketing_opt_in = true where id = (select id from fx where key = 'fan');
-- No quiet hours in this test, and a cap of one broadcast per week.
update public.site_settings set quiet_start_hour = 0, quiet_end_hour = 0, broadcast_weekly_cap = 1;

-- ---------------------------------------------------------------------------
-- Who may send
-- ---------------------------------------------------------------------------
select tests.as_user('b.support@example.test');
select throws_ok(
  $$ select public.admin_create_broadcast('Hi', 'News', null, 'everyone', null, array['email']::public.notification_channel[]) $$,
  '42501', null, 'support staff cannot send broadcasts'
);
select is((select count(*)::int from public.broadcasts), 0, 'support staff cannot read broadcasts');

select tests.as_user('b.marketing@example.test');
select throws_ok(
  $$ select public.admin_create_broadcast('Hi', 'News', 'javascript:alert(1)', 'everyone', null, array['email']::public.notification_channel[]) $$,
  '23514', null, 'links must be a page on this site or https'
);
select throws_ok(
  $$ select public.admin_create_broadcast('Hi', 'News', null, 'everyone', null, array['email']::public.notification_channel[], now() + interval '1 year') $$,
  '22023', null, 'broadcasts cannot be scheduled too far ahead'
);
select ok(
  (select total >= 6 from public.admin_broadcast_audience_size('everyone')),
  'marketing sees the audience size'
);
select tests.as_postgres();
select ok(
  (select id from fx where key = 'owner') in (select app.broadcast_audience('owners', null))
  and (select id from fx where key = 'fan') not in (select app.broadcast_audience('owners', null)),
  'the owners audience has listers and not buyers'
);
select ok(
  (select id from fx where key = 'support') in (select app.broadcast_audience('team', null))
  and (select id from fx where key = 'owner') not in (select app.broadcast_audience('team', null)),
  'the team audience has staff only'
);
select tests.as_user('b.marketing@example.test');

with b as (
  select public.admin_create_broadcast('New projects this week', 'Ten new homes in your area.', '/search?category=new_project',
    'everyone', null, array['email', 'push']::public.notification_channel[]) as id
)
insert into fx select 'b1', null from b;
select is((select status::text from public.broadcasts order by id desc limit 1), 'scheduled', 'a new broadcast waits for the worker');

-- ---------------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------------
select tests.as_postgres();
select is((select public.worker_send_due_broadcasts()), 1, 'the worker sends the due broadcast');
select is((select status::text from public.broadcasts order by id desc limit 1), 'sent', 'and marks it sent');

select is(
  (select count(*)::int from public.notifications n
   where n.kind = 'broadcast' and n.user_id = (select id from fx where key = 'quiet')),
  1, 'everyone in the audience gets it in the app'
);
select is(
  (select count(*)::int from public.notification_outbox o
   where o.template = 'broadcast' and o.recipient_user_id = (select id from fx where key = 'quiet')),
  0, 'people who did not agree to news get nothing outside the app'
);
select is(
  (select count(*)::int from public.notification_outbox o
   where o.template = 'broadcast' and o.channel = 'email' and o.recipient_user_id = (select id from fx where key = 'fan')),
  1, 'people who agreed to news also get the email'
);

-- A second broadcast in the same week goes in-app only (cap of one).
select tests.as_user('b.marketing@example.test');
select public.admin_create_broadcast('Second', 'Again.', null, 'everyone', null, array['email']::public.notification_channel[]);
select tests.as_postgres();
select public.worker_send_due_broadcasts();
select is(
  (select count(*)::int from public.notification_outbox o
   where o.template = 'broadcast' and o.recipient_user_id = (select id from fx where key = 'fan')),
  1, 'the weekly cap stops further emails'
);
select is(
  (select count(*)::int from public.notifications n
   where n.kind = 'broadcast' and n.user_id = (select id from fx where key = 'fan')),
  2, 'but the message still appears in the app'
);

-- Report and cancellation
select tests.as_user('b.marketing@example.test');
select is(
  (select total from public.admin_broadcast_report((select min(id) from public.broadcasts where title = 'New projects this week')) where channel = 'email' and status = 'pending'),
  1, 'the report counts queued emails'
);
select ok(
  (select total >= 6 from public.admin_broadcast_report((select min(id) from public.broadcasts where title = 'New projects this week')) where channel = 'in_app' and status = 'delivered'),
  'the report counts in-app deliveries'
);
select public.admin_create_broadcast('Later', 'Tomorrow.', null, 'team', null, array[]::public.notification_channel[], now() + interval '1 day');
select lives_ok(
  $$ select public.admin_cancel_broadcast((select max(id) from public.broadcasts where title = 'Later')) $$,
  'a scheduled broadcast can be cancelled'
);
select throws_ok(
  $$ select public.admin_cancel_broadcast((select min(id) from public.broadcasts where title = 'New projects this week')) $$,
  'PT409', null, 'a sent broadcast cannot be cancelled'
);
select tests.as_postgres();
select is((select public.worker_send_due_broadcasts()), 0, 'cancelled broadcasts are not sent');
select is(
  (select count(*)::int from public.audit_log where entity_type = 'broadcast'
   and entity_id in (select id::text from public.broadcasts where title in ('New projects this week', 'Second', 'Later'))),
  4, 'broadcast actions are audited'
);

-- ---------------------------------------------------------------------------
-- Integration tests
-- ---------------------------------------------------------------------------
select tests.as_user('b.marketing@example.test');
select throws_ok(
  $$ select public.admin_send_test_notification('email') $$,
  '42501', null, 'only administrators send integration tests'
);
select tests.as_user('b.admin@example.test');
select lives_ok($$ select public.admin_send_test_notification('email') $$, 'administrator sends a test email');
select tests.as_postgres();
select is(
  (select count(*)::int from public.notification_outbox where template = 'integration_test' and channel = 'email'
   and recipient_user_id = (select id from fx where key = 'admin')),
  1, 'the test email is queued'
);
select is(
  (select count(*)::int from public.notifications where kind = 'integration_test' and user_id = (select id from fx where key = 'admin')),
  0, 'test messages do not fill the inbox'
);

select * from finish();
rollback;
