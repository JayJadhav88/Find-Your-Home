begin;
\ir _helpers.psql
select no_plan();

create temp table fx (key text primary key, id uuid);
grant all on fx to anon, authenticated;

insert into fx values
  ('crm', tests.create_user('l.crm@example.test')),
  ('agent1', tests.create_user('l.agent1@example.test')),
  ('agent2', tests.create_user('l.agent2@example.test')),
  ('content', tests.create_user('l.content@example.test')),
  ('owner', tests.create_user('l.owner@example.test')),
  ('member', tests.create_user('l.member@example.test'));
select tests.grant_role((select id from fx where key = 'crm'), 'crm_manager');
select tests.grant_role((select id from fx where key = 'agent1'), 'sales_agent');
select tests.grant_role((select id from fx where key = 'agent2'), 'sales_agent');
select tests.grant_role((select id from fx where key = 'content'), 'content_manager');
select tests.grant_role((select id from fx where key = 'owner'), 'owner');

with t as (
  insert into public.listings (title, purpose, owner_id, status, contact_via_form, published_at)
  values ('Lead test flat', 'rent', (select id from fx where key = 'owner'), 'published', true, now())
  returning id
)
insert into fx select 'listing', id from t;

-- ---------------------------------------------------------------------------
-- Capturing leads
-- ---------------------------------------------------------------------------
select tests.as_anon();
select throws_ok(
  $$ select public.submit_contact_lead('Ravi', null, null, 'sell', 'I want to sell my flat', null, null, null, 'v1') $$,
  '22023', null, 'a contact lead needs a phone number or an email'
);
select throws_ok(
  $$ select public.submit_contact_lead('Ravi', null, '+91 90000 00001', 'sell', 'I want to sell', null, null, null, null) $$,
  '22023', null, 'a contact lead needs consent'
);
with t as (
  select public.submit_contact_lead('Ravi', null, '+91 90000 00001', 'sell', 'I want to sell my flat in Baner',
    'Pune', 'whatsapp', null, 'v1', 'contact_form', '{"utm_source":"instagram","utm_campaign":"diwali","evil":"x"}') as id
)
insert into fx select 'owner_lead', id from t;

with t as (
  select public.submit_enquiry((select id from fx where key = 'listing'), 'Meera', 'meera@example.test',
    'Is it available?', null, 'enquiry', null, null, 'v1', 'app', '{"ref":"FRIEND42"}') as id
)
insert into fx select 'listing_lead', id from t;
select tests.as_postgres();

select is(
  (select lead_type || '/' || interest || '/' || source || '/' || city || '/' || preferred_contact
   from public.enquiries where id = (select id from fx where key = 'owner_lead')),
  'owner/sell/campaign/Pune/whatsapp', 'an owner who wants to sell becomes an owner lead with its campaign source'
);
select is(
  (select utm from public.enquiries where id = (select id from fx where key = 'owner_lead')),
  '{"utm_source": "instagram", "utm_campaign": "diwali"}'::jsonb, 'only known tracking fields are kept'
);
select is(
  (select lead_type || '/' || interest || '/' || source from public.enquiries where id = (select id from fx where key = 'listing_lead')),
  'customer/rent/referral', 'a listing enquiry with a referral code is a referral lead for renting'
);
select is(
  (select kind || ':' || to_value from public.enquiry_events where enquiry_id = (select id from fx where key = 'owner_lead')),
  'created:new', 'the history starts with the lead''s creation'
);
select ok(
  (select count(*) from public.notifications n where n.kind = 'enquiry_alert'
   and n.user_id = (select id from fx where key = 'crm')) >= 2,
  'CRM managers hear about new leads in the app by default'
);

-- ---------------------------------------------------------------------------
-- Pipeline
-- ---------------------------------------------------------------------------
select tests.as_user('l.crm@example.test');
select lives_ok(
  $$ select public.admin_update_enquiry((select id from fx where key = 'owner_lead'), 'new',
       (select id from fx where key = 'agent1'), null) $$,
  'the CRM manager assigns a lead to a sales agent'
);
select is(
  (select status::text from public.enquiries where id = (select id from fx where key = 'owner_lead')),
  'assigned', 'assigning a new lead marks it Assigned'
);
select throws_ok(
  $$ select public.admin_update_enquiry((select id from fx where key = 'listing_lead'), 'lost', null, null) $$,
  '22023', null, 'lost leads need a reason'
);
select lives_ok(
  $$ select public.admin_update_enquiry((select id from fx where key = 'listing_lead'), 'lost', null, null, 'Found elsewhere') $$,
  'a lost lead with a reason is saved'
);

