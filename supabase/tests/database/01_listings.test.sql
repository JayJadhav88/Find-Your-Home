begin;
\ir _helpers.psql
select no_plan();

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------
create temp table fx (key text primary key, id uuid);
grant all on fx to anon, authenticated;

insert into fx values
  ('owner_a', tests.create_user('owner.a@example.test')),
  ('owner_b', tests.create_user('owner.b@example.test')),
  ('buyer', tests.create_user('buyer@example.test')),
  ('unverified', tests.create_user('unverified@example.test', false)),
  ('moderator', tests.create_user('moderator@example.test')),
  ('admin', tests.create_user('admin@example.test'));

select tests.grant_role((select id from fx where key = 'owner_a'), 'owner');
select tests.grant_role((select id from fx where key = 'owner_b'), 'owner');
select tests.grant_role((select id from fx where key = 'unverified'), 'owner');
select tests.grant_role((select id from fx where key = 'moderator'), 'moderator');
select tests.grant_role((select id from fx where key = 'admin'), 'administrator');

update public.currencies set is_enabled = true where code = 'USD';
with t as (insert into public.property_types (slug, name) values ('test-apartment', 'Test apartment') returning id)
insert into fx select 'type', id from t;
with t as (insert into public.locations (level, name, slug, country_code) values ('country', 'Testland', 'testland', 'ZZ') returning id)
insert into fx select 'country', id from t;
with t as (insert into public.locations (parent_id, level, name, slug, country_code)
  values ((select id from fx where key = 'country'), 'city', 'Sample City', 'sample-city', 'ZZ') returning id)
insert into fx select 'city', id from t;

select is(
  (select count(*)::int from public.user_roles where user_id = (select id from fx where key = 'buyer')),
  1, 'sign-up trigger gives a new account exactly one role (buyer)'
);

-- ---------------------------------------------------------------------------
-- Creating a listing
-- ---------------------------------------------------------------------------
select tests.as_user('owner.a@example.test');

with t as (insert into public.listings (title, purpose, owner_id, status, is_featured, reference_code)
  values ('Bright two-bedroom flat', 'sale', (select id from fx where key = 'owner_b'), 'published', true, 'HACK-1')
  returning id)
insert into fx select 'l1', id from t;

select is((select owner_id from public.listings where id = (select id from fx where key = 'l1')),
  (select id from fx where key = 'owner_a'), 'owner_id is forced to the signed-in user');
select is((select status::text from public.listings where id = (select id from fx where key = 'l1')),
  'draft', 'new listings always start as drafts');
select is((select is_featured from public.listings where id = (select id from fx where key = 'l1')),
  false, 'clients cannot create featured listings');
select matches((select reference_code from public.listings where id = (select id from fx where key = 'l1')),
  '^FYH-\d{6}$', 'reference code is generated, not client-chosen');
select is((select slug from public.listings where id = (select id from fx where key = 'l1')),
  'bright-two-bedroom-flat', 'slug is generated from the title');

select throws_ok(
  $$update public.listings set status = 'published' where id = (select id from fx where key = 'l1')$$,
  '42501', null, 'owners cannot change status directly');

select tests.as_user('buyer@example.test');
select throws_ok(
  $$insert into public.listings (title, purpose, owner_id) values ('Buyer listing', 'rent', auth.uid())$$,
  '42501', null, 'buyers without the owner role cannot create listings');

select tests.as_user('unverified@example.test');
select throws_ok(
  $$insert into public.listings (title, purpose, owner_id) values ('Unverified listing', 'rent', auth.uid())$$,
  '42501', null, 'unverified accounts cannot create listings');

-- ---------------------------------------------------------------------------
-- Draft visibility and editing
-- ---------------------------------------------------------------------------
select tests.as_anon();
select is((select count(*)::int from public.listings where id = (select id from fx where key = 'l1')),
  0, 'visitors cannot see drafts');

select tests.as_user('owner.b@example.test');
select is((select count(*)::int from public.listings where id = (select id from fx where key = 'l1')),
  0, 'other owners cannot see a draft');
select is(
  tests.rows_affected($q$update public.listings set title = 'Hijacked title' where id = (select id from fx where key = 'l1')$q$),
  0, 'other owners cannot edit a listing');

select tests.as_user('owner.a@example.test');
select throws_ok(
  $$select public.submit_listing((select id from fx where key = 'l1'))$$,
  '22023', 'Listing is incomplete', 'incomplete listings cannot be submitted');

update public.listings set
  description = 'A sample listing used only by automated tests. Not a real property.',
  property_type_id = (select id from fx where key = 'type'),
  price_amount = 250000, currency = 'USD',
  country_id = (select id from fx where key = 'country'),
  city_id = (select id from fx where key = 'city'),
  area_unit = 'sq_m', area_value = 85, bedrooms = 2, bathrooms = 1
where id = (select id from fx where key = 'l1');

insert into public.listing_private_details (listing_id, street_address)
values ((select id from fx where key = 'l1'), '1 Example Street');

-- Upload a cover photo: the stored object must exist before registering it.
select tests.as_postgres();
select tests.fake_upload('listing-uploads',
  (select id from fx where key = 'l1')::text || '/0b6d1c56-6f1e-4b8e-9a43-9a0e2f1d6c11.jpg');
select tests.as_user('owner.a@example.test');
insert into public.listing_media (listing_id, upload_key, is_cover, alt_text, mime_type, bytes)
values ((select id from fx where key = 'l1'),
        (select id from fx where key = 'l1')::text || '/0b6d1c56-6f1e-4b8e-9a43-9a0e2f1d6c11.jpg',
        true, 'Living room', 'application/x-msdownload', 1);
