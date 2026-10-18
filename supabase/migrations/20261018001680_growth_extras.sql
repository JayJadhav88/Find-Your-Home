-- Owner-approved extras: saved-search alerts, listing expiry with renewal, "report this
-- listing" with fraud signals for moderators, and view / enquiry insights for owners.

-- ===========================================================================
-- Saved searches and alerts
-- ===========================================================================
create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- search_listings arguments (from searchFiltersToRpcArgs), without paging and sorting.
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object' and pg_column_size(filters) < 4000),
  -- The website query string, to open the search again from an alert.
  query_string text not null default '' check (query_string ~ '^[A-Za-z0-9_=&%.,+~-]*$' and char_length(query_string) <= 1000),
  alerts boolean not null default true,
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index saved_searches_user_idx on public.saved_searches (user_id, created_at desc);
create index saved_searches_due_idx on public.saved_searches (last_checked_at) where alerts;

-- Runs as the caller (not definer) so is_client_request() sees the client; RLS limits the
-- count to the caller's own searches, which is the limit we want.
create function app.limit_saved_searches()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.is_client_request() then
    new.user_id := auth.uid();
    new.last_checked_at := now();
  end if;
  if (select count(*) from public.saved_searches where user_id = new.user_id) >= 20 then
    raise exception 'You can save up to 20 searches. Delete one first.' using errcode = 'PT409';
  end if;
  return new;
end;
$$;

create trigger saved_searches_limit before insert on public.saved_searches
  for each row execute function app.limit_saved_searches();

alter table public.saved_searches enable row level security;
create policy "Users read their saved searches" on public.saved_searches for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users save searches" on public.saved_searches for insert to authenticated
  with check (user_id = (select auth.uid()) and (select app.is_active_user()));
create policy "Users update their saved searches" on public.saved_searches for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users delete their saved searches" on public.saved_searches for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.saved_searches from anon, authenticated;
grant select, delete on public.saved_searches to authenticated;
grant insert (name, filters, query_string, alerts) on public.saved_searches to authenticated;
grant update (name, alerts) on public.saved_searches to authenticated;

-- New homes for one saved search since it was last checked (up to 50).
create function app.saved_search_new_matches(s public.saved_searches)
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
    p_limit => 50
  ) r
  join public.listings l on l.id = r.id
  where l.published_at > s.last_checked_at and l.owner_id <> s.user_id;
$$;

-- Hourly at most per search: tells people about new matches (in app, push, email; quiet hours).
create function public.worker_run_saved_search_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.saved_searches;
  found_count integer;
  alerted integer := 0;
begin
  for s in
    select ss.* from public.saved_searches ss
    join public.notification_preferences pr on pr.user_id = ss.user_id and pr.alerts_enabled
    join public.profiles p on p.id = ss.user_id and p.status = 'active'
    where ss.alerts and ss.last_checked_at < now() - interval '1 hour'
    order by ss.last_checked_at
    limit 500
    for update of ss skip locked
  loop
    begin
      found_count := app.saved_search_new_matches(s);
    exception when others then
      found_count := 0; -- a search that no longer parses (e.g. a deleted city) is skipped
    end;
    update public.saved_searches set last_checked_at = now() where id = s.id;
    if found_count > 0 then
      perform app.deliver_to_user(s.user_id, 'saved_search_match',
        jsonb_build_object('saved_search_id', s.id, 'name', s.name, 'count', found_count,
                           'url', '/search' || case when s.query_string = '' then '' else '?' || s.query_string end),
        array['push', 'email']::public.notification_channel[], true, null, true);
      alerted := alerted + 1;
    end if;
  end loop;
  return alerted;
end;
$$;

-- ===========================================================================
-- Listing expiry and renewal
-- ===========================================================================
alter table public.site_settings
  -- Published listings are hidden after this many days unless renewed (0 = never expire).
  add column listing_expiry_days smallint not null default 90 check (listing_expiry_days between 0 and 730);

alter table public.listings
  add column renewed_at timestamptz,
  add column expiry_reminded_at timestamptz,
  add column expired_at timestamptz;

create function app.listing_expires_at(l public.listings)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (app.settings()).listing_expiry_days = 0 or l.status <> 'published' then null
    else greatest(coalesce(l.renewed_at, l.published_at), l.published_at)
         + make_interval(days => (app.settings()).listing_expiry_days)
  end;
$$;

grant execute on function app.listing_expires_at(public.listings) to anon, authenticated, service_role;

-- Reminds owners 7 days ahead, then hides expired listings (archived, restorable by renewing).
create function public.worker_expire_listings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings;
  reminded integer := 0;
  expired integer := 0;
  ends timestamptz;
