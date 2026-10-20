-- Rate limit for the public location lookup (30 lookups per visitor per hour; cached places
-- don't count), and saved searches that include the new builder, construction, PIN code and
-- distance filters.

create function public.geocode_rate_limit(p_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  select app.check_rate_limit('geocode:' || left(coalesce(p_key, 'unknown'), 100), 30, interval '1 hour');
$$;

revoke execute on function public.geocode_rate_limit(text) from public, anon, authenticated;
grant execute on function public.geocode_rate_limit(text) to service_role;

create or replace function app.saved_search_new_matches(s public.saved_searches)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.search_listings(
    p_q => s.filters ->> 'p_q',
    p_purpose => (s.filters ->> 'p_purpose')::public.listing_purpose,
    p_category => (s.filters ->> 'p_category')::public.listing_category,
    p_property_type_ids => (select array_agg(value::uuid) from jsonb_array_elements_text(s.filters -> 'p_property_type_ids')),
    p_location_id => (s.filters ->> 'p_location_id')::uuid,
    p_currency => (s.filters ->> 'p_currency')::char(3),
    p_min_price => (s.filters ->> 'p_min_price')::numeric,
    p_max_price => (s.filters ->> 'p_max_price')::numeric,
    p_min_bedrooms => (s.filters ->> 'p_min_bedrooms')::smallint,
    p_min_bathrooms => (s.filters ->> 'p_min_bathrooms')::smallint,
    p_min_area => (s.filters ->> 'p_min_area')::numeric,
    p_max_area => (s.filters ->> 'p_max_area')::numeric,
    p_area_unit => (s.filters ->> 'p_area_unit')::public.area_unit,
    p_amenity_ids => (select array_agg(value::uuid) from jsonb_array_elements_text(s.filters -> 'p_amenity_ids')),
    p_furnishing => (s.filters ->> 'p_furnishing')::public.furnishing,
    p_sort => 'newest',
    p_limit => 50,
    p_builder_id => (s.filters ->> 'p_builder_id')::uuid,
    p_construction => (s.filters ->> 'p_construction')::public.possession_status,
    p_postal_code => s.filters ->> 'p_postal_code',
    p_near_lat => (s.filters ->> 'p_near_lat')::numeric,
    p_near_lng => (s.filters ->> 'p_near_lng')::numeric,
    p_radius_km => (s.filters ->> 'p_radius_km')::numeric
  ) r
  join public.listings l on l.id = r.id
  where l.published_at > s.last_checked_at and l.owner_id <> s.user_id;
$$;