select is((select mime_type from public.listing_media where listing_id = (select id from fx where key = 'l1')),
  'image/jpeg', 'media type comes from the stored object, not the client');

select throws_ok(
  $$insert into public.listing_media (listing_id, upload_key)
    values ((select id from fx where key = 'l1'), (select id from fx where key = 'l1')::text || '/not-uploaded.jpg')$$,
  '23503', null, 'media cannot be registered for a file that was never uploaded');

select is(public.submit_listing((select id from fx where key = 'l1'))::text, 'pending_review',
  'a complete draft can be submitted');
select is(
  tests.rows_affected($q$update public.listings set title = 'Edited while pending' where id = (select id from fx where key = 'l1')$q$),
  0, 'listings awaiting review cannot be edited');

-- ---------------------------------------------------------------------------
-- Moderation
-- ---------------------------------------------------------------------------
select tests.as_user('buyer@example.test');
select throws_ok(
  $$select public.moderate_listing((select id from fx where key = 'l1'), 'approve')$$,
  '42501', null, 'buyers cannot moderate');

select tests.as_user('owner.a@example.test');
select throws_ok(
  $$select public.moderate_listing((select id from fx where key = 'l1'), 'approve')$$,
  '42501', null, 'owners cannot approve their own listing');

select tests.as_user('moderator@example.test');
select throws_ok(
  $$select public.moderate_listing((select id from fx where key = 'l1'), 'reject')$$,
  '22023', 'A reason is required', 'rejecting requires a reason');
select is(public.moderate_listing((select id from fx where key = 'l1'), 'approve')::text, 'published',
  'moderators can approve');

select tests.as_anon();
select is((select count(*)::int from public.listings where id = (select id from fx where key = 'l1')),
  1, 'visitors see the listing once published');
select is((select count(*)::int from public.listing_media where listing_id = (select id from fx where key = 'l1')),
  1, 'visitors see media of published listings');
select is((select count(*)::int from public.listing_private_details where listing_id = (select id from fx where key = 'l1')),
  0, 'visitors never see the exact address');
select is((select display_name from public.get_listing_contact((select id from fx where key = 'l1'))),
  'owner.a', 'visitors can fetch the public contact card');
select is((select email from public.get_listing_contact((select id from fx where key = 'l1'))),
  null, 'contact email stays hidden unless the lister chose to show it');

select tests.as_postgres();
select is((select count(*)::int from public.job_queue
           where listing_id = (select id from fx where key = 'l1') and kind = 'publish_listing_media'),
  1, 'approval queues the media publishing job');
select is((select count(*)::int from public.notification_outbox
           where recipient_user_id = (select id from fx where key = 'owner_a') and template = 'listing_decision'),
  1, 'the owner is notified of the decision');
select is((select count(*)::int from public.audit_log
           where entity_id = (select id from fx where key = 'l1')::text and action = 'listing.approve'),
  1, 'approval is written to the audit log');

-- ---------------------------------------------------------------------------
-- Featuring
-- ---------------------------------------------------------------------------
select tests.as_user('moderator@example.test');
select throws_ok(
  $$select public.set_listing_featured((select id from fx where key = 'l1'), true)$$,
  '42501', null, 'moderators cannot feature listings');
select tests.as_user('admin@example.test');
select lives_ok(
  $$select public.set_listing_featured((select id from fx where key = 'l1'), true)$$,
  'administrators can feature a published listing');

-- ---------------------------------------------------------------------------
-- Material change sends a live listing back to review
-- ---------------------------------------------------------------------------
select tests.as_user('owner.a@example.test');
update public.listings set description = description || ' Freshly painted.'
where id = (select id from fx where key = 'l1');
select is((select status::text from public.listings where id = (select id from fx where key = 'l1')),
  'published', 'non-material edits keep the listing live');

update public.listings set price_amount = 199000 where id = (select id from fx where key = 'l1');
select is((select status::text from public.listings where id = (select id from fx where key = 'l1')),
  'pending_review', 'changing the price sends a live listing back to review');
select is((select is_featured from public.listings where id = (select id from fx where key = 'l1')),
  false, 'leaving publication clears the featured flag');

select tests.as_anon();
select is((select count(*)::int from public.listings where id = (select id from fx where key = 'l1')),
  0, 'a listing under re-review is hidden from visitors');

-- ---------------------------------------------------------------------------
-- History masks staff-only reasons
-- ---------------------------------------------------------------------------
select tests.as_user('moderator@example.test');
select public.moderate_listing((select id from fx where key = 'l1'), 'reject', 'Internal: price looks wrong', false);

select tests.as_user('owner.a@example.test');
select is((select reason from public.get_listing_history((select id from fx where key = 'l1')) limit 1),
  null, 'staff-only rejection reasons are hidden from the owner');
select is((select count(*)::int from public.listing_status_events),
  0, 'owners cannot read the raw status table');

select tests.as_user('owner.b@example.test');
select throws_ok(
  $$select * from public.get_listing_history((select id from fx where key = 'l1'))$$,
  '42501', null, 'other owners cannot read the history');

select tests.as_user('buyer@example.test');
select is((select count(*)::int from public.audit_log), 0, 'buyers cannot read the audit log');

-- ---------------------------------------------------------------------------
-- Outcomes
-- ---------------------------------------------------------------------------
select tests.as_user('owner.a@example.test');
select throws_ok(
  $$select public.set_listing_outcome((select id from fx where key = 'l1'), 'sold')$$,
  'PT409', null, 'only published listings can be marked sold');
select is(public.set_listing_outcome((select id from fx where key = 'l1'), 'archived')::text, 'archived',
  'owners can archive their listing');
select is(public.restore_listing((select id from fx where key = 'l1'))::text, 'draft',
  'owners can restore an archived listing to draft');

select * from finish();
rollback;