begin
  if (app.settings()).listing_expiry_days = 0 then
    return jsonb_build_object('reminded', 0, 'expired', 0);
  end if;

  for l in select * from public.listings where status = 'published' for update skip locked loop
    ends := app.listing_expires_at(l);
    if ends <= now() then
      update public.listings set status = 'archived', archived_at = now(), expired_at = now() where id = l.id;
      perform app.log_listing_status(l.id, 'published', 'archived', 'Expired: not renewed in time');
      perform app.deliver_to_user(l.owner_id, 'listing_expired',
        jsonb_build_object('listing_id', l.id, 'title', l.title, 'reference', l.reference_code));
      expired := expired + 1;
    elsif ends <= now() + interval '7 days'
          and (l.expiry_reminded_at is null or l.expiry_reminded_at < coalesce(l.renewed_at, l.published_at)) then
      update public.listings set expiry_reminded_at = now() where id = l.id;
      perform app.deliver_to_user(l.owner_id, 'listing_expiring',
        jsonb_build_object('listing_id', l.id, 'title', l.title, 'reference', l.reference_code,
                           'expires_on', to_char(ends at time zone (app.settings()).default_timezone, 'YYYY-MM-DD')));
      reminded := reminded + 1;
    end if;
  end loop;
  return jsonb_build_object('reminded', reminded, 'expired', expired);
end;
$$;

-- Keeps a live listing up for another period, or brings back one that expired (no new review:
-- its content has not changed since it was approved).
create function public.renew_listing(p_listing_id uuid)
returns public.listing_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings := app.lock_listing(p_listing_id);
begin
  perform app.require(
    app.is_admin() or (app.is_active_user() and (l.owner_id = auth.uid() or (l.agent_id = auth.uid() and app.has_role('agent')))),
    'You can only renew your own listings'
  );
  if l.status = 'published' then
    update public.listings set renewed_at = now(), expiry_reminded_at = null where id = l.id;
    return 'published';
  end if;
  perform app.require_state(l.status = 'archived' and l.expired_at is not null, 'Only live or expired listings can be renewed');
  update public.listings
  set status = 'published', published_at = now(), renewed_at = now(), expired_at = null, archived_at = null,
      expiry_reminded_at = null
  where id = l.id;
  perform app.log_listing_status(l.id, 'archived', 'published', 'Renewed by the lister');
  return 'published';
end;
$$;

