begin;
\ir _helpers.psql
select no_plan();

create temp table fx (key text primary key, id uuid);
grant all on fx to anon, authenticated;

insert into fx values
  ('admin', tests.create_user('q.admin@example.test')),
  ('moderator', tests.create_user('q.moderator@example.test')),
  ('owner', tests.create_user('q.owner@example.test'));
select tests.grant_role((select id from fx where key = 'admin'), 'administrator');
select tests.grant_role((select id from fx where key = 'moderator'), 'moderator');
select tests.grant_role((select id from fx where key = 'owner'), 'owner');

-- A live property with a photo and a lead.
with t as (
  insert into public.listings (title, description, category, purpose, owner_id, status, published_at)
  values ('Q flat with a view', 'A bright flat used by the admin listing tests, near the park.', 'resale', 'sale',
          (select id from fx where key = 'owner'), 'published', now())
  returning id
)
insert into fx select 'listing', id from t;
select tests.fake_upload('listing-uploads', (select id from fx where key = 'listing')::text || '/2b6d1c56-6f1e-4b8e-9a43-9a0e2f1d6c11.jpg');
insert into public.listing_media (listing_id, upload_key, is_cover)
values ((select id from fx where key = 'listing'), (select id from fx where key = 'listing')::text || '/2b6d1c56-6f1e-4b8e-9a43-9a0e2f1d6c11.jpg', true);

select tests.as_anon();
with t as (
  select public.submit_enquiry((select id from fx where key = 'listing'), 'Asha', 'asha@example.test',
    'Is it still available?', null, 'enquiry', null, null, 'v1', 'website', null) as id
)
insert into fx select 'lead', id from t;
select tests.as_postgres();
insert into fx select 'reference', null;
create temp table ref as select reference_code from public.listings where id = (select id from fx where key = 'listing');
grant select on ref to authenticated;

-- Super admins edit anyone's property; the change is logged.
select tests.as_user('q.admin@example.test');
update public.listings set title = 'Q flat with a park view' where id = (select id from fx where key = 'listing');
select tests.as_postgres();
select is((select status::text from public.listings where id = (select id from fx where key = 'listing')), 'published',
  'a super admin''s edit keeps the property live (no re-review)');
select ok(exists (select 1 from public.audit_log where action = 'listing.staff_edit'
                  and entity_id = (select id from fx where key = 'listing')::text and after -> 'fields' ? 'title'),
  'the edit is in the audit log with the changed fields');

-- Deleting
select tests.as_user('q.moderator@example.test');
select throws_ok(
  format($$ select public.admin_delete_listing(%L, %L) $$, (select id from fx where key = 'listing'), (select reference_code from ref)),
  '42501', null, 'moderators cannot delete properties'
);
select tests.as_user('q.owner@example.test');
select throws_ok(
  format($$ select public.admin_delete_listing(%L, %L) $$, (select id from fx where key = 'listing'), (select reference_code from ref)),
  '42501', null, 'owners cannot use the admin delete'
);
select tests.as_user('q.admin@example.test');
select throws_ok(
  format($$ select public.admin_delete_listing(%L, 'WRONG') $$, (select id from fx where key = 'listing')),
  'PT409', null, 'the reference code must be typed to confirm'
);
select lives_ok(
  format($$ select public.admin_delete_listing(%L, %L) $$, (select id from fx where key = 'listing'), lower((select reference_code from ref))),
  'super admins delete a property after confirming its reference'
);

select tests.as_postgres();
select ok(not exists (select 1 from public.listings where id = (select id from fx where key = 'listing')), 'the property is gone');
select ok(not exists (select 1 from public.listing_media where listing_id = (select id from fx where key = 'listing')), 'its photo records are gone');
select is(
  (select listing_id::text || '|' || property_reference from public.enquiries where id = (select id from fx where key = 'lead')),
  null, 'the lead is no longer linked to the property'
);
select is((select property_reference from public.enquiries where id = (select id from fx where key = 'lead')),
  (select reference_code from ref), 'the lead keeps the property''s reference');
select is(
  (select payload -> 'private' ->> 0 from public.job_queue where kind = 'delete_listing_files' and listing_id = (select id from fx where key = 'listing')),
  (select id from fx where key = 'listing')::text || '/2b6d1c56-6f1e-4b8e-9a43-9a0e2f1d6c11.jpg',
  'the photo files are queued for removal'
);
select ok(exists (select 1 from public.audit_log where action = 'listing.delete' and entity_id = (select id from fx where key = 'listing')::text),
  'the deletion is in the audit log');

select * from finish();
rollback;
