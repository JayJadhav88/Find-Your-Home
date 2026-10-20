-- Batch 1 · Listings: availability (Available / Under negotiation / Unavailable), a builder
-- directory with one record per builder and many projects, new-launch project fields, PIN
-- code and landmark, coordinates from OpenStreetMap (geocoded by the job worker), and search
-- by builder, construction status, PIN code and distance ("near me").

-- ===========================================================================
-- Listing fields
-- ===========================================================================
alter table public.listings
  add column availability text not null default 'available'
    check (availability in ('available', 'under_negotiation', 'unavailable')),
  add column builder_id uuid,
  add column price_max numeric(14, 2) check (price_max >= 0),
  add column launch_date date,
  add column configurations text[] not null default array[]::text[]
    check (cardinality(configurations) <= 12 and array_to_string(configurations, '') !~ '[<>]'),
  add column registration_verified boolean not null default false,
  add column landmark text check (char_length(landmark) <= 120),
  add column geocoded_at timestamptz,
  add constraint listings_price_range check (price_max is null or price_amount is null or price_max >= price_amount);

create index listings_postal_idx on public.listings (postal_code) where status = 'published';
create index listings_coords_idx on public.listings (public_lat, public_lng) where status = 'published' and public_lat is not null;

alter table public.site_settings
  -- Distance choices offered for "near me" and "near a place" searches (km).
  add column radius_options smallint[] not null default array[2, 5, 10, 25]::smallint[]
    check (cardinality(radius_options) between 1 and 8);

