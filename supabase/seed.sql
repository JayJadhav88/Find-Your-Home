-- LOCAL DEVELOPMENT / DEMO DATA ONLY. Runs on `supabase db reset` and `supabase start`.
-- Every name below is fictional and labelled DEMO. Never run this against production.
--
-- Demo accounts (local only), password for all: DemoPassword123
--   demo.admin@example.test  (administrator)
--   demo.moderator@example.test (moderator)
--   demo.owner@example.test  (owner)
--   demo.buyer@example.test  (buyer)
--   demo.builder@example.test (builder: can list new projects)
--   demo.crm@example.test    (CRM manager: all leads)
--   demo.sales@example.test  (sales agent: only leads assigned to them)
--   demo.support@example.test (support: all leads)
--   demo.content@example.test (content manager: pages, banners, floating button)
--   demo.marketing@example.test (marketing: messages to members)

-- Currency and defaults for the demo. Real deployments choose these in admin settings.
update public.currencies set is_enabled = true where code = 'USD';
update public.site_settings set default_currency = 'USD', default_locale = 'en', default_timezone = 'UTC';

-- Demo accounts
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email,
  extensions.crypt('DemoPassword123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', u.display_name),
  now(), now(), '', '', '', ''
from (values
  ('d0000000-0000-4000-8000-000000000001'::uuid, 'demo.admin@example.test', 'Demo Admin'),
  ('d0000000-0000-4000-8000-000000000002'::uuid, 'demo.moderator@example.test', 'Demo Moderator'),
  ('d0000000-0000-4000-8000-000000000003'::uuid, 'demo.owner@example.test', 'Demo Owner'),
  ('d0000000-0000-4000-8000-000000000004'::uuid, 'demo.buyer@example.test', 'Demo Buyer'),
  ('d0000000-0000-4000-8000-000000000005'::uuid, 'demo.builder@example.test', 'Demo Builder'),
  ('d0000000-0000-4000-8000-000000000006'::uuid, 'demo.crm@example.test', 'Demo CRM Manager'),
  ('d0000000-0000-4000-8000-000000000007'::uuid, 'demo.sales@example.test', 'Demo Sales Agent'),
  ('d0000000-0000-4000-8000-000000000008'::uuid, 'demo.support@example.test', 'Demo Support'),
  ('d0000000-0000-4000-8000-000000000009'::uuid, 'demo.content@example.test', 'Demo Content Manager'),
  ('d0000000-0000-4000-8000-000000000010'::uuid, 'demo.marketing@example.test', 'Demo Marketing')
) as u (id, email, display_name);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
from auth.users u where u.email like 'demo.%@example.test';

insert into public.user_roles (user_id, role) values
  ('d0000000-0000-4000-8000-000000000001', 'administrator'),
  ('d0000000-0000-4000-8000-000000000002', 'moderator'),
  ('d0000000-0000-4000-8000-000000000003', 'owner'),
  ('d0000000-0000-4000-8000-000000000005', 'builder'),
  ('d0000000-0000-4000-8000-000000000006', 'crm_manager'),
  ('d0000000-0000-4000-8000-000000000007', 'sales_agent'),
  ('d0000000-0000-4000-8000-000000000008', 'support'),
  ('d0000000-0000-4000-8000-000000000009', 'content_manager'),
  ('d0000000-0000-4000-8000-000000000010', 'marketing');

insert into public.builder_profiles (user_id, company_name, registration_number)
values ('d0000000-0000-4000-8000-000000000005', '[DEMO] Example Builders Ltd', 'DEMO-REG-001');

-- Fictional locations (ZZ is an ISO user-assigned code, not a real country)
insert into public.locations (id, parent_id, level, name, slug, country_code) values
  ('c0000000-0000-4000-8000-000000000001', null, 'country', 'Demo Country', 'demo-country', 'ZZ'),
  ('c0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'region', 'Demo Region', 'demo-region', 'ZZ'),
  ('c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002', 'city', 'Sampleton', 'sampleton', 'ZZ'),
  ('c0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000003', 'locality', 'Old Town (demo)', 'old-town-demo', 'ZZ'),
  ('c0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000003', 'locality', 'Riverside (demo)', 'riverside-demo', 'ZZ');

-- Demo listings (no photos: the publishing pipeline needs real uploads)
insert into public.listings (
  owner_id, title, description, purpose, property_type_id, status, published_at, first_published_at, submitted_at,
  price_amount, currency, price_period, country_id, region_id, city_id, locality_id,
  area_unit, area_value, bedrooms, bathrooms, furnishing, possession_status
)
select
  'd0000000-0000-4000-8000-000000000003',
  l.title,
  'DEMO listing for local development. This is not a real property and is not for sale or rent.',
  l.purpose::public.listing_purpose,
  (select id from public.property_types where slug = l.type_slug),
  l.status::public.listing_status,
  case when l.status = 'published' then now() - l.age end,
  case when l.status = 'published' then now() - l.age end,
  now() - l.age,
  l.price, 'USD', l.period::public.price_period,
  'c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002',
  'c0000000-0000-4000-8000-000000000003', l.locality::uuid,
  'sq_m', l.area, l.beds, l.baths, 'semi_furnished', 'ready'
from (values
  ('[DEMO] Two-bedroom apartment near the park', 'sale', 'apartment', 'published', interval '2 days', 185000, 'total', 'c0000000-0000-4000-8000-000000000004', 82, 2, 1),
  ('[DEMO] Family house with garden', 'sale', 'house', 'published', interval '10 days', 420000, 'total', 'c0000000-0000-4000-8000-000000000005', 160, 4, 3),
  ('[DEMO] Studio for rent in Old Town', 'rent', 'studio', 'published', interval '1 day', 650, 'per_month', 'c0000000-0000-4000-8000-000000000004', 34, 0, 1),
  ('[DEMO] Riverside townhouse to rent', 'rent', 'townhouse', 'published', interval '20 days', 1800, 'per_month', 'c0000000-0000-4000-8000-000000000005', 120, 3, 2),
  ('[DEMO] Penthouse awaiting review', 'sale', 'penthouse', 'pending_review', interval '3 hours', 760000, 'total', 'c0000000-0000-4000-8000-000000000004', 210, 3, 3)
) as l (title, purpose, type_slug, status, age, price, period, locality, area, beds, baths);
