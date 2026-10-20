begin;
\ir _helpers.psql
select no_plan();

create temp table fx (key text primary key, id uuid);
grant all on fx to anon, authenticated;

insert into fx values
  ('admin', tests.create_user('t.admin@example.test')),
  ('first', tests.create_user('t.first@example.test')),
  ('member', tests.create_user('t.member@example.test'));
select tests.grant_role((select id from fx where key = 'admin'), 'administrator');

-- ---------------------------------------------------------------------------
-- One-time password: must change before using the site
-- ---------------------------------------------------------------------------
select tests.as_user('t.first@example.test');
select throws_ok(
  $$ select public.require_password_change((select id from fx where key = 'member')) $$,
  '42501', null, 'members cannot force a password change on anyone'
);
select tests.as_postgres();
select public.require_password_change((select id from fx where key = 'first'));

select tests.as_user('t.first@example.test');
select ok((select public.must_change_password()), 'an account created with a one-time password must change it');
select tests.as_user('t.member@example.test');
select ok(not (select public.must_change_password()), 'ordinary accounts are not affected');

select tests.as_postgres();
update auth.users set updated_at = now() where id = (select id from fx where key = 'first');
select tests.as_user('t.first@example.test');
select ok((select public.must_change_password()), 'other account updates do not clear the requirement');
select tests.as_postgres();
update auth.users set encrypted_password = extensions.crypt('a-new-password-123', extensions.gen_salt('bf'))
where id = (select id from fx where key = 'first');
select tests.as_user('t.first@example.test');
select ok(not (select public.must_change_password()), 'choosing a new password clears it');

-- ---------------------------------------------------------------------------
-- Team & roles and Customers
-- ---------------------------------------------------------------------------
select tests.as_user('t.member@example.test');
select throws_ok(
  $$ select * from public.admin_list_users(null, 50, 0, 'team') $$,
  '42501', null, 'only administrators list the team'
);
select throws_ok(
  $$ select public.admin_add_team_member('t.member@example.test', 'support') $$,
  '42501', null, 'only administrators add team members'
);

select tests.as_user('t.admin@example.test');
select ok(
  (select id from fx where key = 'admin') in (select id from public.admin_list_users(null, 200, 0, 'team'))
  and (select id from fx where key = 'member') not in (select id from public.admin_list_users(null, 200, 0, 'team')),
  'the team list shows team members only'
);
select ok(
  (select id from fx where key = 'member') in (select id from public.admin_list_users(null, 200, 0, 'customers'))
  and (select id from fx where key = 'admin') not in (select id from public.admin_list_users(null, 200, 0, 'customers')),
  'the customer list shows everyone else'
);
select throws_ok(
  $$ select public.admin_add_team_member('nobody@example.test', 'support') $$,
  'PT409', null, 'adding someone without an account explains what to do'
);
select throws_ok(
  $$ select public.admin_add_team_member('t.member@example.test', 'owner') $$,
  'PT409', null, 'only team roles can be given here'
);
select lives_ok(
  $$ select public.admin_add_team_member('T.Member@Example.test', 'support') $$,
  'administrators add a member to the team by email (any capitalisation)'
);
select ok(
  (select id from fx where key = 'member') in (select id from public.admin_list_users(null, 200, 0, 'team')),
  'they now appear in the team'
);
select lives_ok(
  $$ select public.admin_remove_from_team((select id from fx where key = 'member')) $$,
  'administrators remove them from the team'
);
select ok(
  (select id from fx where key = 'member') in (select id from public.admin_list_users(null, 200, 0, 'customers')),
  'they are a customer again'
);
select throws_ok(
  $$ select public.admin_remove_from_team((select id from fx where key = 'admin')) $$,
  'PT409', null, 'administrators cannot remove themselves'
);

select * from finish();
rollback;