-- ===========================================================================
-- Reports and fraud signals
-- ===========================================================================
create table public.listing_reports (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  reporter_user_id uuid references public.profiles (id) on delete set null,
  reason text not null check (reason in ('fraud', 'wrong_info', 'unavailable', 'duplicate', 'offensive', 'other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  ip_hash text,
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

create index listing_reports_open_idx on public.listing_reports (status, created_at desc);
create index listing_reports_listing_idx on public.listing_reports (listing_id);

alter table public.listing_reports enable row level security;
create policy "Moderators read reports" on public.listing_reports for select to authenticated
  using ((select app.is_staff()));
revoke all on public.listing_reports from anon, authenticated;
grant select on public.listing_reports to authenticated;

create function public.report_listing(p_listing_id uuid, p_reason text, p_details text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings;
  ip text := app.request_ip_hash();
begin
  select * into l from public.listings where id = p_listing_id and status = 'published';
  perform app.require_state(found, 'This listing is not available');
  perform app.check_rate_limit('report:' || coalesce(auth.uid()::text, ip, 'anonymous'), 10, interval '1 day');
  insert into public.listing_reports (listing_id, reporter_user_id, reason, details, ip_hash)
  values (l.id, auth.uid(), p_reason, nullif(btrim(coalesce(p_details, '')), ''), ip);
  perform app.alert_team('listing_reported',
    jsonb_build_object('listing_id', l.id, 'title', l.title, 'reference', l.reference_code, 'reason', p_reason), 'review');
end;
$$;

create function public.admin_handle_report(p_report_id bigint, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require(app.is_staff(), 'Only moderators handle reports');
  perform app.require_state(p_status in ('resolved', 'dismissed', 'open'), 'Unknown report status');
  update public.listing_reports
  set status = p_status, handled_by = auth.uid(), handled_at = case when p_status = 'open' then null else now() end
  where id = p_report_id;
  perform app.require_state(found, 'Report not found');
  perform app.audit('report.' || p_status, 'listing_report', p_report_id::text);
end;
$$;

-- Fingerprint of each published photo (set by the photo worker) to spot reused pictures.
alter table public.listing_media add column content_hash text check (content_hash ~ '^[0-9a-f]{64}$');
create index listing_media_hash_idx on public.listing_media (content_hash) where content_hash is not null;

create function public.worker_set_media_hash(p_media_id uuid, p_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.listing_media set content_hash = p_hash where id = p_media_id;
$$;

-- Warning signs for moderators. Signals, not verdicts: each needs a human look.
create function public.admin_listing_flags(p_listing_id uuid)
returns table (flag text, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.listings;
  phone_digits text;
  n integer;
  median numeric;
  comparables integer;
begin
  perform app.require(app.is_staff(), 'Only moderators can see listing checks');
  select * into l from public.listings where id = p_listing_id;
  if not found then
    return;
  end if;

  select count(distinct other.listing_id) into n
  from public.listing_media mine
  join public.listing_media other on other.content_hash = mine.content_hash and other.listing_id <> mine.listing_id
  join public.listings ol on ol.id = other.listing_id and ol.owner_id <> l.owner_id
  where mine.listing_id = l.id and mine.content_hash is not null;
  if n > 0 then
    flag := 'duplicate_photos'; detail := format('Photos also appear on %s listing(s) by other people', n); return next;
  end if;

  select regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') into phone_digits from public.profiles where id = l.owner_id;
  if length(phone_digits) >= 7 then
    select count(*) into n from public.profiles p
    where p.id <> l.owner_id and right(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'), 10) = right(phone_digits, 10);
    if n > 0 then
      flag := 'shared_phone'; detail := format('The owner''s phone number is also on %s other account(s)', n); return next;
    end if;
  end if;

  select count(*) into n from public.listings where owner_id = l.owner_id and created_at > now() - interval '24 hours';
  if n >= 10 then
    flag := 'many_new_listings'; detail := format('The owner created %s listings in the last 24 hours', n); return next;
  end if;

  if l.price_amount is not null and l.price_amount > 0 then
    select percentile_cont(0.5) within group (order by c.price_amount), count(*)
    into median, comparables
    from public.listings c
    where c.status = 'published' and c.id <> l.id and c.purpose = l.purpose and c.city_id = l.city_id
      and c.property_type_id = l.property_type_id and c.currency = l.currency and c.price_period = l.price_period
      and c.price_amount > 0;
    if comparables >= 5 and l.price_amount < median * 0.3 then
      flag := 'price_far_below'; detail := format('Price is less than a third of similar listings (median %s)', round(median)); return next;
    end if;
  end if;

  select count(*) into n from public.listing_reports where listing_id = l.id and status = 'open';
  if n > 0 then
    flag := 'open_reports'; detail := format('%s open report(s) from visitors', n); return next;
  end if;
end;
$$;

-- ===========================================================================
-- Owner insights
-- ===========================================================================
create table public.listing_views (
  listing_id uuid not null references public.listings (id) on delete cascade,
  day date not null,
  views integer not null default 0,
  primary key (listing_id, day)
);

alter table public.listing_views enable row level security;
revoke all on public.listing_views from anon, authenticated;

-- One view per visitor per listing per day; the lister's own visits are not counted.
create function public.record_listing_view(p_listing_id uuid, p_visitor text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  who text := coalesce(auth.uid()::text, nullif(left(p_visitor, 64), ''), app.request_ip_hash(), 'anonymous');
begin
  if not exists (select 1 from public.listings where id = p_listing_id and status = 'published'
                 and owner_id is distinct from auth.uid()) then
    return;
  end if;
  begin
    perform app.check_rate_limit('view:' || p_listing_id || ':' || who, 1, interval '1 day');
  exception when sqlstate 'PT429' then
    return;
  end;
  insert into public.listing_views as v (listing_id, day, views)
  values (p_listing_id, current_date, 1)
  on conflict (listing_id, day) do update set views = v.views + 1;
end;
$$;

-- Per listing: views (30 days), enquiries (30 days and total), saves, expiry date.
create function public.my_listing_stats()
returns table (
  listing_id uuid,
  views_30d integer,
  enquiries_30d integer,
  enquiries_total integer,
  saves integer,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id,
         coalesce((select sum(v.views) from public.listing_views v where v.listing_id = l.id and v.day > current_date - 30), 0)::integer,
         (select count(*) from public.enquiries e where e.listing_id = l.id and e.created_at > now() - interval '30 days')::integer,
         (select count(*) from public.enquiries e where e.listing_id = l.id)::integer,
         (select count(*) from public.favorites f where f.listing_id = l.id)::integer,
         app.listing_expires_at(l)
  from public.listings l
  where l.owner_id = auth.uid() or (l.agent_id = auth.uid() and app.has_role('agent'));
$$;

-- ===========================================================================
-- Permissions
-- ===========================================================================
revoke execute on function app.saved_search_new_matches(public.saved_searches) from public, anon, authenticated;
revoke execute on function
  public.worker_run_saved_search_alerts(),
  public.worker_expire_listings(),
  public.worker_set_media_hash(uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.worker_run_saved_search_alerts(),
  public.worker_expire_listings(),
  public.worker_set_media_hash(uuid, text)
  to service_role;
revoke execute on function
  public.renew_listing(uuid),
  public.admin_handle_report(bigint, text),
  public.admin_listing_flags(uuid),
  public.my_listing_stats()
  from public, anon;
-- Visitors (signed in or not) may report listings and count views.
grant execute on function public.report_listing(uuid, text, text), public.record_listing_view(uuid, text) to anon, authenticated;
