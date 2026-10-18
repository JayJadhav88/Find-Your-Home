-- Bulk import of listings from a spreadsheet (admin panel). The web app parses and
-- validates the file and resolves names to ids; this function inserts the rows. Image links
-- are downloaded by the process-jobs worker, which then finalises each listing.

alter table public.job_queue add column payload jsonb not null default '{}'::jsonb;
alter table public.job_queue drop constraint job_queue_kind_check;
alter table public.job_queue add constraint job_queue_kind_check
  check (kind in ('publish_listing_media', 'unpublish_listing_media', 'import_listing_images'));

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete set null,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  file_name text check (char_length(file_name) <= 200),
  publish_requested boolean not null,
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.import_batches enable row level security;
create policy "Administrators read import batches" on public.import_batches for select to authenticated
  using ((select app.is_admin()));

alter table public.listings add column import_batch_id uuid references public.import_batches (id) on delete set null;
create index listings_import_batch_idx on public.listings (import_batch_id) where import_batch_id is not null;

-- After an import (and its images), publish when requested and complete; otherwise send to review.
create function app.finalize_import(p_listing_id uuid, p_publish boolean)
returns public.listing_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings;
  missing text[];
begin
  select * into l from public.listings where id = p_listing_id for update;
  if not found or l.status <> 'draft' then
    return l.status;
  end if;

  missing := app.listing_missing_fields(l);
  if p_publish and cardinality(missing) = 0 then
    update public.listings
    set status = 'published', submitted_at = now(), published_at = now(),
        first_published_at = coalesce(first_published_at, now()), reviewed_by = auth.uid(), reviewed_at = now()
    where id = l.id;
    perform app.log_listing_status(l.id, 'draft', 'published', 'Imported from a spreadsheet', true);
    return 'published';
  end if;

  update public.listings set status = 'pending_review', submitted_at = now() where id = l.id;
  perform app.log_listing_status(
    l.id, 'draft', 'pending_review',
    case when p_publish then 'Imported; needs review before publishing. Missing: ' || array_to_string(missing, ', ')
         else 'Imported from a spreadsheet' end,
    false
  );
  return 'pending_review';
end;
$$;

revoke execute on function app.finalize_import(uuid, boolean) from public, anon, authenticated;

create function public.worker_finalize_import(p_listing_id uuid, p_publish boolean)
returns public.listing_status
language sql
security definer
set search_path = ''
as $$
  select app.finalize_import(p_listing_id, p_publish);
$$;

revoke execute on function public.worker_finalize_import(uuid, boolean) from public, anon, authenticated;
grant execute on function public.worker_finalize_import(uuid, boolean) to service_role;

