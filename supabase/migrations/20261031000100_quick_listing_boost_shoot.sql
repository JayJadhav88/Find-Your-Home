-- "List your property" in a few minutes (like NoBroker / 99acres owner flows):
-- * Boost: owners pay online (Razorpay) to feature a property for a number of days. Plans and
--   prices are set in Admin. A boost bought before approval starts when the property goes live.
-- * Professional shoot: owners ask for a photo/video shoot; the team confirms a time.
-- * Video files: up to 3 short walkthrough videos uploaded directly (besides YouTube links).

-- ---------------------------------------------------------------------------
-- Boost plans (Admin → Boosts)
-- ---------------------------------------------------------------------------
create table public.boost_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  description text check (description is null or char_length(description) <= 200),
  days int not null check (days between 1 and 365),
  -- Price in paise (₹1 = 100 paise), as Razorpay expects.
  price_paise int not null check (price_paise between 100 and 100000000),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.boost_plans enable row level security;
create policy "Active plans are public; admins see all" on public.boost_plans for select to anon, authenticated
  using (is_active or (select app.is_admin()));
create policy "Admins manage plans" on public.boost_plans for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));
grant select on public.boost_plans to anon, authenticated;
grant insert, update, delete on public.boost_plans to authenticated;

insert into public.boost_plans (name, description, days, price_paise, sort_order) values
  ('Boost 7 days', 'Top of search results and a Featured badge for a week.', 7, 49900, 1),
  ('Boost 30 days', 'Featured for a month: the best value for most owners.', 30, 149900, 2);

-- ---------------------------------------------------------------------------
-- Boost purchases. Written only by the payment Edge Functions (service role).
-- ---------------------------------------------------------------------------
create table public.listing_boosts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  plan_id uuid references public.boost_plans (id) on delete set null,
  buyer_id uuid references public.profiles (id) on delete set null,
  plan_name text not null,
  days int not null check (days between 1 and 365),
  amount_paise int not null check (amount_paise > 0),
  currency text not null default 'INR',
  status text not null default 'created' check (status in ('created', 'paid', 'active', 'expired', 'failed', 'refunded')),
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  paid_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create index listing_boosts_listing_idx on public.listing_boosts (listing_id, status);
alter table public.listing_boosts enable row level security;
create policy "Buyers see their boosts; staff see all" on public.listing_boosts for select to authenticated
  using (buyer_id = (select auth.uid()) or (select app.is_staff()) or (select app.can_manage_listing(listing_id)));
grant select on public.listing_boosts to authenticated;

