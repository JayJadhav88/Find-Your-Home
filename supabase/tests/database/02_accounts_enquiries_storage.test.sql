begin;
\ir _helpers.psql
select no_plan();

create temp table fx (key text primary key, id uuid);
grant all on fx to anon, authenticated;

insert into fx values
  ('owner', tests.create_user('owner@example.test')),
  ('other_owner', tests.create_user('other.owner@example.test')),
  ('buyer', tests.create_user('buyer@example.test')),
  ('buyer2', tests.create_user('buyer2@example.test')),
  ('newbie', tests.create_user('newbie@example.test', false)),
  ('future_mod', tests.create_user('future.mod@example.test')),
  ('admin', tests.create_user('admin@example.test'));

select tests.grant_role((select id from fx where key = 'owner'), 'owner');
select tests.grant_role((select id from fx where key = 'other_owner'), 'owner');
select tests.grant_role((select id from fx where key = 'admin'), 'administrator');

-- A published listing and a draft, created directly as the database owner.
update public.currencies set is_enabled = true where code = 'USD';
with t as (insert into public.listings (owner_id, title, purpose, status, published_at, price_amount, currency)
  values ((select id from fx where key = 'owner'), 'Published sample home', 'rent', 'published', now(), 1200, 'USD')
  returning id)
insert into fx select 'pub', id from t;
with t as (insert into public.listings (owner_id, title, purpose)
  values ((select id from fx where key = 'owner'), 'Draft sample home', 'rent')
  returning id)
insert into fx select 'draft', id from t;

-- ---------------------------------------------------------------------------
-- Profiles and roles
-- ---------------------------------------------------------------------------
select tests.as_user('buyer@example.test');
select is((select count(*)::int from public.profiles), 1, 'users only see their own profile');
select lives_ok($$update public.profiles set display_name = 'Buyer One' where id = auth.uid()$$,
  'users can edit their own profile');
select throws_ok($$update public.profiles set status = 'suspended' where id = auth.uid()$$,
  '42501', null, 'users cannot change their own account status');
select throws_ok($$insert into public.user_roles (user_id, role) values (auth.uid(), 'administrator')$$,
  '42501', null, 'users cannot grant themselves roles');
select throws_ok($$select public.admin_set_role(auth.uid(), 'administrator', true)$$,
  '42501', null, 'non-admins cannot call the role function');
select throws_ok($$select public.bootstrap_admin('buyer@example.test')$$,
  '42501', null, 'the admin bootstrap function is not callable by users');

select tests.as_user('newbie@example.test');
select throws_ok($$select public.become_owner()$$, '42501', null,
  'unverified users cannot become owners');

select tests.as_user('buyer@example.test');
select lives_ok($$select public.become_owner()$$, 'verified users can opt in to listing property');
select is((select count(*)::int from public.user_roles where role = 'owner'), 1, 'owner role granted');

select tests.as_user('admin@example.test');
select lives_ok(
  $$select public.admin_set_role((select id from fx where key = 'future_mod'), 'moderator', true)$$,
  'administrators can grant staff roles');
select throws_ok($$select public.admin_set_role(auth.uid(), 'administrator', false)$$,
  'PT409', null, 'administrators cannot remove their own administrator role');
select lives_ok(
  $$select public.admin_set_account_status((select id from fx where key = 'other_owner'), 'suspended', 'Test suspension')$$,
  'administrators can suspend accounts');

select tests.as_postgres();
select isnt((select banned_until from auth.users where id = (select id from fx where key = 'other_owner')),
  null, 'suspension blocks sign-in at the auth layer');
select ok((select banned_until > now() + interval '50 years' and banned_until <> 'infinity'
           from auth.users where id = (select id from fx where key = 'other_owner')),
  'suspension uses a finite far-future ban that Supabase Auth can read');

select tests.as_user('other.owner@example.test');
select throws_ok(
  $$insert into public.listings (title, purpose, owner_id) values ('Suspended user listing', 'sale', auth.uid())$$,
  '42501', null, 'suspended accounts cannot create listings');

-- ---------------------------------------------------------------------------
-- Enquiries
-- ---------------------------------------------------------------------------
select tests.as_anon();
select isnt(
  public.submit_enquiry((select id from fx where key = 'pub'), 'Visitor', 'visitor@example.test', 'Is it still available?'),
  null, 'visitors can send an enquiry about a published listing');
select is((select count(*)::int from public.enquiries), 0, 'visitors cannot read enquiries');
select throws_ok(
  $$select public.submit_enquiry((select id from fx where key = 'draft'), 'Visitor', 'visitor@example.test', 'Hello')$$,
  'PT409', null, 'enquiries on unpublished listings are refused');
select throws_ok(
  $$select public.submit_enquiry((select id from fx where key = 'pub'), 'Visitor', 'visitor@example.test', 'Visit?',
      null, 'visit_request', now() - interval '1 day', 'UTC')$$,
  '22023', null, 'visit requests must be in the future');

