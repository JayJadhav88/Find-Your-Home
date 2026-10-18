-- Listing categories (rental / resale / new project), verified builders, project details
-- and YouTube / Instagram videos.

-- ---------------------------------------------------------------------------
-- Category on listings. `purpose` (sale/rent) stays for existing filters and is kept in
-- sync: rental -> rent, resale and new_project -> sale.
-- ---------------------------------------------------------------------------
alter table public.listings
  add column category public.listing_category,
  add column project_name text check (char_length(btrim(project_name)) between 1 and 140),
  add column project_registration_number text check (char_length(project_registration_number) <= 60);

update public.listings set category = case purpose when 'rent' then 'rental'::public.listing_category else 'resale' end;
alter table public.listings alter column category set not null;
alter table public.listings
  add constraint listings_category_matches_purpose check ((category = 'rental') = (purpose = 'rent'));

create index listings_category_idx on public.listings (status, category, published_at desc, id);

create function app.listings_sync_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Older clients send only `purpose`; derive the category from it.
  if new.category is null or (tg_op = 'UPDATE' and new.purpose is distinct from old.purpose and new.category = old.category) then
    new.category := case new.purpose when 'rent' then 'rental'::public.listing_category else 'resale' end;
  end if;
  new.purpose := case new.category when 'rental' then 'rent'::public.listing_purpose else 'sale' end;

  -- Only verified builders (or administrators) may list new projects.
  if new.category = 'new_project'
     and (tg_op = 'INSERT' or old.category is distinct from 'new_project')
     and app.is_client_request()
     and not (app.has_role('builder') or app.is_admin()) then
    raise exception 'Only verified builders can list new projects' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger listings_category_sync before insert or update on public.listings
  for each row execute function app.listings_sync_category();

-- A change of category is a material change for live listings.
update public.site_settings
set material_fields = array_append(material_fields, 'category')
where not ('category' = any (material_fields));
alter table public.site_settings alter column material_fields set default array[
  'category', 'purpose', 'property_type_id', 'price_amount', 'currency', 'price_period',
  'country_id', 'region_id', 'city_id', 'locality_id',
  'area_value', 'area_unit', 'bedrooms', 'bathrooms', 'media'
];

-- Builders can create listings.
drop policy "Verified owners and agents create listings" on public.listings;
create policy "Verified owners, agents and builders create listings"
  on public.listings for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select app.is_active_user())
    and (select app.is_email_verified())
    and ((select app.has_role('owner')) or (select app.has_role('agent')) or (select app.has_role('builder'))
         or (select app.is_admin()))
  );

-- ---------------------------------------------------------------------------
-- Builder profiles (public company details shown on new-project listings)
-- ---------------------------------------------------------------------------
create table public.builder_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  company_name text not null check (char_length(btrim(company_name)) between 1 and 120),
  registration_number text check (char_length(registration_number) <= 60),
  website text check (website ~ '^https://' and char_length(website) <= 300),
  description text check (char_length(description) <= 2000),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger builder_profiles_updated_at before update on public.builder_profiles
  for each row execute function app.set_updated_at();

alter table public.builder_profiles enable row level security;

create policy "Public builder profiles are visible to everyone"
  on public.builder_profiles for select to anon, authenticated
  using (
    (is_public and exists (select 1 from public.user_roles ur where ur.user_id = builder_profiles.user_id and ur.role = 'builder'))
    or user_id = (select auth.uid())
    or (select app.is_staff())
  );
create policy "Builders edit their own profile"
  on public.builder_profiles for update to authenticated
  using (user_id = (select auth.uid()) and (select app.has_role('builder')))
  with check (user_id = (select auth.uid()) and (select app.has_role('builder')));
create policy "Administrators manage builder profiles"
  on public.builder_profiles for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

create trigger builder_profiles_audit after insert or update or delete on public.builder_profiles
  for each row execute function app.audit_admin_change();