-- ---------------------------------------------------------------------------
-- Sales agents see and work only their own leads
-- ---------------------------------------------------------------------------
select tests.as_user('l.agent1@example.test');
select is(
  (select array_agg(id) from public.enquiries), array[(select id from fx where key = 'owner_lead')],
  'a sales agent sees only the leads assigned to them'
);
select lives_ok(
  $$ select public.log_contact_attempt((select id from fx where key = 'owner_lead'), 'no_answer', 'Rang twice') $$,
  'the agent logs a call attempt'
);
select lives_ok(
  $$ select public.log_contact_attempt((select id from fx where key = 'owner_lead'), 'contacted') $$,
  'and then a successful call'
);
select lives_ok(
  $$ select public.add_enquiry_note((select id from fx where key = 'owner_lead'), 'Wants a valuation first.') $$,
  'the agent adds a note to their lead'
);
select throws_ok(
  $$ select public.admin_update_enquiry((select id from fx where key = 'owner_lead'), 'qualified',
       (select id from fx where key = 'agent2'), null) $$,
  '42501', null, 'a sales agent cannot hand a lead to someone else'
);
select lives_ok(
  $$ select public.admin_update_enquiry((select id from fx where key = 'owner_lead'), 'qualified',
       (select id from fx where key = 'agent1'), now() + interval '1 day') $$,
  'but can move it along and set a follow-up'
);
select tests.as_user('l.agent2@example.test');
select is((select count(*)::int from public.enquiries), 0, 'other sales agents cannot see it');
select throws_ok(
  $$ select public.add_enquiry_note((select id from fx where key = 'owner_lead'), 'hi') $$,
  '42501', null, 'or add notes to it'
);

select tests.as_postgres();
select is(
  (select status::text || '/' || (first_response_at is not null)::text from public.enquiries where id = (select id from fx where key = 'owner_lead')),
  'qualified/true', 'a successful call records the first response time'
);
select is(
  (select array_agg(kind || ':' || coalesce(to_value, '') order by id) from public.enquiry_events
   where enquiry_id = (select id from fx where key = 'owner_lead')),
  array['created:new', 'status:assigned', 'assigned:' || (select id from fx where key = 'agent1')::text,
        'contact_attempt:no_answer', 'contact_attempt:contacted', 'status:in_progress', 'status:qualified',
        'follow_up:' || (select follow_up_at::text from public.enquiries where id = (select id from fx where key = 'owner_lead'))],
  'every change is in the lead''s history'
);

-- ---------------------------------------------------------------------------
-- Duplicates, manual leads, content managers
-- ---------------------------------------------------------------------------
select tests.as_anon();
select public.submit_contact_lead('Ravi K', null, '090000-00001', 'list_property', 'Second message', null, null, null, 'v1');
select tests.as_user('l.crm@example.test');
select is(
  (select count(*)::int from public.admin_enquiry_duplicates((select id from fx where key = 'owner_lead'))),
  1, 'the same phone number in another format is flagged as a likely duplicate'
);
select lives_ok(
  $$ select public.admin_create_lead('Walk-in Sunil', null, '+91 90000 00009', 'buy', 'Visited the office', 'manual') $$,
  'the team adds a lead from a phone call or walk-in'
);
select tests.as_user('l.member@example.test');
select throws_ok(
  $$ select public.admin_create_lead('X', 'x@example.test', null, 'buy', 'x') $$,
  '42501', null, 'members cannot add leads'
);

select tests.as_user('l.content@example.test');
select ok((select app.is_team()), 'content managers may open the admin panel');
select is((select count(*)::int from public.enquiries), 0, 'content managers do not see leads');
select lives_ok(
  $$ update public.content_pages set title = 'About us' where slug = 'about' $$,
  'content managers edit site pages'
);
select ok(not (select app.is_admin()), 'but are not administrators');

select * from finish();
rollback;