select tests.as_user('buyer2@example.test');
select lives_ok(
  $$select public.submit_enquiry((select id from fx where key = 'pub'), 'Buyer Two', 'buyer2@example.test', 'Can I visit?',
      null, 'visit_request', now() + interval '3 days', 'UTC')$$,
  'signed-in users can request a visit');
select is((select count(*)::int from public.enquiries), 1, 'senders see only their own enquiries');
select is((select visit_status::text from public.enquiries), 'requested',
  'a visit stays "requested" until the lister confirms');

select tests.as_user('owner@example.test');
select is((select count(*)::int from public.enquiries), 2, 'owners see enquiries on their listings');
select is(
  public.respond_to_visit((select id from public.enquiries where kind = 'visit_request'), true)::text,
  'confirmed', 'owners can confirm a visit');

select tests.as_user('buyer@example.test');
select is((select count(*)::int from public.enquiries), 0, 'unrelated users see no enquiries');

select tests.as_postgres();
update public.site_settings set owner_leads_enabled = false;
select tests.as_user('owner@example.test');
select is((select count(*)::int from public.enquiries), 0, 'owners lose access when owner leads are disabled');

select tests.as_postgres();
update public.site_settings set enquiry_limit_per_hour = 2, owner_leads_enabled = true;
select tests.as_user('buyer@example.test');
select public.submit_enquiry((select id from fx where key = 'pub'), 'Buyer', 'buyer@example.test', 'One');
select public.submit_enquiry((select id from fx where key = 'pub'), 'Buyer', 'buyer@example.test', 'Two');
select throws_ok(
  $$select public.submit_enquiry((select id from fx where key = 'pub'), 'Buyer', 'buyer@example.test', 'Three')$$,
  'PT429', null, 'enquiries are rate limited');

-- ---------------------------------------------------------------------------
-- Favorites and comparison
-- ---------------------------------------------------------------------------
select lives_ok($$insert into public.favorites (user_id, listing_id) values (auth.uid(), (select id from fx where key = 'pub'))$$,
  'users can save a published listing');
select throws_ok($$insert into public.favorites (user_id, listing_id) values (auth.uid(), (select id from fx where key = 'draft'))$$,
  '42501', null, 'users cannot save unpublished listings');
select throws_ok(
  $$insert into public.favorites (user_id, listing_id) values ((select id from fx where key = 'buyer2'), (select id from fx where key = 'pub'))$$,
  '42501', null, 'users cannot write favorites for someone else');

select tests.as_user('buyer2@example.test');
select is((select count(*)::int from public.favorites), 0, 'favorites are private');

select tests.as_postgres();
update public.site_settings set comparison_max = 2;
with t as (insert into public.listings (owner_id, title, purpose, status, published_at)
  values ((select id from fx where key = 'owner'), 'Second published home', 'sale', 'published', now()) returning id)
insert into fx select 'pub2', id from t;
with t as (insert into public.listings (owner_id, title, purpose, status, published_at)
  values ((select id from fx where key = 'owner'), 'Third published home', 'sale', 'published', now()) returning id)
insert into fx select 'pub3', id from t;
select tests.as_user('buyer2@example.test');
insert into public.comparison_items (user_id, listing_id) values (auth.uid(), (select id from fx where key = 'pub'));
insert into public.comparison_items (user_id, listing_id) values (auth.uid(), (select id from fx where key = 'pub2'));
select throws_ok(
  $$insert into public.comparison_items (user_id, listing_id) values (auth.uid(), (select id from fx where key = 'pub3'))$$,
  '23514', null, 'the comparison list size is limited by settings');

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
select tests.as_user('owner@example.test');
select lives_ok(
  format($$insert into storage.objects (bucket_id, name) values ('listing-uploads', '%s/6f0f1f8e-2a51-4b1b-8a3c-0d9a1e2b3c4d.jpg')$$,
    (select id from fx where key = 'draft')),
  'owners can upload photos into their own listing folder');
select throws_ok(
  format($$insert into storage.objects (bucket_id, name) values ('listing-uploads', '%s/../../evil.php')$$,
    (select id from fx where key = 'draft')),
  '42501', null, 'unsafe object names are refused');

select tests.as_user('buyer2@example.test');
select throws_ok(
  format($$insert into storage.objects (bucket_id, name) values ('listing-uploads', '%s/7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.jpg')$$,
    (select id from fx where key = 'draft')),
  '42501', null, 'other users cannot upload into someone else''s listing');
select is((select count(*)::int from storage.objects where bucket_id = 'listing-uploads'), 0,
  'other users cannot list private listing uploads');

select tests.as_anon();
select is((select count(*)::int from storage.objects where bucket_id = 'listing-uploads'), 0,
  'visitors cannot see private listing uploads');

select * from finish();
rollback;
