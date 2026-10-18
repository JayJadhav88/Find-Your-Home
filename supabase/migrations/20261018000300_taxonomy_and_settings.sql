-- Administrator-managed reference data, site settings and content.

create table public.property_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  is_residential boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger property_types_updated_at before update on public.property_types
  for each row execute function app.set_updated_at();

create table public.amenities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  category text check (char_length(category) <= 40),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger amenities_updated_at before update on public.amenities
  for each row execute function app.set_updated_at();

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.locations (id) on delete restrict,
  level public.location_level not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  lat numeric(8, 5) check (lat between -90 and 90),
  lng numeric(8, 5) check (lng between -180 and 180),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_country_has_no_parent check ((level = 'country') = (parent_id is null)),
  constraint locations_unique_slug_per_parent unique nulls not distinct (parent_id, slug)
);

create index locations_parent_idx on public.locations (parent_id);
create index locations_name_trgm_idx on public.locations using gin (name extensions.gin_trgm_ops);

create trigger locations_updated_at before update on public.locations
  for each row execute function app.set_updated_at();

-- Parent must be exactly one level up (a city may sit directly under a country when
-- the country has no regions) and share the country code.
create function app.validate_location()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent public.locations;
begin
  if new.parent_id is null then
    return new;
  end if;

  select * into parent from public.locations where id = new.parent_id;

  if parent.country_code <> new.country_code then
    raise exception 'Location country_code must match its parent' using errcode = '23514';
  end if;

  if not (
    (new.level = 'region' and parent.level = 'country') or
    (new.level = 'city' and parent.level in ('country', 'region')) or
    (new.level = 'locality' and parent.level = 'city')
  ) then
    raise exception 'A % cannot be placed under a %', new.level, parent.level using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger locations_validate before insert or update on public.locations
  for each row execute function app.validate_location();

create table public.currencies (
  code char(3) primary key check (code ~ '^[A-Z]{3}$'),
  name text not null,
  minor_units smallint not null default 2 check (minor_units between 0 and 4),
  is_enabled boolean not null default false
);

-- ISO 4217 reference rows. None are enabled: the owner enables the currencies they use.
insert into public.currencies (code, name, minor_units) values
  ('AED', 'UAE Dirham', 2), ('AUD', 'Australian Dollar', 2), ('BRL', 'Brazilian Real', 2),
  ('CAD', 'Canadian Dollar', 2), ('CHF', 'Swiss Franc', 2), ('CNY', 'Chinese Yuan', 2),
  ('EUR', 'Euro', 2), ('GBP', 'Pound Sterling', 2), ('HKD', 'Hong Kong Dollar', 2),
  ('IDR', 'Indonesian Rupiah', 2), ('INR', 'Indian Rupee', 2), ('JPY', 'Japanese Yen', 0),
  ('KES', 'Kenyan Shilling', 2), ('KRW', 'South Korean Won', 0), ('MXN', 'Mexican Peso', 2),
  ('MYR', 'Malaysian Ringgit', 2), ('NGN', 'Nigerian Naira', 2), ('NZD', 'New Zealand Dollar', 2),
  ('PHP', 'Philippine Peso', 2), ('PKR', 'Pakistani Rupee', 2), ('QAR', 'Qatari Riyal', 2),
  ('SAR', 'Saudi Riyal', 2), ('SGD', 'Singapore Dollar', 2), ('THB', 'Thai Baht', 2),
  ('TRY', 'Turkish Lira', 2), ('USD', 'US Dollar', 2), ('VND', 'Vietnamese Dong', 0),
  ('ZAR', 'South African Rand', 2);

-- Single-row, typed platform settings (no free-form JSON).
create table public.site_settings (
  id boolean primary key default true check (id),
  brand_name text not null default 'Find Your Home' check (char_length(btrim(brand_name)) between 1 and 80),
  contact_email text check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone text check (char_length(contact_phone) <= 32),
  contact_whatsapp text check (char_length(contact_whatsapp) <= 32),
  default_locale text not null default 'en' check (default_locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  default_currency char(3) references public.currencies (code),
  default_timezone text not null default 'UTC',
  default_area_unit public.area_unit not null default 'sq_m',
  -- Account and moderation rules
  self_service_owner boolean not null default true,
  owner_leads_enabled boolean not null default true,
  material_change_policy text not null default 'unpublish_until_review'
    check (material_change_policy in ('unpublish_until_review', 'none')),
  material_fields text[] not null default array[
    'purpose', 'property_type_id', 'price_amount', 'currency', 'price_period',
    'country_id', 'region_id', 'city_id', 'locality_id',
    'area_value', 'area_unit', 'bedrooms', 'bathrooms', 'media'
  ],
  new_listing_days smallint not null default 14 check (new_listing_days between 0 and 365),
  -- Upload limits (also enforced by storage bucket configuration)
  max_images_per_listing smallint not null default 30 check (max_images_per_listing between 1 and 100),
  max_image_bytes integer not null default 10485760 check (max_image_bytes between 102400 and 52428800),
  allowed_image_types text[] not null default array['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  -- Buyer features and abuse protection
  comparison_max smallint not null default 4 check (comparison_max between 2 and 10),
  enquiry_limit_per_hour smallint not null default 10 check (enquiry_limit_per_hour between 1 and 1000),
  submission_limit_per_day smallint not null default 20 check (submission_limit_per_day between 1 and 1000),
  captcha_enabled boolean not null default false,
  -- SEO defaults
  seo_default_title text check (char_length(seo_default_title) <= 70),
  seo_default_description text check (char_length(seo_default_description) <= 170),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create function app.validate_site_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.default_timezone) then
    raise exception 'Unknown time zone: %', new.default_timezone using errcode = '23514';
  end if;
  if new.default_currency is not null
     and not exists (select 1 from public.currencies where code = new.default_currency and is_enabled) then
    raise exception 'Default currency % must be enabled first', new.default_currency using errcode = '23514';
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create trigger site_settings_validate before insert or update on public.site_settings
  for each row execute function app.validate_site_settings();

insert into public.site_settings default values;

create function app.settings()
returns public.site_settings
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.site_settings where id;
$$;

grant execute on function app.settings() to anon, authenticated, service_role;

-- Editable content. Legal pages start unpublished until the owner supplies reviewed text.
create table public.content_pages (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body_markdown text not null default '' check (char_length(body_markdown) <= 100000),
  is_published boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create trigger content_pages_updated_at before update on public.content_pages
  for each row execute function app.set_updated_at();

insert into public.content_pages (slug, title) values
  ('about', 'About'),
  ('contact', 'Contact'),
  ('privacy', 'Privacy policy'),
  ('terms', 'Terms of use');

create table public.homepage_sections (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('hero', 'featured_listings', 'recent_listings', 'location_links', 'text')),
  title text check (char_length(title) <= 120),
  body text check (char_length(body) <= 2000),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger homepage_sections_updated_at before update on public.homepage_sections
  for each row execute function app.set_updated_at();

create table public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  purpose public.listing_purpose,
  location_id uuid references public.locations (id) on delete restrict,
  property_type_id uuid references public.property_types (id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  intro text check (char_length(intro) <= 5000),
  is_indexable boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint landing_pages_has_filter check (num_nonnulls(purpose, location_id, property_type_id) > 0)
);

create trigger landing_pages_updated_at before update on public.landing_pages
  for each row execute function app.set_updated_at();
