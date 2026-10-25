-- Excel import: a Builder column (new projects show their real developer from the builder
-- directory, added there if new), plus price range, configurations, launch date and landmark.
-- Same function as before otherwise.

create or replace function public.admin_import_listings(
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
  row_builder uuid;
  builder_name text;
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
      builder_name := nullif(regexp_replace(btrim(coalesce(item ->> 'builder_name', '')), '\s+', ' ', 'g'), '');
      row_builder := null;
      if r.category = 'new_project' and builder_name is not null then
        -- The developer named in the sheet: an existing directory entry, or a new one.
        select id into row_builder from public.builders where lower(name) = lower(builder_name);
        if row_builder is null then
          insert into public.builders (name) values (builder_name) returning id into row_builder;
        end if;
      elsif r.category = 'new_project' and not owner_is_builder then
        raise exception 'New projects need a Builder name or a builder account' using errcode = '42501';
      end if;

      insert into public.listings (
        owner_id, import_batch_id, title, slug, description, category, purpose, property_type_id,
        price_amount, currency, price_period, price_negotiable, price_display,
        country_id, region_id, city_id, locality_id, postal_code, address_visibility,
        area_unit, area_value, built_up_area, carpet_area, plot_area,
        bedrooms, bathrooms, balconies, parking_spaces, floor_number, total_floors, year_built,
        furnishing, possession_status, available_from, virtual_tour_url,
        project_name, project_registration_number,
        builder_id, price_max, configurations, launch_date, landmark,
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
        row_builder, r.price_max, coalesce(r.configurations, array[]::text[]), r.launch_date, r.landmark,
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

