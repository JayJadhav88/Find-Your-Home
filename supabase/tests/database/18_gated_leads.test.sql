begin;
\ir _helpers.psql
select no_plan();

create temp table fx (key text primary key, id uuid);
grant all on fx to anon, authenticated;
insert into fx values ('owner', tests.create_user('gl.owner@example.test'));
select tests.grant_role((select id from fx where key = 'owner'), 'owner');
update public.profiles set phone = '+91 90000 11111' where id = (select id from fx where key = 'owner');

with t as (
  insert into public.listings (title, description, category, purpose, owner_id, status, published_at, first_published_at, show_phone, contact_via_form)
  values ('GL flat with brochure', 'A flat used by the lead pop-up tests, near the market.', 'resale', 'sale',
          (select id from fx where key = 'owner'), 'published', now(), now(), true, true)
  returning id
)
insert into fx select 'listing', id from t;

-- ---------------------------------------------------------------------------
-- Visitors see that a phone exists, not the number
-- ---------------------------------------------------------------------------
select tests.as_anon();
select is((select phone from public.get_listing_contact((select id from fx where key = 'listing'))), null, 'visitors do not get the phone number directly');
select is((select has_phone from public.get_listing_contact((select id from fx where key = 'listing'))), true, 'visitors are told a phone number exists');
select is((select has_brochure from public.get_listing_contact((select id from fx where key = 'listing'))), false, 'no brochure yet');

select tests.as_user('gl.owner@example.test');
select is((select phone from public.get_listing_contact((select id from fx where key = 'listing'))), '+91 90000 11111', 'the owner still sees their own number');

-- ---------------------------------------------------------------------------
-- The pop-up
-- ---------------------------------------------------------------------------
select tests.as_anon();
select throws_ok(
  format($$ select public.submit_gated_lead(%L, 'contact_reveal', 'Asha', '12') $$, (select id from fx where key = 'listing')),
  '22023', null, 'a real phone number is required'
);
select throws_ok(
  format($$ select public.submit_gated_lead(%L, 'brochure', 'Asha', '+91 98888 77777') $$, (select id from fx where key = 'listing')),
  'PT409', null, 'no brochure, nothing to download'
);
select is(
  (select public.submit_gated_lead((select id from fx where key = 'listing'), 'contact_reveal', 'Asha', '+91 98888 77777', null,
     '{"timeline": "Within 3 months", "purpose": "Spaceship", "unknown": "x"}'::jsonb) ->> 'phone'),
  '+91 90000 11111', 'after the pop-up the phone number is released'
);
select tests.as_postgres();
select is(
  (select answers from public.enquiries where listing_id = (select id from fx where key = 'listing') and kind = 'contact_reveal'),
  '{"When are you planning to move?": "Within 3 months"}'::jsonb,
  'only answers to real questions, with real options, are kept'
);
select is(
  (select lead_type || '/' || interest || '/' || source from public.enquiries where listing_id = (select id from fx where key = 'listing') and kind = 'contact_reveal'),
  'customer/buy/website', 'the lead is filed as a buyer lead'
);

select tests.as_anon();
select public.submit_gated_lead((select id from fx where key = 'listing'), 'contact_reveal', 'Asha', '98888-77777');
select tests.as_postgres();
select is(
  (select count(*)::int from public.enquiries where listing_id = (select id from fx where key = 'listing') and kind = 'contact_reveal'),
  1, 'the same phone asking again the same day does not create a second lead'
);

-- Callback with a time
select tests.as_anon();
select public.submit_gated_lead((select id from fx where key = 'listing'), 'callback', 'Ravi', '+91 97777 66666', null, '{}', now() + interval '1 day');
select tests.as_postgres();
select ok(
  (select callback_at is not null and message like 'Asked for a callback at%' from public.enquiries
   where listing_id = (select id from fx where key = 'listing') and kind = 'callback'),
  'a callback request keeps the chosen time'
);

-- ---------------------------------------------------------------------------
-- Brochure
-- ---------------------------------------------------------------------------
select tests.as_user('gl.owner@example.test');
select throws_ok(
  format($$ select public.set_listing_brochure(%L, %L) $$, (select id from fx where key = 'listing'),
         (select id from fx where key = 'listing')::text || '/11111111-2222-3333-4444-555555555555.pdf'),
  'PT409', null, 'the file must be uploaded first'
);
select tests.as_postgres();
insert into storage.objects (bucket_id, name, owner, metadata)
values ('listing-brochures', (select id from fx where key = 'listing')::text || '/11111111-2222-3333-4444-555555555555.pdf',
        (select id from fx where key = 'owner'), '{"mimetype": "application/pdf", "size": 1000}');
select tests.as_user('gl.owner@example.test');
select lives_ok(
  format($$ select public.set_listing_brochure(%L, %L) $$, (select id from fx where key = 'listing'),
         (select id from fx where key = 'listing')::text || '/11111111-2222-3333-4444-555555555555.pdf'),
  'the owner sets the brochure'
);
select tests.as_anon();
select is(
  (select public.submit_gated_lead((select id from fx where key = 'listing'), 'brochure', 'Meera', '+91 96666 55555') ->> 'brochure_key'),
  (select id from fx where key = 'listing')::text || '/11111111-2222-3333-4444-555555555555.pdf',
  'after the pop-up the brochure is released'
);
select is(
  (select public.submit_gated_lead((select id from fx where key = 'listing'), 'brochure', 'Meera', '+91 96666 55555') ->> 'phone'),
  null, 'a brochure request does not release the phone number'
);

select tests.as_user('gl.owner@example.test');
select throws_ok(
  format($$ select public.set_listing_brochure(%L, %L) $$, (select id from fx where key = 'listing'),
         gen_random_uuid()::text || '/11111111-2222-3333-4444-555555555555.pdf'),
  'PT409', null, 'a brochure from another property folder is refused'
);

select * from finish();
rollback;
