-- Storage buckets and object policies.
-- Object names are always "<listing_id or user_id>/<random>.<ext>" (never user filenames).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('listing-uploads', 'listing-uploads', false, 10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('listing-public', 'listing-public', true, 10485760,
    array['image/jpeg', 'image/webp']),
  ('listing-documents', 'listing-documents', false, 20971520,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', true, 2097152,
    array['image/jpeg', 'image/png', 'image/webp']);

-- "<uuid>/<uuid>.<ext>" with a lowercase extension.
create function app.is_safe_object_name(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|heic|pdf)$';
$$;

grant execute on function app.is_safe_object_name(text) to anon, authenticated, service_role;

-- Listing photos before publication: owner, assigned agent and staff only.
create policy "Listers and staff read listing uploads"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'listing-uploads'
    and app.can_manage_listing(app.try_uuid((storage.foldername(name))[1]))
  );

create policy "Listers upload listing photos while editable"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listing-uploads'
    and app.is_safe_object_name(name)
    and app.can_edit_listing(app.try_uuid((storage.foldername(name))[1]))
  );

create policy "Listers delete listing photos while editable"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'listing-uploads'
    and app.can_edit_listing(app.try_uuid((storage.foldername(name))[1]))
  );

-- Public copies are written only by the publishing job (service role bypasses RLS).
create policy "Published listing photos are public"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'listing-public');

-- Documents: never public; downloaded through short-lived signed URLs after this check.
create policy "Listers and staff read listing documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'listing-documents'
    and app.can_manage_listing(app.try_uuid((storage.foldername(name))[1]))
  );

create policy "Listers upload listing documents while editable"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listing-documents'
    and app.is_safe_object_name(name)
    and app.can_edit_listing(app.try_uuid((storage.foldername(name))[1]))
  );

create policy "Listers delete listing documents while editable"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'listing-documents'
    and app.can_edit_listing(app.try_uuid((storage.foldername(name))[1]))
  );

-- Avatars: public read, each user writes only inside their own folder.
create policy "Avatars are public"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'avatars');

create policy "Users upload their own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and app.is_safe_object_name(name)
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users delete their own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
