-- Listings, private details, media, amenities, status history, and the triggers that
-- protect workflow-owned columns.

create sequence public.listing_reference_seq start 1001;

create function app.slugify(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(left(btrim(regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g'), '-'), 80), ''),
    'property'
  );
$$;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique
    default 'FYH-' || lpad(nextval('public.listing_reference_seq')::text, 6, '0'),
  slug text not null,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  agent_id uuid references public.profiles (id) on delete set null,

  title text not null check (char_length(btrim(title)) between 3 and 140),
  description text not null default '' check (char_length(description) <= 10000),

  purpose public.listing_purpose not null,
  property_type_id uuid references public.property_types (id) on delete restrict,
  status public.listing_status not null default 'draft',
  is_featured boolean not null default false,
  featured_until timestamptz,

  price_amount numeric(14, 2) check (price_amount >= 0),
  currency char(3) references public.currencies (code),
  price_period public.price_period not null default 'total',
  price_negotiable boolean not null default false,
  price_display public.price_display not null default 'show',

  country_id uuid references public.locations (id) on delete restrict,
  region_id uuid references public.locations (id) on delete restrict,
  city_id uuid references public.locations (id) on delete restrict,
  locality_id uuid references public.locations (id) on delete restrict,
  postal_code text check (char_length(postal_code) <= 20),
  address_visibility public.address_visibility not null default 'approximate',
  public_lat numeric(8, 5) check (public_lat between -90 and 90),
  public_lng numeric(8, 5) check (public_lng between -180 and 180),

  -- All area figures share one unit.
  area_unit public.area_unit,
  area_value numeric(12, 2) check (area_value > 0),
  built_up_area numeric(12, 2) check (built_up_area > 0),
  carpet_area numeric(12, 2) check (carpet_area > 0),
  plot_area numeric(12, 2) check (plot_area > 0),

  bedrooms smallint check (bedrooms between 0 and 50),
  bathrooms smallint check (bathrooms between 0 and 50),
  balconies smallint check (balconies between 0 and 50),
  parking_spaces smallint check (parking_spaces between 0 and 100),
  floor_number smallint check (floor_number between -5 and 300),
  total_floors smallint check (total_floors between 0 and 300),
  year_built smallint check (year_built between 1600 and 2100),
  furnishing public.furnishing,
  possession_status public.possession_status,
  available_from date,

  video_url text check (video_url ~ '^https://' and char_length(video_url) <= 500),
  virtual_tour_url text check (virtual_tour_url ~ '^https://' and char_length(virtual_tour_url) <= 500),

  contact_via_form boolean not null default true,
  show_phone boolean not null default false,
  show_whatsapp boolean not null default false,
  show_email boolean not null default false,

  seo_title text check (char_length(seo_title) <= 70),
  seo_description text check (char_length(seo_description) <= 170),

  submitted_at timestamptz,
  published_at timestamptz,
  first_published_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  archived_at timestamptz,

  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B')
  ) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint listings_area_has_unit check (
    num_nonnulls(area_value, built_up_area, carpet_area, plot_area) = 0 or area_unit is not null
  ),
  constraint listings_floor_within_building check (
    floor_number is null or total_floors is null or floor_number <= total_floors
  ),
  constraint listings_featured_requires_published check (not is_featured or status = 'published'),
  constraint listings_published_has_date check (status <> 'published' or published_at is not null)
);

create index listings_public_browse_idx on public.listings (status, published_at desc, id);
create index listings_public_price_idx on public.listings (status, purpose, price_amount, id);
create index listings_city_idx on public.listings (city_id, status);
create index listings_locality_idx on public.listings (locality_id) where locality_id is not null;
create index listings_region_idx on public.listings (region_id) where region_id is not null;
create index listings_country_idx on public.listings (country_id);
create index listings_type_idx on public.listings (property_type_id);
create index listings_bedrooms_idx on public.listings (bedrooms) where status = 'published';
create index listings_owner_idx on public.listings (owner_id, updated_at desc);
create index listings_agent_idx on public.listings (agent_id) where agent_id is not null;
create index listings_pending_idx on public.listings (submitted_at) where status = 'pending_review';
create index listings_featured_idx on public.listings (published_at desc) where is_featured;
create index listings_search_idx on public.listings using gin (search_vector);

create trigger listings_updated_at before update on public.listings
  for each row execute function app.set_updated_at();

-- Exact address and coordinates: never readable by the public.
create table public.listing_private_details (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  street_address text check (char_length(street_address) <= 300),
  exact_lat numeric(9, 6) check (exact_lat between -90 and 90),
  exact_lng numeric(9, 6) check (exact_lng between -180 and 180),
  owner_notes text check (char_length(owner_notes) <= 2000),
  updated_at timestamptz not null default now()
);

create trigger listing_private_details_updated_at before update on public.listing_private_details
  for each row execute function app.set_updated_at();

create table public.listing_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  kind public.media_kind not null default 'image',
  -- Object name in the private bucket; always "<listing_id>/<random>.<ext>".
  upload_key text not null unique check (char_length(upload_key) <= 300),
  -- Object name in the public bucket; set only by the publishing job while published.
  public_key text unique,
  mime_type text,
  bytes integer check (bytes > 0),
  width integer check (width > 0),
  height integer check (height > 0),
  alt_text text check (char_length(alt_text) <= 250),
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  constraint listing_media_key_in_listing_folder check (upload_key like listing_id::text || '/%'),
  constraint listing_media_cover_is_image check (not is_cover or kind = 'image')
);

