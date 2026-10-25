-- New projects added by the team (e.g. the Excel import) are linked to a builder in the
-- builder directory rather than owned by a builder account. Either now satisfies the
-- "builder" requirement for approval. Same checklist as before otherwise.

create or replace function app.listing_missing_fields(l public.listings)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_remove(array[
    case when char_length(btrim(l.description)) < 30 then 'description (at least 30 characters)' end,
    case when l.property_type_id is null
           or not exists (select 1 from public.property_types t where t.id = l.property_type_id and t.is_active)
         then 'property type' end,
    case when l.price_display = 'show' and l.price_amount is null then 'price' end,
    case when l.price_amount is not null and (
           l.currency is null
           or not exists (select 1 from public.currencies c where c.code = l.currency and c.is_enabled)
         ) then 'currency' end,
    case when l.country_id is null then 'country' end,
    case when l.city_id is null then 'city' end,
    case when l.area_value is null then 'area' end,
    case when not exists (select 1 from public.listing_media m where m.listing_id = l.id and m.is_cover)
         then 'cover photo' end,
    case when l.category = 'new_project' and l.project_name is null then 'project name' end,
    case when l.category = 'new_project'
           and l.builder_id is null
           and not exists (select 1 from public.user_roles ur where ur.user_id = l.owner_id and ur.role = 'builder')
         then 'builder (choose one from the builder directory)' end
  ], null);
$$;