-- ===========================================================================
-- Builder directory
-- ===========================================================================
create table public.builders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null unique,
  description text check (char_length(description) <= 4000),
  website text check (website ~ '^https://' and char_length(website) <= 300),
  logo_url text check (logo_url ~ '^https://' and char_length(logo_url) <= 500),
  contact_email text check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone text check (char_length(contact_phone) <= 32),
  -- The builder's own account, when they list their own projects.
  user_id uuid unique references public.profiles (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One record per builder: names differing only in case or spacing are the same builder.
create unique index builders_name_unique on public.builders (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

create function app.builders_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  if tg_op = 'INSERT' or new.name is distinct from old.name then
    new.slug := app.slugify(new.name);
    if exists (select 1 from public.builders b where b.slug = new.slug and b.id <> new.id) then
      new.slug := new.slug || '-' || substr(replace(new.id::text, '-', ''), 1, 6);
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger builders_before_write before insert or update on public.builders
  for each row execute function app.builders_before_write();

alter table public.listings
  add constraint listings_builder_fk foreign key (builder_id) references public.builders (id) on delete set null;
create index listings_builder_idx on public.listings (builder_id) where builder_id is not null;

-- Existing builder accounts become directory entries, and their projects point to them.
insert into public.builders (name, description, website, user_id)
select bp.company_name, bp.description, bp.website, bp.user_id
from public.builder_profiles bp
on conflict do nothing;

update public.listings l
set builder_id = b.id
from public.builders b
where l.category = 'new_project' and b.user_id = l.owner_id and l.builder_id is null;

-- Builder accounts keep editing their company profile; the directory entry follows it.
create function app.sync_builder_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;
  update public.builders
  set name = new.company_name, description = new.description, website = new.website
  where user_id = new.user_id;
  if not found then
    insert into public.builders (name, description, website, user_id)
    values (new.company_name, new.description, new.website, new.user_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger builder_profiles_sync_directory after insert or update on public.builder_profiles
  for each row execute function app.sync_builder_from_profile();

alter table public.builders enable row level security;
create policy "Active builders are public" on public.builders for select to anon, authenticated
  using (is_active or (select app.is_staff()));
create policy "Moderators manage builders" on public.builders for all to authenticated
  using ((select app.is_staff())) with check ((select app.is_staff()));
revoke all on public.builders from anon;
grant select on public.builders to anon;

-- Merge a duplicate into the record to keep: projects move over, the duplicate is removed.
create function public.admin_merge_builders(p_from uuid, p_into uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  moved integer;
  from_user uuid;
begin
  perform app.require(app.is_staff(), 'Only moderators can merge builders');
  perform app.require_state(p_from <> p_into, 'Choose two different builders');
  perform app.require_state(exists (select 1 from public.builders where id = p_into), 'Builder not found');
  select user_id into from_user from public.builders where id = p_from;
  perform app.require_state(found, 'Builder not found');

  update public.listings set builder_id = p_into where builder_id = p_from;
  get diagnostics moved = row_count;
  delete from public.builders where id = p_from;
  if from_user is not null then
    update public.builders set user_id = coalesce(user_id, from_user) where id = p_into;
  end if;
  perform app.audit('builder.merge', 'builder', p_into::text, jsonb_build_object('merged', p_from), jsonb_build_object('projects_moved', moved));
  return moved;
end;
$$;

-- ===========================================================================
-- Listing rules for the new fields
-- ===========================================================================
-- Runs as the caller (not definer) so is_client_request() can tell clients from workflows.
create function app.listings_project_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  own_builder uuid;
begin
  if new.category <> 'new_project' then
    new.builder_id := null;
  elsif app.is_client_request() and not app.is_staff() then
    -- Builder accounts list their own projects under their own directory entry.
    select id into own_builder from public.builders where user_id = new.owner_id;
    if own_builder is null then
      raise exception 'Only verified builders can list new projects' using errcode = '42501';
    end if;
    new.builder_id := own_builder;
  end if;

  -- Only the team marks a registration (e.g. RERA) number as checked.
  if app.is_client_request() and not app.is_staff() then
    new.registration_verified := case when tg_op = 'UPDATE' then old.registration_verified else false end;
  end if;
  if tg_op = 'UPDATE' and new.project_registration_number is distinct from old.project_registration_number
     and not app.is_staff() then
    new.registration_verified := false;
  end if;

  new.configurations := coalesce(
    (select array_agg(distinct left(btrim(c), 30)) from unnest(new.configurations) c where btrim(c) <> ''),
    array[]::text[]);
  -- Stored without spaces so "411 045" and "411045" are the same PIN code.
  new.postal_code := nullif(upper(regexp_replace(coalesce(new.postal_code, ''), '\s+', '', 'g')), '');
  return new;
end;
$$;

create trigger listings_project_rules before insert or update on public.listings
  for each row execute function app.listings_project_rules();

-- Listers and the team mark a live listing as under negotiation or unavailable.
create function public.set_listing_availability(p_listing_id uuid, p_availability text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings := app.lock_listing(p_listing_id);
begin
  perform app.require(
    app.is_staff() or (app.is_active_user() and (l.owner_id = auth.uid() or (l.agent_id = auth.uid() and app.has_role('agent')))),
    'You can only update your own listings'
  );
  perform app.require_state(p_availability in ('available', 'under_negotiation', 'unavailable'), 'Unknown availability');
  update public.listings set availability = p_availability where id = l.id;
  perform app.audit('listing.availability', 'listing', l.id::text,
    jsonb_build_object('availability', l.availability), jsonb_build_object('availability', p_availability));
end;
$$;

-- ===========================================================================
-- Coordinates (OpenStreetMap geocoding through the job worker)
-- ===========================================================================
alter table public.job_queue drop constraint job_queue_kind_check;
alter table public.job_queue add constraint job_queue_kind_check
  check (kind in ('publish_listing_media', 'unpublish_listing_media', 'import_listing_images',
                  'sync_enquiry_sheet', 'geocode_listing'));

create function app.queue_geocode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.postal_code is distinct from old.postal_code
     or new.landmark is distinct from old.landmark
     or new.city_id is distinct from old.city_id
     or new.locality_id is distinct from old.locality_id then
    if new.city_id is not null or new.postal_code is not null then
      insert into public.job_queue (kind, listing_id) values ('geocode_listing', new.id);
    end if;
  end if;
  return new;
end;
$$;

create trigger listings_queue_geocode after insert or update on public.listings
  for each row execute function app.queue_geocode();

-- What the worker searches for, without the street address.
create function public.worker_listing_place(p_listing_id uuid)
returns table (landmark text, locality text, city text, region text, country_code text, postal_code text, address_visibility public.address_visibility)
language sql
stable
security definer
set search_path = ''
as $$
  select l.landmark, loc.name, city.name, region.name, country.country_code, l.postal_code, l.address_visibility
  from public.listings l
  left join public.locations loc on loc.id = l.locality_id
  left join public.locations city on city.id = l.city_id
  left join public.locations region on region.id = l.region_id
  left join public.locations country on country.id = l.country_id
  where l.id = p_listing_id;
$$;

-- Approximate addresses are stored rounded to about 1 km; exact ones to about 10 m.
create function public.worker_set_listing_coordinates(p_listing_id uuid, p_lat numeric, p_lng numeric)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.listings l
  set public_lat = case when l.address_visibility = 'exact' then round(p_lat, 4) else round(p_lat, 2) end,
      public_lng = case when l.address_visibility = 'exact' then round(p_lng, 4) else round(p_lng, 2) end,
      geocoded_at = now()
  where l.id = p_listing_id and p_lat between -90 and 90 and p_lng between -180 and 180;
$$;

-- Search-box geocoding results, so the same place is looked up once.
create table app.geocode_cache (
  query text primary key,
  lat numeric(9, 6),
  lng numeric(9, 6),
  label text,
  created_at timestamptz not null default now()
);
revoke all on app.geocode_cache from anon, authenticated;

create function public.geocode_cache_get(p_query text)
returns table (lat numeric, lng numeric, label text, found boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.lat, c.lng, c.label, true from app.geocode_cache c
  where c.query = lower(btrim(p_query)) and c.created_at > now() - interval '90 days';
$$;

create function public.geocode_cache_put(p_query text, p_lat numeric, p_lng numeric, p_label text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into app.geocode_cache (query, lat, lng, label) values (lower(btrim(p_query)), p_lat, p_lng, left(p_label, 200))
  on conflict (query) do update set lat = excluded.lat, lng = excluded.lng, label = excluded.label, created_at = now();
$$;

revoke execute on function
  public.worker_listing_place(uuid), public.worker_set_listing_coordinates(uuid, numeric, numeric),
  public.geocode_cache_get(text), public.geocode_cache_put(text, numeric, numeric, text)
  from public, anon, authenticated;
grant execute on function
  public.worker_listing_place(uuid), public.worker_set_listing_coordinates(uuid, numeric, numeric),
  public.geocode_cache_get(text), public.geocode_cache_put(text, numeric, numeric, text)
  to service_role;

create function app.distance_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select (6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )))::numeric;
$$;

-- ===========================================================================
-- Search
-- ===========================================================================
drop function public.search_listings(
  text, public.listing_purpose, public.listing_category, uuid[], uuid, char, numeric, numeric, smallint, smallint,
  numeric, numeric, public.area_unit, uuid[], public.furnishing, boolean, integer, text, text, integer
);

create function public.search_listings(
  p_q text default null,
  p_purpose public.listing_purpose default null,
  p_category public.listing_category default null,
  p_property_type_ids uuid[] default null,
  p_location_id uuid default null,
  p_currency char(3) default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_min_bedrooms smallint default null,
  p_min_bathrooms smallint default null,
  p_min_area numeric default null,
  p_max_area numeric default null,
  p_area_unit public.area_unit default null,
  p_amenity_ids uuid[] default null,
  p_furnishing public.furnishing default null,
  p_featured_only boolean default false,
  p_listed_within_days integer default null,
  p_sort text default 'newest',
  p_cursor text default null,
  p_limit integer default 24,
  p_builder_id uuid default null,
  p_construction public.possession_status default null,
  p_postal_code text default null,
  p_near_lat numeric default null,
  p_near_lng numeric default null,
  p_radius_km numeric default null
)
returns table (
  id uuid,
  reference_code text,
  slug text,
  title text,
  purpose public.listing_purpose,
  category public.listing_category,
  project_name text,
  property_type_name text,
  price_amount numeric,
  currency char(3),
  price_period public.price_period,
  price_display public.price_display,
  price_negotiable boolean,
  bedrooms smallint,
  bathrooms smallint,
  area_value numeric,
  area_unit public.area_unit,
  city_name text,
  locality_name text,
  cover_key text,
  cover_alt text,
  is_featured boolean,
  first_published_at timestamptz,
  cursor text,
  availability text,
  builder_name text,
  builder_slug text,
  price_max numeric,
  construction public.possession_status,
  distance_km numeric
)
language plpgsql
stable
set search_path = ''
as $$
declare
  query pg_catalog.tsquery := case when nullif(btrim(p_q), '') is not null
    then pg_catalog.websearch_to_tsquery('simple', p_q) end;
  near boolean := p_near_lat is not null and p_near_lng is not null;
  radius numeric := least(greatest(coalesce(p_radius_km, 10), 0.5), 100);
  sort text := case when p_sort in ('newest', 'price_asc', 'price_desc', 'relevance', 'distance') then p_sort else 'newest' end;
  postal text := nullif(upper(regexp_replace(coalesce(p_postal_code, ''), '\s+', '', 'g')), '');
  cursor_key numeric;
  cursor_id uuid;
  page_size integer := least(greatest(coalesce(p_limit, 24), 1), 48);
begin
  if sort = 'relevance' and query is null then
    sort := 'newest';
  end if;
  if sort = 'distance' and not near then
    sort := 'newest';
  end if;
  if near and (p_near_lat not between -90 and 90 or p_near_lng not between -180 and 180) then
    raise exception 'Invalid location' using errcode = '22023';
  end if;

  if p_cursor is not null then
    begin
      cursor_key := split_part(p_cursor, '|', 1)::numeric;
      cursor_id := split_part(p_cursor, '|', 2)::uuid;
    exception when others then
      raise exception 'Invalid cursor' using errcode = '22023';
    end;
  end if;

  if (p_min_price is not null or p_max_price is not null) and p_currency is null then
    raise exception 'A currency is required when filtering by price' using errcode = '22023';
  end if;
  if (p_min_area is not null or p_max_area is not null) and p_area_unit is null then
    raise exception 'An area unit is required when filtering by area' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select l.*,
           case when near and l.public_lat is not null
                then round(app.distance_km(p_near_lat, p_near_lng, l.public_lat, l.public_lng), 2) end as dist
    from public.listings l
    where l.status = 'published'
      and l.availability <> 'unavailable'
      and (query is null or l.search_vector @@ query)
      and (p_purpose is null or l.purpose = p_purpose)
      and (p_category is null or l.category = p_category)
      and (p_property_type_ids is null or l.property_type_id = any (p_property_type_ids))
      and (p_location_id is null or p_location_id in (l.country_id, l.region_id, l.city_id, l.locality_id))
      and (p_currency is null or l.currency = p_currency)
      and (p_min_price is null or (l.price_display = 'show' and coalesce(l.price_max, l.price_amount) >= p_min_price))
      and (p_max_price is null or (l.price_display = 'show' and l.price_amount <= p_max_price))
      and (p_min_bedrooms is null or l.bedrooms >= p_min_bedrooms)
      and (p_min_bathrooms is null or l.bathrooms >= p_min_bathrooms)
      and (p_area_unit is null or l.area_unit = p_area_unit)
      and (p_min_area is null or l.area_value >= p_min_area)
      and (p_max_area is null or l.area_value <= p_max_area)
      and (p_furnishing is null or l.furnishing = p_furnishing)
      and (not coalesce(p_featured_only, false) or l.is_featured)
      and (p_listed_within_days is null or l.first_published_at >= now() - make_interval(days => p_listed_within_days))
      and (p_builder_id is null or l.builder_id = p_builder_id)
      and (p_construction is null or l.possession_status = p_construction)
      and (postal is null or upper(replace(l.postal_code, ' ', '')) = postal)
      and (
        p_amenity_ids is null
        or (select count(distinct la.amenity_id) from public.listing_amenities la
            where la.listing_id = l.id and la.amenity_id = any (p_amenity_ids)) = cardinality(p_amenity_ids)
      )
  ),
  matches as (
    select c.*,
      case sort
        when 'newest' then extract(epoch from c.published_at)::numeric
        -- "Price on request" sorts last in both directions.
        when 'price_asc' then case when c.price_display = 'show' then c.price_amount else 1e15 end
        when 'price_desc' then case when c.price_display = 'show' then c.price_amount else -1 end
        when 'relevance' then round(pg_catalog.ts_rank(c.search_vector, query)::numeric, 6)
        -- Nearest first: negate so the shared "descending" ordering works.
        when 'distance' then -c.dist
      end as sort_key
    from candidates c
    where not near or (c.dist is not null and c.dist <= radius)
  )
  select
    m.id, m.reference_code, m.slug, m.title, m.purpose, m.category, m.project_name,
    pt.name,
    m.price_amount, m.currency, m.price_period, m.price_display, m.price_negotiable,
    m.bedrooms, m.bathrooms, m.area_value, m.area_unit,
    city.name, locality.name,
    cover.public_key, cover.alt_text,
    m.is_featured, m.first_published_at,
    m.sort_key::text || '|' || m.id::text,
    m.availability, b.name, b.slug, m.price_max, m.possession_status, m.dist
  from matches m
  left join public.property_types pt on pt.id = m.property_type_id
  left join public.locations city on city.id = m.city_id
  left join public.locations locality on locality.id = m.locality_id
  left join public.builders b on b.id = m.builder_id
  left join lateral (
    select lm.public_key, lm.alt_text
    from public.listing_media lm
    where lm.listing_id = m.id and lm.kind = 'image' and lm.public_key is not null
    order by lm.is_cover desc, lm.sort_order
    limit 1
  ) cover on true
  where p_cursor is null
     or (sort = 'price_asc' and (m.sort_key, m.id) > (cursor_key, cursor_id))
     or (sort <> 'price_asc' and (m.sort_key, m.id) < (cursor_key, cursor_id))
  order by
    case when sort = 'price_asc' then m.sort_key end asc,
    case when sort <> 'price_asc' then m.sort_key end desc,
    case when sort = 'price_asc' then m.id end asc,
    case when sort <> 'price_asc' then m.id end desc
  limit page_size + 1;
end;
$$;

grant execute on function public.search_listings to anon, authenticated;

revoke execute on function public.admin_merge_builders(uuid, uuid), public.set_listing_availability(uuid, text) from public, anon;

-- The team files a project under a builder and confirms its registration number.
create function public.admin_set_listing_project(p_listing_id uuid, p_builder_id uuid, p_registration_verified boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings := app.lock_listing(p_listing_id);
begin
  perform app.require(app.is_staff(), 'Only moderators can do that');
  perform app.require_state(l.category = 'new_project', 'Only new projects have a builder');
  perform app.require_state(p_builder_id is null or exists (select 1 from public.builders where id = p_builder_id), 'Builder not found');
  update public.listings
  set builder_id = p_builder_id, registration_verified = coalesce(p_registration_verified, false)
  where id = l.id;
  perform app.audit('listing.project', 'listing', l.id::text,
    jsonb_build_object('builder_id', l.builder_id, 'registration_verified', l.registration_verified),
    jsonb_build_object('builder_id', p_builder_id, 'registration_verified', p_registration_verified));
end;
$$;

revoke execute on function public.admin_set_listing_project(uuid, uuid, boolean) from public, anon;
