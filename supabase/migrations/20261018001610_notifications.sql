-- Notifications: in-app inbox, per-user channel preferences, phone push tokens, team roles,
-- integration settings with secrets in Supabase Vault, and one fan-out function that turns a
-- business event into an in-app notification plus email / push / WhatsApp deliveries.
--
-- Notification text is not stored: rows keep a kind and data, and each app renders the
-- words in the reader's language (packages/shared/src/notifications.ts).

create type public.notification_channel as enum ('email', 'whatsapp', 'push');

-- ---------------------------------------------------------------------------
-- Team roles
-- ---------------------------------------------------------------------------
create function app.has_any_role(required public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid()
      and ur.role = any (required)
      and p.status = 'active'
  );
$$;

-- Anyone who may open the admin panel.
create function app.is_team()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role(array['moderator', 'administrator', 'support', 'marketing']::public.app_role[]);
$$;

create function app.can_manage_enquiries()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role(array['moderator', 'administrator', 'support']::public.app_role[]);
$$;

create function app.can_send_broadcasts()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role(array['administrator', 'marketing']::public.app_role[]);
$$;

grant execute on function
  app.has_any_role(public.app_role[]), app.is_team(), app.can_manage_enquiries(), app.can_send_broadcasts()
  to anon, authenticated, service_role;

-- Support staff handle every enquiry (previously only moderators and administrators).
create or replace function app.can_handle_enquiry(p_assigned_to uuid, p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_manage_enquiries() or (
    app.is_active_user()
    and p_assigned_to = auth.uid()
    and exists (
      select 1 from public.listings l
      where l.id = p_listing_id
        and (
          (l.agent_id = auth.uid() and app.has_role('agent'))
          or (l.owner_id = auth.uid() and (app.settings()).owner_leads_enabled)
        )
    )
  );
$$;

-- Team members see each other's names in the admin panel.
drop policy "Users read their own profile; staff read all" on public.profiles;
create policy "Users read their own profile; team members read all"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select app.is_team()));

-- Team roles need a verified email address, like staff and builder roles before.
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
      p_role not in ('moderator', 'administrator', 'support', 'marketing', 'builder')
        or exists (select 1 from auth.users where id = p_user_id and email_confirmed_at is not null),
      'Team and builder roles require a verified email address'
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

-- ---------------------------------------------------------------------------
-- Site-wide notification settings
-- ---------------------------------------------------------------------------
alter table public.site_settings
  -- Shown to owners after they submit: "usually reviewed within N hours".
  add column review_hours_target smallint not null default 12 check (review_hours_target between 1 and 336),
  -- Non-urgent messages (broadcasts, alerts) wait until quiet hours end, in the reader's time zone.
  add column quiet_start_hour smallint not null default 22 check (quiet_start_hour between 0 and 23),
  add column quiet_end_hour smallint not null default 8 check (quiet_end_hour between 0 and 23),
  -- Most broadcasts one person receives in 7 days (0 = no broadcasts).
  add column broadcast_weekly_cap smallint not null default 3 check (broadcast_weekly_cap between 0 and 50);

-- ---------------------------------------------------------------------------
-- In-app notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]+$'),
  data jsonb not null default '{}'::jsonb,
  broadcast_id bigint,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
create policy "Users read their own notifications"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