create index listing_media_listing_idx on public.listing_media (listing_id, sort_order);
create unique index listing_media_one_cover on public.listing_media (listing_id) where is_cover;

create table public.listing_amenities (
  listing_id uuid not null references public.listings (id) on delete cascade,
  amenity_id uuid not null references public.amenities (id) on delete restrict,
  primary key (listing_id, amenity_id)
);

create index listing_amenities_amenity_idx on public.listing_amenities (amenity_id);

create table public.listing_status_events (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  from_status public.listing_status,
  to_status public.listing_status not null,
  actor_id uuid references public.profiles (id) on delete set null,
  reason text check (char_length(reason) <= 2000),
  reason_visible_to_owner boolean not null default true,
  created_at timestamptz not null default now()
);

create index listing_status_events_listing_idx on public.listing_status_events (listing_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------------

-- Owner, assigned agent, or staff: may view everything about the listing.
create function app.can_manage_listing(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_staff() or exists (
    select 1 from public.listings l
    where l.id = p_listing_id
      and app.is_active_user()
      and (l.owner_id = auth.uid() or (l.agent_id = auth.uid() and app.has_role('agent')))
  );
$$;

-- May change content now: owner/assigned agent while the listing is editable, or an administrator.
create function app.can_edit_listing(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_admin() or exists (
    select 1 from public.listings l
    where l.id = p_listing_id
      and l.status in ('draft', 'rejected', 'published')
      and app.is_active_user()
      and (l.owner_id = auth.uid() or (l.agent_id = auth.uid() and app.has_role('agent')))
  );
$$;

create function app.is_listing_public(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.listings where id = p_listing_id and status = 'published');
$$;

grant execute on function
  app.slugify(text), app.can_manage_listing(uuid), app.can_edit_listing(uuid), app.is_listing_public(uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Status transitions (internal). Only workflow functions and the material-change
-- trigger call this.
-- ---------------------------------------------------------------------------
create function app.log_listing_status(
  p_listing_id uuid,
  p_from public.listing_status,
  p_to public.listing_status,
  p_reason text default null,
  p_visible boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.listing_status_events (listing_id, from_status, to_status, actor_id, reason, reason_visible_to_owner)
  values (p_listing_id, p_from, p_to, auth.uid(), p_reason, p_visible);

  if p_from = 'published' and p_to <> 'published' then
    insert into public.job_queue (kind, listing_id) values ('unpublish_listing_media', p_listing_id);
  elsif p_to = 'published' and p_from is distinct from 'published' then
    insert into public.job_queue (kind, listing_id) values ('publish_listing_media', p_listing_id);
  end if;
end;
$$;

-- Called by the material-change triggers for client edits of a live listing.
create function app.return_listing_to_review(p_listing_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.listings
  set status = 'pending_review', published_at = null, is_featured = false, featured_until = null,
      submitted_at = now()
  where id = p_listing_id and status = 'published';

  if found then
    perform app.log_listing_status(p_listing_id, 'published', 'pending_review', p_reason, true);
  end if;
end;
$$;

grant execute on function
  app.log_listing_status(uuid, public.listing_status, public.listing_status, text, boolean),
  app.return_listing_to_review(uuid, text)
  to authenticated, service_role;
revoke execute on function
  app.log_listing_status(uuid, public.listing_status, public.listing_status, text, boolean),
  app.return_listing_to_review(uuid, text)
  from public, anon;

-- ---------------------------------------------------------------------------
-- Column protection for direct client writes
-- ---------------------------------------------------------------------------
create function app.listings_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  settings public.site_settings := app.settings();
  field text;
  material_changed boolean := false;
begin
  new.slug := app.slugify(new.title);

  if not app.is_client_request() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Clients cannot choose ownership, workflow state or the reference number.
    new.owner_id := auth.uid();
    new.agent_id := null;
    new.status := 'draft';
    new.is_featured := false;
    new.featured_until := null;
    new.submitted_at := null;
    new.published_at := null;
    new.first_published_at := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.archived_at := null;
    new.reference_code := 'FYH-' || lpad(nextval('public.listing_reference_seq')::text, 6, '0');
    new.created_at := now();
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id
     or new.agent_id is distinct from old.agent_id
     or new.status is distinct from old.status
     or new.is_featured is distinct from old.is_featured
     or new.featured_until is distinct from old.featured_until
     or new.submitted_at is distinct from old.submitted_at
     or new.published_at is distinct from old.published_at
     or new.first_published_at is distinct from old.first_published_at
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
     or new.archived_at is distinct from old.archived_at
     or new.reference_code is distinct from old.reference_code
     or new.created_at is distinct from old.created_at then
    raise exception 'Listing ownership and workflow fields can only change through workflow actions'
      using errcode = '42501';
  end if;

  if old.status = 'published' and settings.material_change_policy = 'unpublish_until_review' and not app.is_staff() then
    foreach field in array settings.material_fields loop
      if field <> 'media' and (to_jsonb(new) -> field) is distinct from (to_jsonb(old) -> field) then
        material_changed := true;
        exit;
      end if;
    end loop;

    if material_changed then
      new.status := 'pending_review';
      new.published_at := null;
      new.is_featured := false;
      new.featured_until := null;
      new.submitted_at := now();
    end if;
  end if;

  return new;
end;
$$;

create trigger listings_before_write before insert or update on public.listings
  for each row execute function app.listings_before_write();

-- Record the history row (and media unpublish job) for a material-change transition.
create function app.listings_after_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.is_client_request() and old.status = 'published' and new.status = 'pending_review' then
    perform app.log_listing_status(new.id, 'published', 'pending_review', 'Material details changed by the lister', true);
  end if;
  return null;
end;
$$;

create trigger listings_after_update after update on public.listings
  for each row execute function app.listings_after_update();

-- Media rows: metadata comes from the stored object, never from the client.
create function app.listing_media_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  obj record;
  bucket text;
  settings public.site_settings := app.settings();
begin
  -- SECURITY DEFINER changes current_user, so detect client requests through the JWT role.
  if app.jwt_role() not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.listing_id <> old.listing_id or new.upload_key <> old.upload_key or new.kind <> old.kind
       or new.public_key is distinct from old.public_key or new.mime_type is distinct from old.mime_type
       or new.bytes is distinct from old.bytes then
      raise exception 'Only alt text, order and cover can be changed on a media item' using errcode = '42501';
    end if;
    return new;
  end if;

  bucket := case new.kind when 'image' then 'listing-uploads' else 'listing-documents' end;

  select o.metadata into obj
  from storage.objects o
  where o.bucket_id = bucket and o.name = new.upload_key;

  if not found then
    raise exception 'Upload the file before registering it' using errcode = '23503';
  end if;

  new.mime_type := obj.metadata ->> 'mimetype';
  new.bytes := nullif(obj.metadata ->> 'size', '')::integer;
  new.public_key := null;

  if new.kind = 'image' then
    if not (new.mime_type = any (settings.allowed_image_types)) then
      raise exception 'Unsupported image type %', new.mime_type using errcode = '23514';
    end if;
    if new.bytes > settings.max_image_bytes then
      raise exception 'Image is larger than the allowed size' using errcode = '23514';
    end if;
    if (select count(*) from public.listing_media m where m.listing_id = new.listing_id and m.kind = 'image')
       >= settings.max_images_per_listing then
      raise exception 'This listing already has the maximum number of images' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger listing_media_before_write before insert or update on public.listing_media
  for each row execute function app.listing_media_before_write();

-- Adding or removing photos on a live listing is a material change when configured.
create function app.listing_media_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.listing_id, old.listing_id);
  settings public.site_settings := app.settings();
begin
  if app.jwt_role() = 'authenticated'
     and not app.is_staff()
     and settings.material_change_policy = 'unpublish_until_review'
     and 'media' = any (settings.material_fields) then
    perform app.return_listing_to_review(target, 'Photos or documents changed by the lister');
  end if;
  return null;
end;
$$;

create trigger listing_media_after_change after insert or delete on public.listing_media
  for each row execute function app.listing_media_after_change();