create function public.admin_import_listings(
  p_owner_id uuid,
  p_publish boolean,
  p_file_name text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch_id uuid;
  item jsonb;
  r public.listings;
  new_id uuid;
  new_reference text;
  final_status public.listing_status;
  image_urls jsonb;
  results jsonb := '[]'::jsonb;
  imported integer := 0;
  owner_is_builder boolean;
begin
  perform app.require(app.is_admin(), 'Only administrators can import listings');
  perform app.require_state(jsonb_typeof(p_rows) = 'array', 'Rows must be a list');
  perform app.require_state(jsonb_array_length(p_rows) between 1 and 1000, 'Import between 1 and 1000 rows at a time');
  perform app.require_state(
    exists (select 1 from public.profiles where id = p_owner_id and status = 'active'),
    'The chosen owner account is not active'
  );
  owner_is_builder := exists (select 1 from public.user_roles where user_id = p_owner_id and role = 'builder');

  insert into public.import_batches (created_by, owner_id, file_name, publish_requested, total_rows)
  values (auth.uid(), p_owner_id, p_file_name, p_publish, jsonb_array_length(p_rows))
  returning id into batch_id;

  for item in select value from jsonb_array_elements(p_rows) loop
    begin
      r := jsonb_populate_record(null::public.listings, item);
      if r.category = 'new_project' and not owner_is_builder then
        raise exception 'New projects must belong to a builder account' using errcode = '42501';
      end if;

      insert into public.listings (
        owner_id, import_batch_id, title, slug, description, category, purpose, property_type_id,
        price_amount, currency, price_period, price_negotiable, price_display,
        country_id, region_id, city_id, locality_id, postal_code, address_visibility,
        area_unit, area_value, built_up_area, carpet_area, plot_area,
        bedrooms, bathrooms, balconies, parking_spaces, floor_number, total_floors, year_built,
        furnishing, possession_status, available_from, virtual_tour_url,
        project_name, project_registration_number,
        contact_via_form, show_phone, show_whatsapp, show_email
      ) values (
        p_owner_id, batch_id, r.title, 'import', coalesce(r.description, ''), coalesce(r.category, 'resale'),
        case coalesce(r.category, 'resale') when 'rental' then 'rent'::public.listing_purpose else 'sale' end,
        r.property_type_id,
        r.price_amount, r.currency, coalesce(r.price_period, 'total'), coalesce(r.price_negotiable, false),
        coalesce(r.price_display, 'show'),
        r.country_id, r.region_id, r.city_id, r.locality_id, r.postal_code, coalesce(r.address_visibility, 'approximate'),
        r.area_unit, r.area_value, r.built_up_area, r.carpet_area, r.plot_area,
        r.bedrooms, r.bathrooms, r.balconies, r.parking_spaces, r.floor_number, r.total_floors, r.year_built,
        r.furnishing, r.possession_status, r.available_from, r.virtual_tour_url,
        r.project_name, r.project_registration_number,
        coalesce(r.contact_via_form, true), coalesce(r.show_phone, false), coalesce(r.show_whatsapp, false),
        coalesce(r.show_email, false)
      )
      returning id, reference_code into new_id, new_reference;

      if nullif(btrim(item ->> 'street_address'), '') is not null then
        insert into public.listing_private_details (listing_id, street_address)
        values (new_id, btrim(item ->> 'street_address'));
      end if;

      insert into public.listing_amenities (listing_id, amenity_id)
      select new_id, value::uuid from jsonb_array_elements_text(coalesce(item -> 'amenity_ids', '[]'::jsonb))
      on conflict do nothing;

      insert into public.listing_videos (listing_id, provider, video_id, instagram_kind, sort_order)
      select new_id, (v ->> 'provider')::public.video_provider, v ->> 'video_id', v ->> 'instagram_kind', ordinality::integer
      from jsonb_array_elements(coalesce(item -> 'videos', '[]'::jsonb)) with ordinality as t (v, ordinality);

      image_urls := coalesce(item -> 'image_urls', '[]'::jsonb);
      if jsonb_array_length(image_urls) > 0 then
        insert into public.job_queue (kind, listing_id, payload)
        values ('import_listing_images', new_id, jsonb_build_object('urls', image_urls, 'publish', p_publish));
        final_status := 'draft';
      else
        final_status := app.finalize_import(new_id, p_publish);
      end if;

      imported := imported + 1;
      results := results || jsonb_build_object(
        'row', item -> 'row_number', 'ok', true, 'listing_id', new_id, 'reference_code', new_reference,
        'status', final_status, 'images_pending', jsonb_array_length(image_urls)
      );
    exception when others then
      results := results || jsonb_build_object('row', item -> 'row_number', 'ok', false, 'error', sqlerrm);
    end;
  end loop;

  update public.import_batches set imported_rows = imported where id = batch_id;
  perform app.audit('import.listings', 'import_batch', batch_id::text, null,
    jsonb_build_object('file', p_file_name, 'rows', jsonb_array_length(p_rows), 'imported', imported,
                       'owner_id', p_owner_id, 'publish', p_publish));

  return jsonb_build_object('batch_id', batch_id, 'imported', imported, 'results', results);
end;
$$;

revoke execute on function public.admin_import_listings(uuid, boolean, text, jsonb) from public, anon;