-- Start every paid boost of a live property. Boosts run one after another.
create function app.start_paid_boosts(p_listing_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  b record;
  starts timestamptz;
  ends timestamptz;
  current_end timestamptz;
begin
  select greatest(now(), coalesce(max(ends_at), now())) into current_end
  from public.listing_boosts where listing_id = p_listing_id and status = 'active';
  for b in select * from public.listing_boosts where listing_id = p_listing_id and status = 'paid' order by paid_at loop
    starts := current_end;
    ends := starts + make_interval(days => b.days);
    update public.listing_boosts set status = 'active', starts_at = starts, ends_at = ends where id = b.id;
    current_end := ends;
  end loop;
  return case when exists (select 1 from public.listing_boosts where listing_id = p_listing_id and status = 'active') then current_end end;
end;
$$;
revoke all on function app.start_paid_boosts(uuid) from public, anon, authenticated;

-- When a property goes live, paid boosts start and it becomes featured.
create function app.boost_on_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  boost_end timestamptz;
begin
  if new.status = 'published' and old.status is distinct from 'published'
     and exists (select 1 from public.listing_boosts where listing_id = new.id and status in ('paid', 'active')) then
    boost_end := app.start_paid_boosts(new.id);
    if boost_end is not null and boost_end > now() then
      new.is_featured := true;
      new.featured_until := greatest(boost_end, coalesce(new.featured_until, boost_end));
    end if;
  end if;
  return new;
end;
$$;
create trigger listings_boost_on_publish before update of status on public.listings
  for each row execute function app.boost_on_publish();

-- Called by the payment function once Razorpay confirms the payment.
create function public.boost_mark_paid(p_order_id text, p_payment_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.listing_boosts;
  l public.listings;
  boost_end timestamptz;
begin
  select * into b from public.listing_boosts where razorpay_order_id = p_order_id for update;
  perform app.require_state(found, 'Unknown payment');
  if b.status = 'created' or b.status = 'failed' then
    update public.listing_boosts set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now() where id = b.id;
  end if;
  select * into l from public.listings where id = b.listing_id;
  if l.status = 'published' then
    boost_end := app.start_paid_boosts(l.id);
    if boost_end is not null then
      update public.listings set is_featured = true, featured_until = greatest(boost_end, coalesce(featured_until, boost_end)) where id = l.id;
    end if;
  end if;
  return jsonb_build_object('live', l.status = 'published', 'featured_until', boost_end);
end;
$$;
revoke all on function public.boost_mark_paid(text, text) from public, anon, authenticated;
grant execute on function public.boost_mark_paid(text, text) to service_role;

-- Featured time runs out: unfeature and close the boost. Run hourly.
create function app.expire_boosts()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.listing_boosts set status = 'expired' where status = 'active' and ends_at < now();
  update public.listings set is_featured = false, featured_until = null
  where is_featured and featured_until is not null and featured_until < now();
$$;
revoke all on function app.expire_boosts() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fyh-expire-boosts', '7 * * * *', 'select app.expire_boosts()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Professional photo / video shoot requests
-- ---------------------------------------------------------------------------
create table public.shoot_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  requester_id uuid references public.profiles (id) on delete set null,
  contact_name text not null,
  contact_phone text not null,
  preferred_date date not null,
  preferred_slot text not null check (preferred_slot in ('morning', 'afternoon', 'evening')),
  notes text check (notes is null or char_length(notes) <= 1000),
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'done', 'cancelled')),
  scheduled_at timestamptz,
  team_note text check (team_note is null or char_length(team_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shoot_requests_status_idx on public.shoot_requests (status, preferred_date);
alter table public.shoot_requests enable row level security;
create policy "Requesters see their shoots; staff see all" on public.shoot_requests for select to authenticated
  using (requester_id = (select auth.uid()) or (select app.is_staff()));
grant select on public.shoot_requests to authenticated;

create function public.request_shoot(p_listing_id uuid, p_date date, p_slot text, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  shoot_id uuid;
begin
  perform app.require(auth.uid() is not null and app.can_manage_listing(p_listing_id), 'You cannot request a shoot for this property');
  select * into p from public.profiles where id = auth.uid();
  perform app.require_state(nullif(btrim(coalesce(p.phone, '')), '') is not null, 'Add your phone number first so our team can call you');
  perform app.require_state(p_slot in ('morning', 'afternoon', 'evening'), 'Choose morning, afternoon or evening');
  perform app.require_state(p_date between current_date and current_date + 90, 'Choose a date in the next 90 days');
  perform app.require_state(
    not exists (select 1 from public.shoot_requests where listing_id = p_listing_id and status in ('requested', 'confirmed')),
    'A shoot is already requested for this property');
  perform app.check_rate_limit('shoot:' || auth.uid()::text, 10, interval '1 day');
  insert into public.shoot_requests (listing_id, requester_id, contact_name, contact_phone, preferred_date, preferred_slot, notes)
  values (p_listing_id, auth.uid(), p.display_name, p.phone, p_date, p_slot, nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into shoot_id;
  return shoot_id;
end;
$$;
revoke all on function public.request_shoot(uuid, date, text, text) from public, anon;
grant execute on function public.request_shoot(uuid, date, text, text) to authenticated;

create function public.admin_update_shoot(p_id uuid, p_status text, p_scheduled_at timestamptz default null, p_team_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require(app.is_staff(), 'Only the team can update shoots');
  perform app.require_state(p_status in ('requested', 'confirmed', 'done', 'cancelled'), 'Unknown status');
  perform app.require_state(p_status <> 'confirmed' or p_scheduled_at is not null, 'Choose the shoot date and time');
  update public.shoot_requests
  set status = p_status, scheduled_at = coalesce(p_scheduled_at, scheduled_at),
      team_note = coalesce(nullif(btrim(coalesce(p_team_note, '')), ''), team_note), updated_at = now()
  where id = p_id;
  perform app.require_state(found, 'Shoot request not found');
end;
$$;
revoke all on function public.admin_update_shoot(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.admin_update_shoot(uuid, text, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Uploaded video files (walkthroughs). Short clips; YouTube for long videos.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-videos', 'listing-videos', true, 52428800, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do nothing;

create policy "Listers and the team upload videos" on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-videos' and (select app.can_edit_listing(((storage.foldername(name))[1])::uuid)));
create policy "Listers and the team remove videos" on storage.objects for delete to authenticated
  using (bucket_id = 'listing-videos' and (select app.can_edit_listing(((storage.foldername(name))[1])::uuid)));

create table public.listing_video_files (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  storage_key text not null unique check (storage_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp4|webm|mov)$'),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint listing_video_files_folder check (split_part(storage_key, '/', 1) = listing_id::text)
);
create index listing_video_files_listing_idx on public.listing_video_files (listing_id, sort_order);

create function app.enforce_video_file_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.listing_video_files where listing_id = new.listing_id) >= 3 then
    raise exception 'A property can have up to 3 uploaded videos' using errcode = '23514';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'listing-videos' and o.name = new.storage_key) then
    raise exception 'Upload the video first' using errcode = 'PT409';
  end if;
  return new;
end;
$$;
create trigger listing_video_files_limit before insert on public.listing_video_files
  for each row execute function app.enforce_video_file_limit();

alter table public.listing_video_files enable row level security;
create policy "Public video files; listers and staff see all"
  on public.listing_video_files for select to anon, authenticated
  using ((select app.is_listing_public(listing_id)) or (select app.can_manage_listing(listing_id)));
create policy "Listers add video files while editable"
  on public.listing_video_files for insert to authenticated
  with check ((select app.can_edit_listing(listing_id)));
create policy "Listers remove video files while editable"
  on public.listing_video_files for delete to authenticated
  using ((select app.can_edit_listing(listing_id)));
grant select on public.listing_video_files to anon, authenticated;
grant insert, delete on public.listing_video_files to authenticated;
