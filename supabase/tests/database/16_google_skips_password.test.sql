begin;
\ir _helpers.psql
select no_plan();

-- An admin made with a one-time password, who then signs in with Google.
select tests.create_user('g.admin@example.test');
select public.require_password_change((select id from auth.users where email = 'g.admin@example.test'));
create temp table before_pw as select encrypted_password from auth.users where email = 'g.admin@example.test';
grant select on before_pw to authenticated;

select tests.as_user('g.admin@example.test');
select is(public.must_change_password(), true, 'a one-time password must be changed first');
select is(public.finish_google_sign_in(), false, 'without a Google sign-in nothing changes');
select is(public.must_change_password(), true, 'the requirement stays until Google is used');

select tests.as_postgres();
insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
select gen_random_uuid(), u.id, 'google-123', 'google', jsonb_build_object('sub', 'google-123', 'email', u.email), now(), now()
from auth.users u where u.email = 'g.admin@example.test';

select tests.as_user('g.admin@example.test');
select is(public.finish_google_sign_in(), true, 'after a Google sign-in the one-time password is replaced');
select is(public.must_change_password(), false, 'and no password needs to be chosen');
select is(public.finish_google_sign_in(), false, 'it only happens once');

select tests.as_postgres();
select isnt((select encrypted_password from auth.users where email = 'g.admin@example.test'),
  (select encrypted_password from before_pw), 'the one-time password no longer works');

select tests.as_anon();
select throws_ok($$ select public.finish_google_sign_in() $$, '42501', null, 'visitors cannot call it');

select * from finish();
rollback;
