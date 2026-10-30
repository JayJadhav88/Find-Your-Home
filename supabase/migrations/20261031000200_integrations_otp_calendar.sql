-- Admin → Integrations gets payments (Razorpay), SMS OTP (MSG91 or 2Factor), maps and a team
-- calendar feed. Keys stay encrypted in Vault; switches and public ids live in
-- integration_settings. Phone OTP is used for sign-in (Supabase Auth, through the send-sms
-- hook) and, when switched on, to verify the phone number in the lead pop-up.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
alter table public.integration_settings
  add column payments_enabled boolean not null default false,
  add column razorpay_key_id text check (razorpay_key_id ~ '^rzp_(test|live)_[A-Za-z0-9]{6,40}$'),
  add column sms_provider text check (sms_provider in ('msg91', '2factor')),
  add column sms_sender_id text check (sms_sender_id ~ '^[A-Z]{6}$'),
  add column sms_template_id text check (sms_template_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  add column otp_sign_in_enabled boolean not null default false,
  add column otp_leads_enabled boolean not null default false,
  add column maps_provider text not null default 'osm' check (maps_provider in ('osm', 'google')),
  add column google_maps_key text check (google_maps_key ~ '^AIza[0-9A-Za-z_-]{30,60}$'),
  add column calendar_token_hash text;

grant select, update (
  email_from, email_reply_to, whatsapp_enabled, whatsapp_phone_number_id, whatsapp_templates,
  push_enabled, sheets_enabled, sheets_webhook_url,
  payments_enabled, razorpay_key_id, sms_provider, sms_sender_id, sms_template_id,
  otp_sign_in_enabled, otp_leads_enabled, maps_provider, google_maps_key
) on public.integration_settings to authenticated;

create or replace function app.integration_secret_names()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['resend_api_key', 'whatsapp_access_token', 'expo_access_token', 'sheets_webhook_secret',
               'razorpay_key_secret', 'razorpay_webhook_secret', 'sms_api_key'];
$$;

-- What the website and app may know: switches and public ids only, never keys.
create function public.public_integration_flags()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'payments', i.payments_enabled and i.razorpay_key_id is not null
                and exists (select 1 from vault.secrets s where s.name = 'fyh_razorpay_key_secret'),
    'otp_sign_in', i.otp_sign_in_enabled and i.sms_provider is not null
                and exists (select 1 from vault.secrets s where s.name = 'fyh_sms_api_key'),
    'otp_leads', i.otp_leads_enabled and i.sms_provider is not null
                and exists (select 1 from vault.secrets s where s.name = 'fyh_sms_api_key'),
    'maps_provider', case when i.maps_provider = 'google' and i.google_maps_key is not null then 'google' else 'osm' end,
    'google_maps_key', case when i.maps_provider = 'google' then i.google_maps_key end
  )
  from public.integration_settings i where i.id;
$$;
grant execute on function public.public_integration_flags() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Phone sign-in: a confirmed phone counts as a verified account, and the number is kept
-- on the profile.
-- ---------------------------------------------------------------------------
create or replace function app.is_email_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid() and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
  );
$$;

create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text := btrim(coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    ''
  ));
