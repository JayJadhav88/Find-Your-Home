-- Batch 1 · Leads (partner scope "CRM"): enquiries become leads with a type (customer or
-- owner), an interest, a source (website, app, contact form, QR, campaign, referral, manual),
-- the fuller pipeline with a lost reason, an append-only activity history, call-attempt
-- logging, Contact Us leads without a listing, duplicate warnings, and the CRM manager,
-- sales agent and content manager roles.

-- ===========================================================================
-- Roles
-- ===========================================================================
create or replace function app.is_team()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role(array['moderator', 'administrator', 'support', 'marketing',
                                'crm_manager', 'sales_agent', 'content_manager']::public.app_role[]);
$$;

-- All leads (sales agents only see leads assigned to them; see app.can_see_lead).
create or replace function app.can_manage_enquiries()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role(array['moderator', 'administrator', 'support', 'crm_manager']::public.app_role[]);
$$;

create function app.can_manage_content()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role(array['administrator', 'content_manager']::public.app_role[]);
$$;

-- Team access to one lead: the whole enquiries team, or the sales agent it is assigned to.
create function app.can_see_lead(p_team_assignee uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_manage_enquiries() or (p_team_assignee = auth.uid() and app.has_role('sales_agent'));
$$;

grant execute on function app.can_manage_content(), app.can_see_lead(uuid) to anon, authenticated, service_role;

create function app.team_roles()
returns public.app_role[]
language sql
immutable
set search_path = ''
as $$
  select array['administrator', 'moderator', 'support', 'marketing', 'crm_manager', 'sales_agent', 'content_manager']::public.app_role[];
$$;

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
      not (p_role = any (app.team_roles() || array['builder']::public.app_role[]))
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

create or replace function public.admin_add_team_member(p_email text, p_role public.app_role)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  perform app.require(app.is_admin(), 'Only administrators can manage the team');
  perform app.require_state(p_role = any (app.team_roles()), 'Choose a team role');
  select id into target from auth.users where lower(email) = lower(btrim(p_email));
  perform app.require_state(found, 'No account with that email yet. Ask them to create an account first.');
  perform public.admin_set_role(target, p_role, true);
  return target;
end;
$$;

create or replace function public.admin_remove_from_team(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  team_role public.app_role;
begin
  perform app.require(app.is_admin(), 'Only administrators can manage the team');
  perform app.require_state(p_user_id <> auth.uid(), 'You cannot remove yourself from the team');
  for team_role in
    select role from public.user_roles where user_id = p_user_id and role = any (app.team_roles())
  loop
    perform public.admin_set_role(p_user_id, team_role, false);
  end loop;
end;
$$;

create or replace function public.admin_list_users(
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_kind text default null
)
returns table (
  id uuid,
  email text,
  display_name text,
  status public.account_status,
  roles public.app_role[],
  email_confirmed boolean,
  created_at timestamptz,
  listings_count bigint,
  enquiries_count bigint,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require(app.is_admin(), 'Only administrators can list users');
  return query
    select p.id, u.email::text, p.display_name, p.status,
           coalesce((select array_agg(ur.role order by ur.role) from public.user_roles ur where ur.user_id = p.id), '{}'),
           u.email_confirmed_at is not null,
           p.created_at,
           (select count(*) from public.listings l where l.owner_id = p.id),
           (select count(*) from public.enquiries e where e.sender_user_id = p.id),
           u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where (p_query is null or btrim(p_query) = ''
           or p.display_name ilike '%' || btrim(p_query) || '%'
           or u.email ilike '%' || btrim(p_query) || '%')
      and (
        p_kind is null
        or (p_kind = 'team') = exists (
          select 1 from public.user_roles r where r.user_id = p.id and r.role = any (app.team_roles()))
      )
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.enquiry_team()
returns table (id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require(app.can_manage_enquiries(), 'Only the enquiries team can see this');
  return query
    select distinct p.id, p.display_name
    from public.profiles p
    join public.user_roles r on r.user_id = p.id
    where p.status = 'active' and r.role in ('administrator', 'moderator', 'support', 'crm_manager', 'sales_agent')
    order by p.display_name;
end;
$$;

-- Content managers edit the site's pages.
drop policy "Published content pages are public" on public.content_pages;
drop policy "Administrators manage content pages" on public.content_pages;
create policy "Published content pages are public" on public.content_pages for select to anon, authenticated
  using (is_published or (select app.can_manage_content()));
create policy "Content managers manage content pages" on public.content_pages for all to authenticated
  using ((select app.can_manage_content())) with check ((select app.can_manage_content()));

-- ===========================================================================
-- Lead fields
-- ===========================================================================
alter table public.enquiries
  alter column listing_id drop not null,
  alter column email drop not null,
  add column lead_type text not null default 'customer' check (lead_type in ('customer', 'owner')),
  -- What they want: buy, rent, new_launch, sell, rent_out, list_property, referral, other.
  add column interest text check (interest in ('buy', 'rent', 'new_launch', 'sell', 'rent_out', 'list_property', 'referral', 'other')),
  add column source text not null default 'website'
    check (source in ('website', 'app', 'contact_form', 'qr', 'referral', 'campaign', 'manual', 'organic', 'other')),
  -- utm_source / utm_medium / utm_campaign and a referral code, if any.
  add column utm jsonb not null default '{}'::jsonb check (jsonb_typeof(utm) = 'object' and pg_column_size(utm) < 2000),
  add column city text check (char_length(city) <= 100),
  add column preferred_contact text check (preferred_contact in ('phone', 'whatsapp', 'email')),
  add column property_reference text check (char_length(property_reference) <= 60),
  add column lost_reason text check (char_length(lost_reason) <= 200),
  add column first_response_at timestamptz,
  add constraint enquiries_has_contact check (email is not null or phone is not null);

create index enquiries_source_idx on public.enquiries (source, created_at desc);
create index enquiries_email_idx on public.enquiries (lower(email));

drop policy "Senders, recipients and staff read enquiries" on public.enquiries;
create policy "Senders, recipients and the team read enquiries"
  on public.enquiries for select to authenticated
  using (
    sender_user_id = (select auth.uid())
    or app.can_handle_enquiry(assigned_to, listing_id)
    or app.can_see_lead(team_assignee)
  );

drop policy "Team members read internal enquiry notes" on public.enquiry_notes;
create policy "The team reads internal notes on leads it can see"
  on public.enquiry_notes for select to authenticated
  using (exists (select 1 from public.enquiries e where e.id = enquiry_id and app.can_see_lead(e.team_assignee)));

-- New team members hear about new leads in the app by default (they can change it).
alter table public.notification_preferences alter column enquiry_alerts set default array['in_app']::text[];
update public.notification_preferences pr set enquiry_alerts = array['in_app']
where pr.enquiry_alerts = '{}'
  and exists (select 1 from public.user_roles r where r.user_id = pr.user_id
              and r.role in ('administrator', 'moderator', 'support', 'crm_manager'));

-- ===========================================================================
-- Activity history (append-only)
-- ===========================================================================
create table public.enquiry_events (
  id bigint generated always as identity primary key,
  enquiry_id uuid not null references public.enquiries (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('created', 'status', 'assigned', 'follow_up', 'contact_attempt')),
  from_value text,
  to_value text,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index enquiry_events_enquiry_idx on public.enquiry_events (enquiry_id, created_at);

alter table public.enquiry_events enable row level security;
create policy "The team reads the history of leads it can see"
  on public.enquiry_events for select to authenticated
  using (exists (select 1 from public.enquiries e where e.id = enquiry_id and app.can_see_lead(e.team_assignee)));
revoke all on public.enquiry_events from anon, authenticated;
grant select on public.enquiry_events to authenticated;

create function app.log_enquiry_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.enquiry_events (enquiry_id, actor_id, kind, to_value, note)
    values (new.id, auth.uid(), 'created', new.status::text, new.source);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.enquiry_events (enquiry_id, actor_id, kind, from_value, to_value, note)
    values (new.id, auth.uid(), 'status', old.status::text, new.status::text,
            case when new.status in ('lost', 'unqualified') then new.lost_reason end);
  end if;
  if new.team_assignee is distinct from old.team_assignee then
    insert into public.enquiry_events (enquiry_id, actor_id, kind, from_value, to_value)
    values (new.id, auth.uid(), 'assigned', old.team_assignee::text, new.team_assignee::text);
  end if;
  if new.follow_up_at is distinct from old.follow_up_at then
    insert into public.enquiry_events (enquiry_id, actor_id, kind, from_value, to_value)
    values (new.id, auth.uid(), 'follow_up', old.follow_up_at::text, new.follow_up_at::text);
  end if;
  return new;
end;
$$;

create trigger enquiries_log_changes after insert or update on public.enquiries
  for each row execute function app.log_enquiry_changes();

-- First response: the first time a lead leaves New/Assigned.
create function app.stamp_first_response()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.first_response_at is null and new.status not in ('new', 'assigned') and old.status in ('new', 'assigned') then
    new.first_response_at := now();
  end if;
  return new;
end;
$$;

create trigger enquiries_first_response before update on public.enquiries
  for each row execute function app.stamp_first_response();

-- ===========================================================================
-- Team actions
-- ===========================================================================
drop function public.admin_update_enquiry(uuid, public.enquiry_status, uuid, timestamptz);

create function public.admin_update_enquiry(
  p_enquiry_id uuid,
  p_status public.enquiry_status,
  p_team_assignee uuid,
  p_follow_up_at timestamptz,
  p_lost_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.enquiries;
  l public.listings;
  target public.enquiry_status := p_status;
  reason text := nullif(btrim(coalesce(p_lost_reason, '')), '');
begin
  select * into e from public.enquiries where id = p_enquiry_id for update;
  perform app.require(found and app.can_see_lead(e.team_assignee), 'Only the enquiries team can do that');
  -- Sales agents work their own leads but cannot hand them to someone else.
  perform app.require(
    app.can_manage_enquiries() or p_team_assignee is not distinct from e.team_assignee,
    'Only a CRM manager or administrator can reassign leads'
  );
  if p_team_assignee is not null and p_team_assignee is distinct from e.team_assignee then
    perform app.require_state(
      exists (select 1 from public.user_roles r join public.profiles p on p.id = r.user_id
              where r.user_id = p_team_assignee and p.status = 'active'
                and r.role in ('administrator', 'moderator', 'support', 'crm_manager', 'sales_agent')),
      'Leads can only be assigned to the enquiries team'
    );
  end if;
  if target in ('lost', 'unqualified') and reason is null then
    raise exception 'Choose a reason for a lost or unqualified lead' using errcode = '22023';
  end if;
  -- Assigning a new lead moves it to Assigned.
  if target = 'new' and p_team_assignee is not null then
    target := 'assigned';
  end if;

  update public.enquiries
  set status = target,
      team_assignee = p_team_assignee,
      follow_up_at = p_follow_up_at,
      lost_reason = case when target in ('lost', 'unqualified') then reason else null end,
      handled_by = case when target in ('responded', 'closed', 'spam', 'won', 'lost', 'unqualified') then auth.uid() else handled_by end,
      handled_at = case when target in ('responded', 'closed', 'spam', 'won', 'lost', 'unqualified')
                         and e.status is distinct from target then now() else handled_at end
  where id = e.id;

  perform app.audit('enquiry.update', 'enquiry', e.id::text,
    jsonb_build_object('status', e.status, 'team_assignee', e.team_assignee, 'follow_up_at', e.follow_up_at),
    jsonb_build_object('status', target, 'team_assignee', p_team_assignee, 'follow_up_at', p_follow_up_at, 'lost_reason', reason));

  if p_team_assignee is not null and p_team_assignee is distinct from e.team_assignee and p_team_assignee <> auth.uid() then
    select * into l from public.listings where id = e.listing_id;
    perform app.deliver_to_user(p_team_assignee, 'enquiry_assigned',
      jsonb_build_object('enquiry_id', e.id, 'listing_id', e.listing_id,
                         'title', coalesce(l.title, e.name), 'reference', l.reference_code));
  end if;

  if e.status is distinct from target or e.team_assignee is distinct from p_team_assignee then
    perform app.queue_sheet_sync(e.id);
  end if;
end;
$$;

create or replace function public.add_enquiry_note(p_enquiry_id uuid, p_body text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.enquiries;
  new_id bigint;
begin
  select * into e from public.enquiries where id = p_enquiry_id;
  perform app.require(found and app.can_see_lead(e.team_assignee), 'Only the enquiries team can add notes');
  insert into public.enquiry_notes (enquiry_id, author_id, body)
  values (p_enquiry_id, auth.uid(), btrim(p_body))
  returning id into new_id;
  return new_id;
end;
$$;

-- "Called, no answer" and similar, so the team sees attempts as well as real contact.
create function public.log_contact_attempt(p_enquiry_id uuid, p_outcome text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.enquiries;
begin
  select * into e from public.enquiries where id = p_enquiry_id for update;
  perform app.require(found and app.can_see_lead(e.team_assignee), 'Only the enquiries team can do that');
  perform app.require_state(
    p_outcome in ('no_answer', 'busy', 'left_message', 'wrong_number', 'contacted'), 'Unknown call outcome');
  insert into public.enquiry_events (enquiry_id, actor_id, kind, to_value, note)
  values (e.id, auth.uid(), 'contact_attempt', p_outcome, nullif(btrim(coalesce(p_note, '')), ''));
  if p_outcome = 'contacted' then
    update public.enquiries
    set status = case when status in ('new', 'assigned') then 'in_progress'::public.enquiry_status else status end,
        first_response_at = coalesce(first_response_at, now())
    where id = e.id;
  end if;
end;
$$;

-- Other leads from the same person (email or last 10 phone digits) in the last 90 days.
create function public.admin_enquiry_duplicates(p_enquiry_id uuid)
returns table (id uuid, created_at timestamptz, status public.enquiry_status, listing_title text, source text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.enquiries;
  digits text;
begin
  select * into e from public.enquiries where enquiries.id = p_enquiry_id;
  perform app.require(found and app.can_see_lead(e.team_assignee), 'Only the enquiries team can see this');
  digits := right(regexp_replace(coalesce(e.phone, ''), '[^0-9]', '', 'g'), 10);
  return query
    select o.id, o.created_at, o.status, l.title, o.source
    from public.enquiries o
    left join public.listings l on l.id = o.listing_id
    where o.id <> e.id
      and o.created_at > e.created_at - interval '90 days'
      and ((e.email is not null and lower(o.email) = lower(e.email))
           or (length(digits) >= 7 and right(regexp_replace(coalesce(o.phone, ''), '[^0-9]', '', 'g'), 10) = digits))
    order by o.created_at desc
    limit 20;
end;
$$;

-- ===========================================================================
-- Capturing leads
-- ===========================================================================
create function app.clean_utm(p_utm jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(key, left(value, 100)), '{}'::jsonb)
  from jsonb_each_text(coalesce(p_utm, '{}'::jsonb))
  where key in ('utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ref');
$$;

drop function public.submit_enquiry(uuid, text, text, text, text, public.enquiry_kind, timestamptz, text, text);

create function public.submit_enquiry(
  p_listing_id uuid,
  p_name text,
  p_email text,
  p_message text,
  p_phone text default null,
  p_kind public.enquiry_kind default 'enquiry',
  p_requested_visit_at timestamptz default null,
  p_requested_timezone text default null,
  p_consent_text_version text default null,
  p_source text default 'website',
  p_utm jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings;
  settings public.site_settings := app.settings();
  ip text := app.request_ip_hash();
  recipient uuid;
  new_id uuid;
  src text := case when p_source in ('website', 'app', 'qr', 'referral', 'campaign', 'organic') then p_source else 'website' end;
begin
  select * into l from public.listings where id = p_listing_id;
  perform app.require_state(found and l.status = 'published', 'This property is not accepting enquiries');
  perform app.require_state(l.contact_via_form, 'This lister does not accept enquiries through the form');

  if p_kind = 'visit_request' then
    if p_requested_visit_at is null or p_requested_visit_at <= now() then
      raise exception 'Choose a visit time in the future' using errcode = '22023';
    end if;
    if p_requested_timezone is null
       or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_requested_timezone) then
      raise exception 'A valid time zone is required for visit requests' using errcode = '22023';
    end if;
  end if;

  perform app.check_rate_limit(
    'enquiry:' || coalesce(auth.uid()::text, ip, 'anonymous'),
    settings.enquiry_limit_per_hour,
    interval '1 hour'
  );

  recipient := case
    when l.agent_id is not null then l.agent_id
    when settings.owner_leads_enabled then l.owner_id
  end;

  insert into public.enquiries (
    listing_id, sender_user_id, name, email, phone, message, kind,
    requested_visit_at, requested_timezone, visit_status, consent_text_version, ip_hash, assigned_to,
    lead_type, interest, source, utm
  ) values (
    l.id, auth.uid(), btrim(p_name), lower(btrim(p_email)), nullif(btrim(p_phone), ''), btrim(p_message), p_kind,
    case when p_kind = 'visit_request' then p_requested_visit_at end,
    case when p_kind = 'visit_request' then p_requested_timezone end,
    case when p_kind = 'visit_request' then 'requested'::public.visit_status end,
    p_consent_text_version, ip, recipient,
    'customer',
    case when l.category = 'new_project' then 'new_launch' when l.purpose = 'rent' then 'rent' else 'buy' end,
    case when coalesce(app.clean_utm(p_utm) ->> 'ref', '') <> '' then 'referral'
         when coalesce(app.clean_utm(p_utm) ->> 'utm_campaign', '') <> '' then 'campaign'
         else src end,
    app.clean_utm(p_utm)
  )
  returning id into new_id;

  if recipient is not null then
    perform app.enqueue_notification('enquiry_received', recipient, null,
      jsonb_build_object('enquiry_id', new_id, 'listing_id', l.id, 'reference', l.reference_code,
                         'title', l.title, 'kind', p_kind));
  elsif settings.contact_email is not null then
    perform app.enqueue_notification('enquiry_received', null, settings.contact_email,
      jsonb_build_object('enquiry_id', new_id, 'listing_id', l.id, 'reference', l.reference_code,
                         'title', l.title, 'kind', p_kind));
  end if;

  perform app.alert_team('enquiry_alert',
    jsonb_build_object('enquiry_id', new_id, 'listing_id', l.id, 'reference', l.reference_code,
                       'title', l.title, 'kind', p_kind, 'name', btrim(p_name)),
    'enquiry');
  perform app.queue_sheet_sync(new_id);

  return new_id;
end;
$$;

-- Contact Us: a lead that may not be about a specific listing. Owners who want to sell, rent
-- out or list a property become owner leads.
create function public.submit_contact_lead(
  p_name text,
  p_email text,
  p_phone text,
  p_interest text,
  p_message text,
  p_city text default null,
  p_preferred_contact text default null,
  p_property_reference text default null,
  p_consent_text_version text default null,
  p_source text default 'contact_form',
  p_utm jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ip text := app.request_ip_hash();
  new_id uuid;
  email_value text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  phone_value text := nullif(btrim(coalesce(p_phone, '')), '');
  utm jsonb := app.clean_utm(p_utm);
begin
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 100 then
    raise exception 'Please enter your name' using errcode = '22023';
  end if;
  if email_value is null and phone_value is null then
    raise exception 'Please give a phone number or an email address' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_message, ''))) not between 1 and 5000 then
    raise exception 'Please write a short message' using errcode = '22023';
  end if;
  if p_consent_text_version is null then
    raise exception 'Please agree to be contacted about this enquiry' using errcode = '22023';
  end if;

  perform app.check_rate_limit('contact:' || coalesce(auth.uid()::text, ip, 'anonymous'), 5, interval '1 hour');

  insert into public.enquiries (
    listing_id, sender_user_id, name, email, phone, message, kind, consent_text_version, ip_hash,
    lead_type, interest, source, utm, city, preferred_contact, property_reference
  ) values (
    null, auth.uid(), btrim(p_name), email_value, phone_value, btrim(p_message), 'enquiry', p_consent_text_version, ip,
    case when p_interest in ('sell', 'rent_out', 'list_property') then 'owner' else 'customer' end,
    case when p_interest in ('buy', 'rent', 'new_launch', 'sell', 'rent_out', 'list_property', 'referral', 'other')
         then p_interest else 'other' end,
    case when coalesce(utm ->> 'ref', '') <> '' then 'referral'
         when coalesce(utm ->> 'utm_campaign', '') <> '' then 'campaign'
         when p_source in ('contact_form', 'app', 'qr') then p_source
         else 'contact_form' end,
    utm,
    nullif(left(btrim(coalesce(p_city, '')), 100), ''),
    case when p_preferred_contact in ('phone', 'whatsapp', 'email') then p_preferred_contact end,
    nullif(left(btrim(coalesce(p_property_reference, '')), 60), '')
  )
  returning id into new_id;

  perform app.alert_team('enquiry_alert',
    jsonb_build_object('enquiry_id', new_id, 'title', 'Contact form', 'kind', 'enquiry', 'name', btrim(p_name)),
    'enquiry');
  perform app.queue_sheet_sync(new_id);
  return new_id;
end;
$$;

-- Team members record leads from calls, walk-ins and other channels.
create function public.admin_create_lead(
  p_name text,
  p_email text,
  p_phone text,
  p_interest text,
  p_message text,
  p_source text default 'manual',
  p_listing_id uuid default null,
  p_city text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  perform app.require(app.can_manage_enquiries() or app.has_role('sales_agent'), 'Only the enquiries team can add leads');
  if nullif(btrim(coalesce(p_email, '')), '') is null and nullif(btrim(coalesce(p_phone, '')), '') is null then
    raise exception 'Add a phone number or an email address' using errcode = '22023';
  end if;
  insert into public.enquiries (
    listing_id, name, email, phone, message, kind, lead_type, interest, source, city, team_assignee, status
  ) values (
    p_listing_id, btrim(p_name), nullif(lower(btrim(coalesce(p_email, ''))), ''), nullif(btrim(coalesce(p_phone, '')), ''),
    coalesce(nullif(btrim(coalesce(p_message, '')), ''), '(added by the team)'), 'enquiry',
    case when p_interest in ('sell', 'rent_out', 'list_property') then 'owner' else 'customer' end,
    case when p_interest in ('buy', 'rent', 'new_launch', 'sell', 'rent_out', 'list_property', 'referral', 'other')
         then p_interest else 'other' end,
    case when p_source in ('manual', 'referral', 'campaign', 'organic', 'qr', 'other') then p_source else 'manual' end,
    nullif(left(btrim(coalesce(p_city, '')), 100), ''),
    case when app.has_role('sales_agent') and not app.can_manage_enquiries() then auth.uid() end,
    case when app.has_role('sales_agent') and not app.can_manage_enquiries() then 'assigned'::public.enquiry_status else 'new' end
  )
  returning id into new_id;
  perform app.audit('enquiry.create', 'enquiry', new_id::text);
  perform app.queue_sheet_sync(new_id);
  return new_id;
end;
$$;

revoke execute on function
  app.log_enquiry_changes(), app.clean_utm(jsonb)
  from public, anon, authenticated;
revoke execute on function
  public.admin_update_enquiry(uuid, public.enquiry_status, uuid, timestamptz, text),
  public.log_contact_attempt(uuid, text, text),
  public.admin_enquiry_duplicates(uuid),
  public.admin_create_lead(text, text, text, text, text, text, uuid, text)
  from public, anon;
grant execute on function
  public.submit_enquiry(uuid, text, text, text, text, public.enquiry_kind, timestamptz, text, text, text, jsonb),
  public.submit_contact_lead(text, text, text, text, text, text, text, text, text, text, jsonb)
  to anon, authenticated;

-- CRM managers also get new-lead alerts (sales agents hear about leads assigned to them).
create or replace function app.alert_team(p_kind text, p_data jsonb, p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member record;
begin
  for member in
    select distinct p.id,
           case p_event when 'enquiry' then pr.enquiry_alerts else pr.review_alerts end as alerts
    from public.profiles p
    join public.user_roles r on r.user_id = p.id
    join public.notification_preferences pr on pr.user_id = p.id
    where p.status = 'active'
      and r.role = any (
        case p_event
          when 'enquiry' then array['administrator', 'moderator', 'support', 'crm_manager']::public.app_role[]
          else array['administrator', 'moderator']::public.app_role[]
        end)
  loop
    if cardinality(member.alerts) > 0 then
      perform app.deliver_to_user(
        member.id, p_kind, p_data,
        coalesce((select array_agg(a::public.notification_channel) from unnest(member.alerts) a where a <> 'in_app'),
                 array[]::public.notification_channel[]),
        'in_app' = any (member.alerts)
      );
    end if;
  end loop;
end;
$$;
