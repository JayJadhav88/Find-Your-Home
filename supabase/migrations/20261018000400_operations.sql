-- Operations: audit log, notification outbox, rate limiting, privacy requests.

-- Internal configuration that must never be readable through the API.
create table app.config (
  key text primary key,
  value text not null
);
revoke all on app.config from anon, authenticated;

-- Salt for hashing request IPs (rate limiting without storing raw IPs).
insert into app.config (key, value)
values ('ip_hash_salt', encode(extensions.gen_random_bytes(32), 'hex'));

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (char_length(action) <= 80),
  entity_type text not null check (char_length(entity_type) <= 60),
  entity_id text,
  before jsonb,
  after jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

create function app.prevent_audit_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end;
$$;

create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function app.prevent_audit_changes();

-- ---------------------------------------------------------------------------
-- Request helpers
-- ---------------------------------------------------------------------------
create function app.request_ip_hash()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  headers json := nullif(current_setting('request.headers', true), '')::json;
  ip text := btrim(split_part(coalesce(headers ->> 'x-forwarded-for', headers ->> 'x-real-ip', ''), ',', 1));
begin
  if ip = '' then
    return null;
  end if;
  return encode(
    extensions.digest(ip || (select value from app.config where key = 'ip_hash_salt'), 'sha256'),
    'hex'
  );
end;
$$;

create function app.audit(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_before jsonb default null,
  p_after jsonb default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after, ip_hash)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_before, p_after, app.request_ip_hash());
$$;

-- ---------------------------------------------------------------------------
-- Rate limiting (fixed window). Raises SQLSTATE PT429, which the Data API
-- returns as HTTP 429.
-- ---------------------------------------------------------------------------
create table app.rate_limit_buckets (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);
revoke all on app.rate_limit_buckets from anon, authenticated;

create function app.check_rate_limit(p_key text, p_max integer, p_window interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  bucket_start timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / extract(epoch from p_window)) * extract(epoch from p_window));
  current_hits integer;
begin
  insert into app.rate_limit_buckets as b (key, window_start, hits)
  values (p_key, bucket_start, 1)
  on conflict (key, window_start) do update set hits = b.hits + 1
  returning hits into current_hits;

  if current_hits > p_max then
    raise exception 'Too many requests. Please try again later.' using errcode = 'PT429';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notification outbox. Written in the same transaction as the business event;
-- delivered by an Edge Function with retries.
-- ---------------------------------------------------------------------------
create table public.notification_outbox (
  id bigint generated always as identity primary key,
  template text not null check (template ~ '^[a-z_]+$'),
  recipient_email text check (recipient_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  recipient_user_id uuid references public.profiles (id) on delete set null,
  template_data jsonb not null default '{}'::jsonb,
  status public.outbox_status not null default 'pending',
  attempts smallint not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint outbox_has_recipient check (num_nonnulls(recipient_email, recipient_user_id) > 0)
);

create index notification_outbox_due_idx on public.notification_outbox (next_attempt_at)
  where status = 'pending';

create function app.enqueue_notification(
  p_template text,
  p_recipient_user_id uuid,
  p_recipient_email text,
  p_data jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification_outbox (template, recipient_user_id, recipient_email, template_data)
  values (p_template, p_recipient_user_id, p_recipient_email, coalesce(p_data, '{}'::jsonb));
$$;

-- Background jobs that need secrets (e.g. copying approved photos to the public bucket).
create table public.job_queue (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('publish_listing_media', 'unpublish_listing_media')),
  listing_id uuid not null,
  status public.outbox_status not null default 'pending',
  attempts smallint not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index job_queue_due_idx on public.job_queue (next_attempt_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Privacy requests (export / deletion)
-- ---------------------------------------------------------------------------
create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.data_request_kind not null,
  status public.data_request_status not null default 'pending',
  notes text check (char_length(notes) <= 2000),
  handled_by uuid references public.profiles (id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index data_requests_one_open_per_kind on public.data_requests (user_id, kind)
  where status in ('pending', 'in_progress');

-- Internal writers: callable only from SECURITY DEFINER workflow functions (which run as
-- their owner) and the service role, never directly by clients.
revoke execute on function
  app.request_ip_hash(), app.audit(text, text, text, jsonb, jsonb),
  app.check_rate_limit(text, integer, interval), app.enqueue_notification(text, uuid, text, jsonb)
  from public, anon, authenticated;
