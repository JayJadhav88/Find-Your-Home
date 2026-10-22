-- Super admins permanently delete a property. Its leads are kept (unlinked, with the
-- property's reference noted on each lead), and its photo files are removed by the
-- process-jobs worker, because storage files cannot be deleted from SQL.

alter table public.job_queue drop constraint job_queue_kind_check;
alter table public.job_queue add constraint job_queue_kind_check check (kind in (
  'publish_listing_media', 'unpublish_listing_media', 'import_listing_images', 'sync_enquiry_sheet', 'geocode_listing',
  'delete_listing_files'
));

-- Leads outlive the property they were about.
alter table public.enquiries drop constraint enquiries_listing_id_fkey;
alter table public.enquiries add constraint enquiries_listing_id_fkey
  foreign key (listing_id) references public.listings (id) on delete set null;

create function public.admin_delete_listing(p_listing_id uuid, p_confirm_reference text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings;
  files jsonb;
begin
  perform app.require(app.is_admin(), 'Only super admins can delete properties');
  select * into l from public.listings where id = p_listing_id for update;
  perform app.require_state(l.id is not null, 'This property no longer exists');
  -- The person types the reference code to confirm, so a stray click cannot delete.
  perform app.require_state(upper(btrim(coalesce(p_confirm_reference, ''))) = l.reference_code,
    'Type the property''s reference code to confirm');

  update public.enquiries
  set property_reference = coalesce(property_reference, l.reference_code)
  where listing_id = l.id;

  select jsonb_build_object(
    'private', coalesce(jsonb_agg(m.upload_key) filter (where m.upload_key is not null), '[]'::jsonb),
    'public', coalesce(jsonb_agg(m.public_key) filter (where m.public_key is not null), '[]'::jsonb)
  ) into files
  from public.listing_media m where m.listing_id = l.id;

  perform app.audit('listing.delete', 'listing', l.id::text,
    jsonb_build_object('reference', l.reference_code, 'title', l.title, 'status', l.status, 'owner_id', l.owner_id), null);

  delete from public.listings where id = l.id;

  if jsonb_array_length(files -> 'private') + jsonb_array_length(files -> 'public') > 0 then
    insert into public.job_queue (kind, listing_id, payload) values ('delete_listing_files', l.id, files);
  end if;
end;
$$;

revoke all on function public.admin_delete_listing(uuid, text) from public, anon;
grant execute on function public.admin_delete_listing(uuid, text) to authenticated;

-- Changes a team member makes to someone else's property are recorded (which fields, by whom).
create function app.audit_listing_staff_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text[];
begin
  if app.jwt_role() <> 'authenticated' or auth.uid() is null
     or auth.uid() = new.owner_id or auth.uid() is not distinct from new.agent_id then
    return null;
  end if;
  select array_agg(n.key order by n.key) into changed
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o using (key)
  where n.value is distinct from o.value
    -- Workflow and housekeeping columns change through review, renewal and the workers.
    and n.key not in ('updated_at', 'search_vector', 'status', 'submitted_at', 'published_at', 'first_published_at',
                      'reviewed_by', 'reviewed_at', 'archived_at', 'renewed_at', 'expiry_reminded_at', 'expired_at',
                      'geocoded_at', 'public_lat', 'public_lng', 'slug');
  if changed is not null then
    perform app.audit('listing.staff_edit', 'listing', new.id::text,
      jsonb_build_object('reference', old.reference_code), jsonb_build_object('fields', to_jsonb(changed)));
  end if;
  return null;
end;
$$;

create trigger listings_staff_edit_audit after update on public.listings
  for each row execute function app.audit_listing_staff_edit();
