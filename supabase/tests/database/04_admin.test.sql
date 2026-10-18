begin;
\ir _helpers.psql
select no_plan();

create temp table fx (key text primary key, id uuid);
grant all on fx to anon, authenticated;

insert into fx values
  ('admin', tests.create_user('admin4@example.test')),
  ('moderator', tests.create_user('moderator4@example.test')),
  ('member', tests.create_user('member4@example.test'));
select tests.grant_role((select id from fx where key = 'admin'), 'administrator');
select tests.grant_role((select id from fx where key = 'moderator'), 'moderator');

-- User directory
select tests.as_user('member4@example.test');
select throws_ok($$select * from public.admin_list_users()$$, '42501', null, 'members cannot list users');
select tests.as_user('moderator4@example.test');
select throws_ok($$select * from public.admin_list_users()$$, '42501', null, 'moderators cannot list users');
select tests.as_user('admin4@example.test');
select is((select email from public.admin_list_users('member4')), 'member4@example.test', 'administrators can search users by email');
select is((select roles from public.admin_list_users('member4')), array['buyer']::public.app_role[], 'roles are included');

-- Reference data edits are audited
select lives_ok($$update public.currencies set is_enabled = true where code = 'EUR'$$, 'administrators can enable a currency');
select lives_ok($$update public.site_settings set default_currency = 'EUR', brand_name = 'Find Your Home'$$, 'administrators can change settings');
select lives_ok($$insert into public.amenities (slug, name) values ('rooftop-terrace', 'Rooftop terrace')$$, 'administrators can add amenities');
select tests.as_postgres();
select is((select count(*)::int from public.audit_log where actor_id = (select id from fx where key = 'admin')
           and action in ('update.currencies', 'update.site_settings', 'insert.amenities')), 3,
  'administrator edits to reference data are audited');

select tests.as_user('moderator4@example.test');
select is(tests.rows_affected($$update public.site_settings set brand_name = 'Hijacked'$$), 0, 'moderators cannot change settings');
select throws_ok($$insert into public.property_types (slug, name) values ('castle', 'Castle')$$, '42501', null,
  'moderators cannot add property types');
select tests.as_user('member4@example.test');
select is(tests.rows_affected($$update public.content_pages set body_markdown = 'x', is_published = true$$), 0,
  'members cannot edit content pages');

-- Privacy requests
select public.request_data_export();
select is((select count(*)::int from public.data_requests), 1, 'members see their own request');
select tests.as_user('moderator4@example.test');
select throws_ok(
  $$select public.admin_update_data_request((select id from public.data_requests limit 1), 'completed')$$,
  '42501', null, 'moderators cannot handle privacy requests');
select tests.as_user('admin4@example.test');
select lives_ok(
  $$select public.admin_update_data_request((select id from public.data_requests where user_id = (select id from fx where key = 'member')), 'completed', 'Sent by email')$$,
  'administrators can complete privacy requests');
select is((select status::text from public.data_requests where user_id = (select id from fx where key = 'member')), 'completed', 'status updated');

-- Exports
select lives_ok($$select public.admin_record_export('enquiries', 12)$$, 'administrators record exports');
select tests.as_user('moderator4@example.test');
select throws_ok($$select public.admin_record_export('enquiries', 12)$$, '42501', null, 'moderators cannot export');

select * from finish();
rollback;