-- Granting the builder role creates the profile (company name defaults to the display name).
create or replace function public.admin_set_role(p_user_id uuid, p_role public.app_role, p_granted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require(app.is_admin(), 'Only administrators can change roles');
  perform app.require_state(exists (select 1 from public.profiles where id = p_user_id), 'User not found');

  if p_granted then
    perform app.require_state(
      p_role not in ('moderator', 'administrator', 'builder')
        or exists (select 1 from auth.users where id = p_user_id and email_confirmed_at is not null),
      'Staff and builder roles require a verified email address'
    );
    insert into public.user_roles (user_id, role, granted_by)
    values (p_user_id, p_role, auth.uid())
    on conflict do nothing;

    if p_role = 'agent' then
      insert into public.agent_profiles (user_id) values (p_user_id) on conflict do nothing;
    elsif p_role = 'builder' then
      insert into public.builder_profiles (user_id, company_name)
      select p.id, p.display_name from public.profiles p where p.id = p_user_id
      on conflict do nothing;
    end if;
  else
    perform app.require_state(
      not (p_role = 'administrator' and p_user_id = auth.uid()),
      'You cannot remove your own administrator role'
    );
    perform app.require_state(p_role <> 'buyer', 'The buyer role cannot be removed');
    delete from public.user_roles where user_id = p_user_id and role = p_role;
  end if;

  perform app.audit(
    case when p_granted then 'role.grant' else 'role.revoke' end,
    'user', p_user_id::text, null, jsonb_build_object('role', p_role)
  );
end;
$$;

-- New projects need a project name and a builder owner before they can be submitted.
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
           and not exists (select 1 from public.user_roles ur where ur.user_id = l.owner_id and ur.role = 'builder')
         then 'verified builder account' end
  ], null);
$$;

-- ---------------------------------------------------------------------------
-- Videos (YouTube / Instagram). Only the provider's video id is stored, never HTML.
-- ---------------------------------------------------------------------------
create table public.listing_videos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  provider public.video_provider not null,
  video_id text not null,
  -- Instagram post type in the URL: p (post), reel, tv.
  instagram_kind text check (instagram_kind in ('p', 'reel', 'tv')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint listing_videos_valid_id check (
    (provider = 'youtube' and video_id ~ '^[A-Za-z0-9_-]{11}$' and instagram_kind is null)
    or (provider = 'instagram' and video_id ~ '^[A-Za-z0-9_-]{5,64}$' and instagram_kind is not null)
  ),
  constraint listing_videos_unique unique (listing_id, provider, video_id)
);

create index listing_videos_listing_idx on public.listing_videos (listing_id, sort_order);

create function app.enforce_video_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.listing_videos where listing_id = new.listing_id) >= 10 then
    raise exception 'A listing can have up to 10 videos' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger listing_videos_limit before insert on public.listing_videos
  for each row execute function app.enforce_video_limit();

alter table public.listing_videos enable row level security;

create policy "Videos of public listings are public; listers and staff see all"
  on public.listing_videos for select to anon, authenticated
  using ((select app.is_listing_public(listing_id)) or (select app.can_manage_listing(listing_id)));
create policy "Listers add videos while editable"
  on public.listing_videos for insert to authenticated
  with check ((select app.can_edit_listing(listing_id)));
create policy "Listers update videos while editable"
  on public.listing_videos for update to authenticated
  using ((select app.can_edit_listing(listing_id))) with check ((select app.can_edit_listing(listing_id)));
create policy "Listers remove videos while editable"
  on public.listing_videos for delete to authenticated
  using ((select app.can_edit_listing(listing_id)));

-- Keep any single video_url that is a YouTube link.
insert into public.listing_videos (listing_id, provider, video_id)
select id, 'youtube', substring(video_url from '(?:v=|youtu\.be/|shorts/|embed/)([A-Za-z0-9_-]{11})')
from public.listings
where video_url ~ '(youtube\.com|youtu\.be)'
  and substring(video_url from '(?:v=|youtu\.be/|shorts/|embed/)([A-Za-z0-9_-]{11})') is not null
on conflict do nothing;
