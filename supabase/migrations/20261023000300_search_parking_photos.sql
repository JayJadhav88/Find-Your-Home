-- Two more search filters for the website and the app: at least N car parking spaces, and
-- only homes with photos. Added as optional parameters at the end, so existing callers work.

drop function public.search_listings(
  text, public.listing_purpose, public.listing_category, uuid[], uuid, char, numeric, numeric, smallint, smallint,
  numeric, numeric, public.area_unit, uuid[], public.furnishing, boolean, integer, text, text, integer,
  uuid, public.possession_status, text, numeric, numeric, numeric
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
  p_radius_km numeric default null,
  p_min_parking smallint default null,
  p_with_photos boolean default false
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
      and (p_min_parking is null or l.parking_spaces >= p_min_parking)
      and (not coalesce(p_with_photos, false) or exists (
            select 1 from public.listing_media pm
            where pm.listing_id = l.id and pm.kind = 'image' and pm.public_key is not null))
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
