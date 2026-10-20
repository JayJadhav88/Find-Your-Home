-- Batch 1 · Site content without a code release: rotating home banners, a floating action
-- button (e.g. WhatsApp us), click counts for both, banner images, and feature switches for
-- future modules (backend checks them; switched-off features fail safely).

-- A link the site may open: a page on this site or an https address.
create function app.is_safe_link(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_url ~ '^(/([^/\s][^\s]*)?|https://[^\s]+|tel:\+?[0-9 ()-]{6,20}|https://wa\.me/[0-9]{6,15}([?][^\s]*)?)$' and char_length(p_url) <= 500;
$$;

-- ===========================================================================
-- Banners
-- ===========================================================================
create table public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  subtitle text check (char_length(subtitle) <= 160),
  image_url text check (image_url ~ '^https?://' and char_length(image_url) <= 500),
  cta_label text check (char_length(cta_label) <= 30),
  target_url text check (target_url is null or app.is_safe_link(target_url)),
  -- Where it shows: website, app, or both.
  audience text not null default 'all' check (audience in ('all', 'web', 'app')),
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint banners_dates check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create trigger banners_updated_at before update on public.banners
  for each row execute function app.set_updated_at();

alter table public.banners enable row level security;
create policy "Live banners are public" on public.banners for select to anon, authenticated
  using ((is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
         or (select app.can_manage_content()));
create policy "Content managers manage banners" on public.banners for all to authenticated
  using ((select app.can_manage_content())) with check ((select app.can_manage_content()));
revoke all on public.banners from anon;
grant select on public.banners to anon;

-- ===========================================================================
-- Floating action button (one)
-- ===========================================================================
create table public.floating_action (
  id boolean primary key default true check (id),
  is_active boolean not null default false,
  icon text not null default 'whatsapp' check (icon in ('whatsapp', 'phone', 'chat', 'calendar', 'home', 'offer', 'video')),
  label text not null default 'Chat with us' check (char_length(btrim(label)) between 1 and 40),
  target_url text check (target_url is null or app.is_safe_link(target_url)),
  position text not null default 'right' check (position in ('right', 'left')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint floating_action_needs_link check (not is_active or target_url is not null)
);
insert into public.floating_action (id) values (true);

create trigger floating_action_stamp before update on public.floating_action
  for each row execute function app.stamp_integration_settings();

alter table public.floating_action enable row level security;
create policy "The floating button is public" on public.floating_action for select to anon, authenticated using (true);
create policy "Content managers edit the floating button" on public.floating_action for update to authenticated
  using ((select app.can_manage_content())) with check ((select app.can_manage_content()));
revoke all on public.floating_action from anon;
grant select on public.floating_action to anon;

-- ===========================================================================
-- Click counts (no personal data: one row per link per day)
-- ===========================================================================
create table public.link_clicks (
  link_key text not null check (link_key ~ '^(floating|banner:[0-9a-f-]{36})$'),
  day date not null,
  clicks integer not null default 0,
  primary key (link_key, day)
);
alter table public.link_clicks enable row level security;
create policy "Content managers read click counts" on public.link_clicks for select to authenticated
  using ((select app.can_manage_content()));
revoke all on public.link_clicks from anon, authenticated;
grant select on public.link_clicks to authenticated;

-- Counts a click and returns where it goes; the destination always comes from the database
-- (never from the request), so this can't be used as an open redirect.
create function public.follow_site_link(p_key text, p_visitor text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target text;
begin
  if p_key = 'floating' then
    select target_url into target from public.floating_action where id and is_active;
  elsif p_key ~ '^banner:[0-9a-f-]{36}$' then
    select b.target_url into target from public.banners b
    where b.id = substr(p_key, 8)::uuid and b.is_active
      and (b.starts_at is null or b.starts_at <= now()) and (b.ends_at is null or b.ends_at > now());
  end if;
  if target is null then
    return null;
  end if;
  begin
    perform app.check_rate_limit('click:' || p_key || ':' || coalesce(nullif(left(p_visitor, 64), ''), app.request_ip_hash(), 'anonymous'), 1, interval '1 hour');
    insert into public.link_clicks as c (link_key, day, clicks) values (p_key, current_date, 1)
    on conflict (link_key, day) do update set clicks = c.clicks + 1;
  exception when sqlstate 'PT429' then
    null; -- repeated clicks from the same visitor count once an hour
  end;
  return target;
end;
$$;

grant execute on function public.follow_site_link(text, text) to anon, authenticated;

-- ===========================================================================
-- Banner images (public bucket; content managers upload)
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Content managers upload site images" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and (select app.can_manage_content()));
create policy "Content managers replace site images" on storage.objects for update to authenticated
  using (bucket_id = 'site-media' and (select app.can_manage_content()));
create policy "Content managers delete site images" on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and (select app.can_manage_content()));

-- ===========================================================================
-- Feature switches
-- ===========================================================================
create table public.feature_flags (
  key text primary key check (key ~ '^[a-z_]{2,40}$'),
  label text not null,
  description text not null default '',
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

insert into public.feature_flags (key, label, description) values
  ('referral_programme', 'Referral programme', 'Referral codes, links and rewards. Turn on only after the referral rules are published.'),
  ('videography', 'Free videography booking', 'Owners can request filming. Turn on after the service area and terms are set.'),
  ('phone_otp', 'Phone number sign-in (OTP)', 'Needs an SMS provider and budget. Not built yet.'),
  ('ai_recommendations', 'AI recommendations', 'Suggested homes with videos. Not built yet.'),
  ('popup', 'Promotional pop-up', 'Show a pop-up message on the website and app. Not built yet.'),
  ('map_view', 'Map view in search', 'Map pins next to the results list. Not built yet.')
on conflict (key) do nothing;

create trigger feature_flags_stamp before update on public.feature_flags
  for each row execute function app.stamp_integration_settings();

create function app.audit_feature_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.enabled is distinct from old.enabled then
    perform app.audit('feature.' || case when new.enabled then 'on' else 'off' end, 'feature_flag', new.key);
  end if;
  return new;
end;
$$;

create trigger feature_flags_audit after update on public.feature_flags
  for each row execute function app.audit_feature_flag();

alter table public.feature_flags enable row level security;
create policy "Feature switches are public" on public.feature_flags for select to anon, authenticated using (true);
create policy "Administrators change feature switches" on public.feature_flags for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));
revoke all on public.feature_flags from anon, authenticated;
grant select on public.feature_flags to anon, authenticated;
grant update (enabled) on public.feature_flags to authenticated;

-- For database functions of future modules: refuse when the module is switched off.
create function app.feature_enabled(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select enabled from public.feature_flags where key = p_key), false);
$$;

grant execute on function app.feature_enabled(text) to anon, authenticated, service_role;