begin
  if requested_name = '' or char_length(requested_name) > 100 then
    requested_name := left(split_part(coalesce(new.email, 'Member'), '@', 1), 100);
  end if;

  insert into public.profiles (id, display_name, phone)
  values (new.id, requested_name, case when nullif(new.phone, '') is not null then '+' || ltrim(new.phone, '+') end);
  insert into public.user_roles (user_id, role) values (new.id, 'buyer');
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Phone verification for the lead pop-up
-- ---------------------------------------------------------------------------
create table public.phone_otps (
  id uuid primary key default gen_random_uuid(),
  phone_digits text not null check (phone_digits ~ '^[0-9]{10,15}$'),
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null default now() + interval '10 minutes',
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index phone_otps_phone_idx on public.phone_otps (phone_digits, created_at desc);
alter table public.phone_otps enable row level security;
revoke all on public.phone_otps from anon, authenticated;

-- A verified phone gets a token (kept by the visitor's browser) so they aren't asked again.
create table public.phone_verifications (
  token_hash text primary key,
  phone_digits text not null,
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now()
);
alter table public.phone_verifications enable row level security;
revoke all on public.phone_verifications from anon, authenticated;

create function app.phone_digits(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  -- Indian numbers: keep the last 10 digits with the 91 country code.
  select case
    when char_length(d) = 10 then '91' || d
    when char_length(d) = 12 and left(d, 2) = '91' then d
    when char_length(d) = 11 and left(d, 1) = '0' then '91' || right(d, 10)
    else d
  end
  from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as d) x;
$$;

-- Called by the phone-otp Edge Function: makes a code to send by SMS. Service role only.
create function public.otp_create(p_phone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  digits text := app.phone_digits(p_phone);
  code text := lpad((floor(random() * 1000000))::int::text, 6, '0');
begin
  if digits !~ '^[0-9]{10,15}$' then
    raise exception 'Please enter a valid phone number' using errcode = '22023';
  end if;
  perform app.check_rate_limit('otp:' || digits, 3, interval '10 minutes');
  perform app.check_rate_limit('otp-day:' || digits, 10, interval '1 day');
  insert into public.phone_otps (phone_digits, code_hash)
  values (digits, encode(extensions.digest(digits || ':' || code, 'sha256'), 'hex'));
  return code;
end;
$$;
revoke all on function public.otp_create(text) from public, anon, authenticated;
grant execute on function public.otp_create(text) to service_role;

-- Checks a 6-digit code or an earlier verification token. Returns a (new) token when valid.
create function app.verify_phone(p_phone text, p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  digits text := app.phone_digits(p_phone);
  otp public.phone_otps;
  token text;
begin
  if p_code ~ '^[0-9]{6}$' then
    select * into otp from public.phone_otps
    where phone_digits = digits and verified_at is null and expires_at > now()
    order by created_at desc limit 1 for update;
    if not found or otp.attempts >= 5 then
      raise exception 'The code has expired. Ask for a new one.' using errcode = 'PT409';
    end if;
    if otp.code_hash <> encode(extensions.digest(digits || ':' || p_code, 'sha256'), 'hex') then
      update public.phone_otps set attempts = attempts + 1 where id = otp.id;
      raise exception 'That code is not right. Check the SMS and try again.' using errcode = '22023';
    end if;
    update public.phone_otps set verified_at = now() where id = otp.id;
    token := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.phone_verifications (token_hash, phone_digits)
    values (encode(extensions.digest(token, 'sha256'), 'hex'), digits);
    return token;
  elsif p_code ~ '^[0-9a-f]{48}$' and exists (
    select 1 from public.phone_verifications
    where token_hash = encode(extensions.digest(p_code, 'sha256'), 'hex') and phone_digits = digits and expires_at > now()
  ) then
    return p_code;
  end if;
  raise exception 'Verify your phone number with the code we send by SMS.' using errcode = 'PT428';
end;
$$;
revoke all on function app.verify_phone(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The lead pop-up, now with optional phone verification (same as before otherwise).
-- ---------------------------------------------------------------------------
drop function public.submit_gated_lead(uuid, text, text, text, text, jsonb, timestamptz, text, text, jsonb);

create function public.submit_gated_lead(
  p_listing_id uuid,
  p_kind text,
  p_name text,
  p_phone text,
  p_email text default null,
  p_answers jsonb default '{}'::jsonb,
  p_callback_at timestamptz default null,
  p_consent_text_version text default null,
  p_source text default 'website',
  p_utm jsonb default '{}'::jsonb,
  p_otp text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings;
  settings public.site_settings := app.settings();
  ip text := app.request_ip_hash();
  digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  clean_answers jsonb := '{}'::jsonb;
  question jsonb;
  answer text;
  recipient uuid;
  existing uuid;
  lead_id uuid;
  v_phone text;
  v_whatsapp text;
  v_email text;
  src text := case when p_source in ('website', 'app', 'qr', 'referral', 'campaign', 'organic') then p_source else 'website' end;
  message text;
  verify_token text;
begin
  perform app.require_state(p_kind in ('brochure', 'callback', 'contact_reveal'), 'Unknown request');
  select * into l from public.listings where id = p_listing_id;
  perform app.require_state(found and l.status = 'published', 'This property is not available');
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 100 then
    raise exception 'Please enter your name' using errcode = '22023';
  end if;
  if char_length(digits) not between 7 and 15 then
    raise exception 'Please enter a valid phone number' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_email, '')), '') is not null and p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address' using errcode = '22023';
  end if;
  if p_kind = 'brochure' and l.brochure_key is null then
    raise exception 'This property has no brochure' using errcode = 'PT409';
  end if;
  if p_kind = 'callback' and p_callback_at is not null and p_callback_at < now() - interval '5 minutes' then
    raise exception 'Choose a time in the future' using errcode = '22023';
  end if;

  -- Phone verification by SMS, when switched on in Admin → Integrations.
  if (public.public_integration_flags() ->> 'otp_leads')::boolean then
    verify_token := app.verify_phone(p_phone, coalesce(p_otp, ''));
  end if;

  for question in select * from jsonb_array_elements(settings.lead_questions) loop
    answer := p_answers ->> (question ->> 'id');
    if answer is not null and question -> 'options' ? answer then
      clean_answers := clean_answers || jsonb_build_object(question ->> 'label', answer);
    end if;
  end loop;

  select c.phone, c.whatsapp, c.email into v_phone, v_whatsapp, v_email from app.listing_contact_values(l) c;

  select e.id into existing from public.enquiries e
  where e.listing_id = l.id and e.kind = p_kind::public.enquiry_kind
    and right(regexp_replace(coalesce(e.phone, ''), '[^0-9]', '', 'g'), 10) = right(digits, 10)
    and e.created_at > now() - interval '1 day'
  limit 1;

  if existing is null then
    perform app.check_rate_limit('gated-lead:' || coalesce(auth.uid()::text, ip, 'anonymous'), 30, interval '1 hour');
    recipient := case
      when l.agent_id is not null then l.agent_id
      when settings.owner_leads_enabled then l.owner_id
    end;
    message := case p_kind
      when 'brochure' then 'Downloaded the brochure.'
      when 'callback' then 'Asked for a callback' || coalesce(' at ' || to_char(p_callback_at at time zone settings.default_timezone, 'DD Mon YYYY HH24:MI'), ' as soon as possible') || '.'
      else 'Viewed the contact details.'
    end;
    if verify_token is not null then
      message := message || ' Phone verified by SMS.';
    end if;
    insert into public.enquiries (
      listing_id, sender_user_id, name, email, phone, message, kind, consent_text_version, ip_hash, assigned_to,
      lead_type, interest, source, utm, answers, callback_at
    ) values (
      l.id, auth.uid(), btrim(p_name), nullif(lower(btrim(coalesce(p_email, ''))), ''), btrim(p_phone), message,
      p_kind::public.enquiry_kind, p_consent_text_version, ip, recipient,
      'customer', case when l.category = 'rental' then 'rent' when l.category = 'new_project' then 'new_launch' else 'buy' end,
      src, app.clean_utm(p_utm), clean_answers, case when p_kind = 'callback' then p_callback_at end
    ) returning id into lead_id;
  else
    lead_id := existing;
  end if;

  return jsonb_build_object(
    'lead_id', lead_id,
    'verify_token', verify_token,
    'brochure_key', case when p_kind = 'brochure' then l.brochure_key end,
    'phone', case when p_kind = 'contact_reveal' then v_phone end,
    'whatsapp', case when p_kind = 'contact_reveal' then v_whatsapp end,
    'email', case when p_kind = 'contact_reveal' then v_email end
  );
end;
$$;
revoke all on function public.submit_gated_lead(uuid, text, text, text, text, jsonb, timestamptz, text, text, jsonb, text) from public;
grant execute on function public.submit_gated_lead(uuid, text, text, text, text, jsonb, timestamptz, text, text, jsonb, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Team calendar: confirmed visits and shoots, also as a private feed for Google Calendar.
-- ---------------------------------------------------------------------------
create function app.team_calendar_events(p_from timestamptz, p_to timestamptz)
returns table (uid text, kind text, starts_at timestamptz, ends_at timestamptz, title text, details text, listing_id uuid, link_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select 'visit-' || e.id, 'visit', e.requested_visit_at, e.requested_visit_at + interval '1 hour',
         'Visit: ' || coalesce(l.title, 'property') || ' (' || e.name || ')',
         concat_ws(' · ', e.name, e.phone, l.reference_code, case when e.visit_status = 'requested' then 'not confirmed yet' end),
         l.id, e.id
  from public.enquiries e left join public.listings l on l.id = e.listing_id
  where e.kind = 'visit_request' and e.visit_status in ('requested', 'confirmed')
    and e.requested_visit_at between p_from and p_to
  union all
  select 'shoot-' || s.id, 'shoot', s.scheduled_at, s.scheduled_at + interval '2 hours',
         'Shoot: ' || coalesce(l.title, 'property'),
         concat_ws(' · ', s.contact_name, s.contact_phone, l.reference_code, s.notes, s.team_note),
         l.id, s.id
  from public.shoot_requests s left join public.listings l on l.id = s.listing_id
  where s.status = 'confirmed' and s.scheduled_at between p_from and p_to
  union all
  select 'callback-' || e.id, 'callback', e.callback_at, e.callback_at + interval '15 minutes',
         'Call back: ' || e.name || ' about ' || coalesce(l.title, 'a property'),
         concat_ws(' · ', e.name, e.phone, l.reference_code),
         l.id, e.id
  from public.enquiries e left join public.listings l on l.id = e.listing_id
  where e.kind = 'callback' and e.callback_at between p_from and p_to and e.status not in ('won', 'lost', 'closed', 'spam', 'unqualified')
$$;
revoke all on function app.team_calendar_events(timestamptz, timestamptz) from public, anon, authenticated;

create function public.team_calendar(p_from timestamptz, p_to timestamptz)
returns table (uid text, kind text, starts_at timestamptz, ends_at timestamptz, title text, details text, listing_id uuid, link_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require(app.is_staff() or app.has_role('crm_manager') or app.has_role('support'), 'Only the team can see the calendar');
  perform app.require_state(p_to > p_from and p_to - p_from <= interval '120 days', 'Choose a shorter period');
  return query select * from app.team_calendar_events(p_from, p_to) order by 3;
end;
$$;
revoke all on function public.team_calendar(timestamptz, timestamptz) from public, anon;
grant execute on function public.team_calendar(timestamptz, timestamptz) to authenticated;

-- A secret link the team adds to Google Calendar ("From URL"). Making a new one stops the old.
create function public.admin_new_calendar_link()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  perform app.require(app.is_admin(), 'Only administrators can do this');
  update public.integration_settings set calendar_token_hash = encode(extensions.digest(token, 'sha256'), 'hex') where id;
  perform app.audit('integration.calendar_link', 'integration', 'calendar');
  return token;
end;
$$;
revoke all on function public.admin_new_calendar_link() from public, anon;
grant execute on function public.admin_new_calendar_link() to authenticated;

create function public.calendar_feed(p_token text)
returns table (uid text, kind text, starts_at timestamptz, ends_at timestamptz, title text, details text, listing_id uuid, link_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_token !~ '^[0-9a-f]{48}$' or not exists (
    select 1 from public.integration_settings
    where id and calendar_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  ) then
    raise exception 'Unknown calendar' using errcode = '42501';
  end if;
  return query select * from app.team_calendar_events(now() - interval '30 days', now() + interval '180 days') order by 3;
end;
$$;
revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;
