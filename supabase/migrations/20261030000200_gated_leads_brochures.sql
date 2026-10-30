-- Brochures and the lead pop-up (like 99acres / Housing.com project pages):
-- * Owners, builders and the team upload a PDF brochure per property.
-- * "Download brochure", "View phone / Contact owner" and "Request a callback" first ask for a
--   name, a phone number and up to three short questions (editable in Admin → Settings).
--   Each becomes a lead; only then are the brochure address and the lister's phone released.
-- * The public contact function no longer returns phone, WhatsApp or email to visitors; it says
--   which ones exist so the page can offer them behind the pop-up.

-- ---------------------------------------------------------------------------
-- Leads: the visitor's answers and a preferred callback time
-- ---------------------------------------------------------------------------
alter table public.enquiries
  add column answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) < 2000),
  add column callback_at timestamptz;

-- ---------------------------------------------------------------------------
-- Questions shown in the pop-up (Admin → Settings)
-- ---------------------------------------------------------------------------
alter table public.site_settings
  add column lead_questions jsonb not null default '[
    {"id": "timeline", "label": "When are you planning to move?", "options": ["Immediately", "Within 3 months", "3–6 months", "Just exploring"]},
    {"id": "purpose", "label": "Is it for yourself or an investment?", "options": ["To live in", "Investment", "Both"]},
    {"id": "loan", "label": "Will you need a home loan?", "options": ["Yes", "No", "Not sure"]}
  ]'::jsonb
    check (jsonb_typeof(lead_questions) = 'array' and jsonb_array_length(lead_questions) <= 3 and pg_column_size(lead_questions) < 4000);

-- ---------------------------------------------------------------------------
-- Brochures
-- ---------------------------------------------------------------------------
alter table public.listings
  add column brochure_key text check (brochure_key is null or (char_length(brochure_key) <= 300 and brochure_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'));

-- Public bucket, but file names are random and only released after the pop-up.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-brochures', 'listing-brochures', true, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "Listers and the team upload brochures" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listing-brochures'
    and (select app.can_edit_listing(((storage.foldername(name))[1])::uuid))
  );
create policy "Listers and the team replace brochures" on storage.objects for update to authenticated
  using (bucket_id = 'listing-brochures' and (select app.can_edit_listing(((storage.foldername(name))[1])::uuid)));
create policy "Listers and the team remove brochures" on storage.objects for delete to authenticated
  using (bucket_id = 'listing-brochures' and (select app.can_edit_listing(((storage.foldername(name))[1])::uuid)));

-- Set or clear a property's brochure (owners while editable, builders, the team). The file must
-- already be uploaded into the property's folder.
create function public.set_listing_brochure(p_listing_id uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require(app.can_edit_listing(p_listing_id) or app.is_staff(), 'You cannot change this property');
  if p_key is not null then
    perform app.require_state(split_part(p_key, '/', 1) = p_listing_id::text, 'The brochure belongs to another property');
    perform app.require_state(
      exists (select 1 from storage.objects o where o.bucket_id = 'listing-brochures' and o.name = p_key),
      'Upload the brochure first');
  end if;
  update public.listings set brochure_key = p_key where id = p_listing_id;
end;
$$;
revoke all on function public.set_listing_brochure(uuid, text) from public, anon;
grant execute on function public.set_listing_brochure(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Public contact details: say what exists, never the values themselves
-- ---------------------------------------------------------------------------
drop function public.get_listing_contact(uuid);
create function public.get_listing_contact(p_listing_id uuid)
returns table (
  display_name text,
  agency_name text,
  phone text,
  whatsapp text,
  email text,
  contact_via_form boolean,
  has_phone boolean,
  has_whatsapp boolean,
  has_email boolean,
  has_brochure boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.listings;
  insider boolean;
  v_phone text;
  v_whatsapp text;
  v_email text;
  v_name text;
  v_agency text;
begin
  select * into l from public.listings where id = p_listing_id;
  perform app.require(found and (l.status = 'published' or app.can_manage_listing(l.id)), 'Listing not available');
  -- The lister and the team see the details directly; visitors go through the pop-up.
  insider := app.can_manage_listing(l.id);
  select c.name, c.agency, c.phone, c.whatsapp, c.email into v_name, v_agency, v_phone, v_whatsapp, v_email
  from app.listing_contact_values(l) c;
  return query select v_name, v_agency,
    case when insider then v_phone end, case when insider then v_whatsapp end, case when insider then v_email end,
    l.contact_via_form, v_phone is not null, v_whatsapp is not null, v_email is not null, l.brochure_key is not null;
end;
$$;
grant execute on function public.get_listing_contact(uuid) to anon, authenticated;

-- The lister's shown contact values (respecting show_phone / show_whatsapp / show_email).
create function app.listing_contact_values(l public.listings)
returns table (name text, agency text, phone text, whatsapp text, email text)
language sql
stable
security definer
set search_path = ''
as $$
  -- Agents show their business details; owners their own phone and email.
  select p.display_name, a.agency_name,
         case when l.show_phone then case when l.agent_id is not null then a.public_phone else p.phone end end,
         case when l.show_whatsapp then case when l.agent_id is not null then a.whatsapp else p.phone end end,
         case when l.show_email then case when l.agent_id is not null then a.public_email else u.email::text end end
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.agent_profiles a on a.user_id = p.id and l.agent_id is not null
  where p.id = coalesce(l.agent_id, l.owner_id);
$$;
revoke all on function app.listing_contact_values(public.listings) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The pop-up: save the lead, then release what was asked for
-- ---------------------------------------------------------------------------
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
  p_utm jsonb default '{}'::jsonb
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

  -- Keep only answers to the configured questions, with one of their options.
  for question in select * from jsonb_array_elements(settings.lead_questions) loop
    answer := p_answers ->> (question ->> 'id');
    if answer is not null and question -> 'options' ? answer then
      clean_answers := clean_answers || jsonb_build_object(question ->> 'label', answer);
    end if;
  end loop;

  select c.phone, c.whatsapp, c.email into v_phone, v_whatsapp, v_email from app.listing_contact_values(l) c;

  -- One lead per phone, property and kind per day: repeat clicks don't create duplicates.
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
    'brochure_key', case when p_kind = 'brochure' then l.brochure_key end,
    'phone', case when p_kind = 'contact_reveal' then v_phone end,
    'whatsapp', case when p_kind = 'contact_reveal' then v_whatsapp end,
    'email', case when p_kind = 'contact_reveal' then v_email end
  );
end;
$$;
revoke all on function public.submit_gated_lead(uuid, text, text, text, text, jsonb, timestamptz, text, text, jsonb) from public;
grant execute on function public.submit_gated_lead(uuid, text, text, text, text, jsonb, timestamptz, text, text, jsonb) to anon, authenticated;