create function public.mark_notifications_read(p_ids bigint[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  perform app.require(auth.uid() is not null, 'Sign in first');
  update public.notifications
  set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- ---------------------------------------------------------------------------
-- Channel preferences (one row per account, created with the profile)
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  email_enabled boolean not null default true,
  push_enabled boolean not null default true,
  whatsapp_enabled boolean not null default false,
  -- E.164, e.g. +919876543210
  whatsapp_number text check (whatsapp_number ~ '^\+[1-9][0-9]{7,14}$'),
  -- When the person agreed to WhatsApp messages (set by the database, not the client).
  whatsapp_opt_in_at timestamptz,
  -- Saved-search alerts.
  alerts_enabled boolean not null default true,
  quiet_hours_enabled boolean not null default true,
  timezone text check (char_length(timezone) <= 64),
  updated_at timestamptz not null default now(),
  constraint whatsapp_needs_consent check (
    not whatsapp_enabled or (whatsapp_number is not null and whatsapp_opt_in_at is not null)
  )
);

create function app.manage_notification_preferences()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.timezone is not null
     and not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone' using errcode = '22023';
  end if;

  -- Record consent when WhatsApp is switched on (or the number changes); clear it when off.
  if app.is_client_request() then
    if new.whatsapp_enabled
       and (not old.whatsapp_enabled or new.whatsapp_number is distinct from old.whatsapp_number) then
      new.whatsapp_opt_in_at := now();
    elsif not new.whatsapp_enabled then
      new.whatsapp_opt_in_at := null;
    else
      new.whatsapp_opt_in_at := old.whatsapp_opt_in_at;
    end if;
  end if;
  return new;
end;
$$;

create trigger notification_preferences_manage before update on public.notification_preferences
  for each row execute function app.manage_notification_preferences();

create function app.create_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger profiles_create_notification_preferences after insert on public.profiles
  for each row execute function app.create_notification_preferences();

insert into public.notification_preferences (user_id)
select id from public.profiles
on conflict do nothing;

alter table public.notification_preferences enable row level security;
create policy "Users read their own notification preferences"
  on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users update their own notification preferences"
  on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.notification_preferences from anon, authenticated;
grant select on public.notification_preferences to authenticated;
grant update (
  email_enabled, push_enabled, whatsapp_enabled, whatsapp_number, alerts_enabled,
  quiet_hours_enabled, timezone
) on public.notification_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- Phone push tokens (Expo push service)
-- ---------------------------------------------------------------------------
create table public.push_tokens (
  token text primary key check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id, last_seen_at desc);

alter table public.push_tokens enable row level security;
create policy "Users read their own push tokens"
  on public.push_tokens for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.push_tokens from anon, authenticated;
grant select on public.push_tokens to authenticated;

-- A device's token moves to whoever signed in on it last. At most 10 devices per account.
create function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require(auth.uid() is not null and app.is_active_user(), 'Sign in first');
  insert into public.push_tokens (token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();

  delete from public.push_tokens
  where user_id = auth.uid()
    and token not in (
      select token from public.push_tokens where user_id = auth.uid()
      order by last_seen_at desc limit 10
    );
end;
$$;

create function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Delivery queue: one row per channel
-- ---------------------------------------------------------------------------
alter table public.notification_outbox
  add column channel public.notification_channel not null default 'email',
  add column notification_id bigint references public.notifications (id) on delete set null,
  add column broadcast_id bigint;

create index notification_outbox_broadcast_idx on public.notification_outbox (broadcast_id)
  where broadcast_id is not null;

-- When a non-urgent message may go out: now, or when the reader's quiet hours end.
create function app.next_delivery_time(p_user uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.site_settings := app.settings();
  prefs public.notification_preferences;
  tz text;
  local_now timestamp;
  local_hour integer;
  quiet boolean;
  wake timestamp;
begin
  select * into prefs from public.notification_preferences where user_id = p_user;
  if s.quiet_start_hour = s.quiet_end_hour or (found and not prefs.quiet_hours_enabled) then
    return now();
  end if;

  tz := coalesce(prefs.timezone, s.default_timezone);
  local_now := now() at time zone tz;
  local_hour := extract(hour from local_now);
  quiet := case
    when s.quiet_start_hour < s.quiet_end_hour
      then local_hour >= s.quiet_start_hour and local_hour < s.quiet_end_hour
    else local_hour >= s.quiet_start_hour or local_hour < s.quiet_end_hour
  end;
  if not quiet then
    return now();
  end if;

  wake := date_trunc('day', local_now) + make_interval(hours => s.quiet_end_hour);
  if wake <= local_now then
    wake := wake + interval '1 day';
  end if;
  return wake at time zone tz;
end;
$$;

-- Fan-out for one account: in-app row plus every channel the person has switched on.
create function app.deliver_to_user(
  p_user uuid,
  p_kind text,
  p_data jsonb,
  p_channels public.notification_channel[] default array['email', 'push', 'whatsapp']::public.notification_channel[],
  p_in_app boolean default true,
  p_broadcast_id bigint default null,
  p_wait_for_quiet_hours boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  prefs public.notification_preferences;
  note_id bigint;
  send_at timestamptz;
  data jsonb := coalesce(p_data, '{}'::jsonb);
begin
  if not exists (select 1 from public.profiles where id = p_user and status = 'active') then
    return;
  end if;
  select * into prefs from public.notification_preferences where user_id = p_user;
  send_at := case when p_wait_for_quiet_hours then app.next_delivery_time(p_user) else now() end;

  if p_in_app then
    insert into public.notifications (user_id, kind, data, broadcast_id)
    values (p_user, p_kind, data, p_broadcast_id)
    returning id into note_id;
  end if;

  if 'email' = any (p_channels) and coalesce(prefs.email_enabled, true) then
    insert into public.notification_outbox
      (template, recipient_user_id, template_data, channel, notification_id, broadcast_id, next_attempt_at)
    values (p_kind, p_user, data, 'email', note_id, p_broadcast_id, send_at);
  end if;

  if 'push' = any (p_channels) and coalesce(prefs.push_enabled, true)
     and exists (select 1 from public.push_tokens where user_id = p_user) then
    insert into public.notification_outbox
      (template, recipient_user_id, template_data, channel, notification_id, broadcast_id, next_attempt_at)
    values (p_kind, p_user, data, 'push', note_id, p_broadcast_id, send_at);
  end if;

  if 'whatsapp' = any (p_channels) and coalesce(prefs.whatsapp_enabled, false) then
    insert into public.notification_outbox
      (template, recipient_user_id, template_data, channel, notification_id, broadcast_id, next_attempt_at)
    values (p_kind, p_user, data, 'whatsapp', note_id, p_broadcast_id, send_at);
  end if;
end;
$$;

-- Existing callers keep their signature; accounts now get every channel, plain email
-- addresses (visitors without an account) still get email only.
create or replace function app.enqueue_notification(
  p_template text,
  p_recipient_user_id uuid,
  p_recipient_email text,
  p_data jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient_user_id is not null then
    perform app.deliver_to_user(p_recipient_user_id, p_template, p_data);
  elsif p_recipient_email is not null then
    insert into public.notification_outbox (template, recipient_email, template_data, channel)
    values (p_template, p_recipient_email, coalesce(p_data, '{}'::jsonb), 'email');
  end if;
end;
$$;

create or replace function app.notify_role(p_role public.app_role, p_template text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member uuid;
begin
  for member in
    select ur.user_id
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id and p.status = 'active'
    where ur.role = p_role
  loop
    perform app.deliver_to_user(member, p_template, p_data);
  end loop;
end;
$$;

revoke execute on function
  app.next_delivery_time(uuid),
  app.deliver_to_user(uuid, text, jsonb, public.notification_channel[], boolean, bigint, boolean)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Worker: claim deliveries for some channels, resolving addresses at send time so a
-- preference change after queuing is respected.
-- ---------------------------------------------------------------------------
drop function public.worker_claim_notifications(integer);

create function public.worker_claim_notifications(
  p_limit integer default 25,
  p_channels public.notification_channel[] default array['email']::public.notification_channel[]
)
returns table (
  id bigint,
  template text,
  channel public.notification_channel,
  recipient_email text,
  recipient_phone text,
  push_tokens text[],
  recipient_name text,
  recipient_locale text,
  template_data jsonb,
  attempts smallint,
  notification_id bigint
)
language sql
security definer
set search_path = ''
as $$
  with leased as (
    update public.notification_outbox n
    set attempts = n.attempts + 1, next_attempt_at = now() + interval '10 minutes'
    where n.id in (
      select o.id from public.notification_outbox o
      where o.status = 'pending' and o.next_attempt_at <= now() and o.channel = any (p_channels)
      order by o.id
      for update skip locked
      limit least(greatest(p_limit, 1), 100)
    )
    returning n.*
  )
  select l.id, l.template, l.channel,
         case
           when l.recipient_user_id is null then l.recipient_email
           when p.status = 'active' and coalesce(pr.email_enabled, true) then u.email::text
         end,
         case when p.status = 'active' and pr.whatsapp_enabled then pr.whatsapp_number end,
         case when p.status = 'active' and coalesce(pr.push_enabled, true) then
           array(select t.token from public.push_tokens t where t.user_id = l.recipient_user_id order by t.last_seen_at desc)
         end,
         p.display_name,
         coalesce(p.preferred_locale, (select s.default_locale from public.site_settings s where s.id)),
         l.template_data, l.attempts, l.notification_id
  from leased l
  left join public.profiles p on p.id = l.recipient_user_id
  left join public.notification_preferences pr on pr.user_id = l.recipient_user_id
  left join auth.users u on u.id = l.recipient_user_id
  order by l.id;
$$;

-- The push service reported this device as gone.
create function public.worker_remove_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = p_token;
$$;

revoke execute on function
  public.worker_claim_notifications(integer, public.notification_channel[]),
  public.worker_remove_push_token(text)
  from public, anon, authenticated;
grant execute on function
  public.worker_claim_notifications(integer, public.notification_channel[]),
  public.worker_remove_push_token(text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Integrations: non-secret settings in a table, API keys in Supabase Vault (encrypted at
-- rest, never returned to the browser). Edge Function environment variables still work
-- and take effect when no value is stored here.
-- ---------------------------------------------------------------------------
create table public.integration_settings (
  id boolean primary key default true check (id),
  email_from text check (char_length(email_from) <= 200),
  email_reply_to text check (email_reply_to ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  whatsapp_enabled boolean not null default false,
  whatsapp_phone_number_id text check (whatsapp_phone_number_id ~ '^[0-9]{5,30}$'),
  -- Approved Meta template per notification kind: {"listing_decision": {"name": "...", "language": "en"}}
  whatsapp_templates jsonb not null default '{}'::jsonb check (jsonb_typeof(whatsapp_templates) = 'object'),
  push_enabled boolean not null default true,
  sheets_enabled boolean not null default false,
  sheets_webhook_url text check (sheets_webhook_url ~ '^https://script\.google\.com/macros/s/[A-Za-z0-9_-]{10,200}/exec$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

insert into public.integration_settings (id) values (true);

create function app.stamp_integration_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger integration_settings_stamp before update on public.integration_settings
  for each row execute function app.stamp_integration_settings();

alter table public.integration_settings enable row level security;
create policy "Administrators read integration settings"
  on public.integration_settings for select to authenticated
  using ((select app.is_admin()));
create policy "Administrators update integration settings"
  on public.integration_settings for update to authenticated
  using ((select app.is_admin()))
  with check ((select app.is_admin()));
revoke all on public.integration_settings from anon, authenticated;
grant select, update (
  email_from, email_reply_to, whatsapp_enabled, whatsapp_phone_number_id, whatsapp_templates,
  push_enabled, sheets_enabled, sheets_webhook_url
) on public.integration_settings to authenticated;

create function app.integration_secret_names()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['resend_api_key', 'whatsapp_access_token', 'sheets_webhook_secret'];
$$;

-- Store, replace or (with an empty value) remove an API key. The value is never readable
-- again through the API.
create function public.admin_set_integration_secret(p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  vault_name text := 'fyh_' || p_name;
  value text := btrim(coalesce(p_value, ''));
  existing uuid;
begin
  perform app.require(app.is_admin(), 'Only administrators can change integrations');
  if not p_name = any (app.integration_secret_names()) then
    raise exception 'Unknown integration key' using errcode = '22023';
  end if;
  if value <> '' and char_length(value) not between 8 and 4096 then
    raise exception 'That key does not look right' using errcode = '22023';
  end if;

  select id into existing from vault.secrets where name = vault_name;
  if value = '' then
    delete from vault.secrets where id = existing;
  elsif existing is null then
    perform vault.create_secret(value, vault_name, 'Find Your Home integration key');
  else
    perform vault.update_secret(existing, value);
  end if;

  perform app.audit(
    case when value = '' then 'integration.secret_removed' else 'integration.secret_set' end,
    'integration', p_name
  );
end;
$$;

create function public.admin_integration_secrets()
returns table (name text, is_set boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require(app.is_admin(), 'Only administrators can view integrations');
  return query
    select n.name, s.id is not null, s.updated_at
    from unnest(app.integration_secret_names()) as n(name)
    left join vault.secrets s on s.name = 'fyh_' || n.name
    order by n.name;
end;
$$;

-- Everything a worker needs to deliver: settings plus decrypted keys. Service role only.
create function public.worker_integration_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(i) - 'updated_by' || jsonb_build_object(
    'secrets',
    coalesce((
      select jsonb_object_agg(substr(d.name, 5), d.decrypted_secret)
      from vault.decrypted_secrets d
      where d.name = any (select 'fyh_' || n from unnest(app.integration_secret_names()) n)
    ), '{}'::jsonb)
  )
  from public.integration_settings i
  where i.id;
$$;

revoke execute on function public.worker_integration_config() from public, anon, authenticated;
grant execute on function public.worker_integration_config() to service_role;

revoke execute on function
  public.mark_notifications_read(bigint[]),
  public.register_push_token(text, text),
  public.unregister_push_token(text),
  public.admin_set_integration_secret(text, text),
  public.admin_integration_secrets()
  from public, anon;
