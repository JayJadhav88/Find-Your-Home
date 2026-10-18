-- Enquiry management for the team: pipeline status, team owner, follow-up date, internal
-- notes; per-person alerts for new enquiries and listings to review (in app, email, push,
-- WhatsApp); and a copy of every enquiry in a Google Sheet through an Apps Script webhook.

-- ---------------------------------------------------------------------------
-- Pipeline fields and internal notes
-- ---------------------------------------------------------------------------
alter table public.enquiries
  add column team_assignee uuid references public.profiles (id) on delete set null,
  add column follow_up_at timestamptz;

create index enquiries_team_idx on public.enquiries (team_assignee, status, created_at desc);
create index enquiries_follow_up_idx on public.enquiries (follow_up_at) where follow_up_at is not null;

create table public.enquiry_notes (
  id bigint generated always as identity primary key,
  enquiry_id uuid not null references public.enquiries (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index enquiry_notes_enquiry_idx on public.enquiry_notes (enquiry_id, created_at);

alter table public.enquiry_notes enable row level security;
create policy "Team members read internal enquiry notes"
  on public.enquiry_notes for select to authenticated
  using ((select app.can_manage_enquiries()));
revoke all on public.enquiry_notes from anon, authenticated;
grant select on public.enquiry_notes to authenticated;

-- ---------------------------------------------------------------------------
-- Alert preferences for team members: which channels for which events.
-- 'in_app' plus any notification channel.
-- ---------------------------------------------------------------------------
alter table public.notification_preferences
  add column enquiry_alerts text[] not null default array[]::text[]
    check (enquiry_alerts <@ array['in_app', 'email', 'push', 'whatsapp']),
  add column review_alerts text[] not null default array['in_app', 'email', 'push']
    check (review_alerts <@ array['in_app', 'email', 'push', 'whatsapp']);

grant update (enquiry_alerts, review_alerts) on public.notification_preferences to authenticated;

-- p_event: 'enquiry' (people who handle enquiries) or 'review' (people who review listings).
create function app.alert_team(p_kind text, p_data jsonb, p_event text)
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
          when 'enquiry' then array['administrator', 'moderator', 'support']::public.app_role[]
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

-- ---------------------------------------------------------------------------
-- Google Sheets sync (job for the process-jobs worker)
-- ---------------------------------------------------------------------------
alter table public.job_queue drop constraint job_queue_kind_check;
alter table public.job_queue add constraint job_queue_kind_check
  check (kind in ('publish_listing_media', 'unpublish_listing_media', 'import_listing_images', 'sync_enquiry_sheet'));

create function app.queue_sheet_sync(p_enquiry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.integration_settings where id and sheets_enabled and sheets_webhook_url is not null) then
    insert into public.job_queue (kind, listing_id, payload)
    select 'sync_enquiry_sheet', e.listing_id, jsonb_build_object('enquiry_id', e.id)
    from public.enquiries e where e.id = p_enquiry_id;
  end if;
end;
$$;

-- Sends every enquiry (up to 5,000, newest first) to the sheet, e.g. after connecting it.
create function public.admin_sync_all_enquiries_to_sheet()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued integer;
begin
  perform app.require(app.is_admin(), 'Only administrators can sync the sheet');
  perform app.require_state(
    exists (select 1 from public.integration_settings where id and sheets_enabled and sheets_webhook_url is not null),
    'Connect and switch on Google Sheets first'
  );
  perform app.check_rate_limit('sheet-sync:' || auth.uid(), 5, interval '1 hour');
  insert into public.job_queue (kind, listing_id, payload)
  select 'sync_enquiry_sheet', e.listing_id, jsonb_build_object('enquiry_id', e.id)
  from (select id, listing_id from public.enquiries order by created_at desc limit 5000) e;
  get diagnostics queued = row_count;
  perform app.audit('integration.sheet_sync_all', 'integration', 'sheets', null, jsonb_build_object('queued', queued));
  return queued;
end;
$$;

-- A new shared secret for the Apps Script. Returned once; stored encrypted.
create function public.admin_new_sheets_secret()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  value text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  perform app.require(app.is_admin(), 'Only administrators can change integrations');
  perform public.admin_set_integration_secret('sheets_webhook_secret', value);
  return value;
end;
$$;

-- ---------------------------------------------------------------------------
-- Team actions on an enquiry
-- ---------------------------------------------------------------------------
create function public.admin_update_enquiry(
  p_enquiry_id uuid,
  p_status public.enquiry_status,
  p_team_assignee uuid,
  p_follow_up_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.enquiries;
  l public.listings;
begin
  perform app.require(app.can_manage_enquiries(), 'Only the enquiries team can do that');
  select * into e from public.enquiries where id = p_enquiry_id for update;
  perform app.require_state(found, 'Enquiry not found');
  if p_team_assignee is not null then
    perform app.require_state(
      exists (select 1 from public.user_roles r join public.profiles p on p.id = r.user_id
              where r.user_id = p_team_assignee and p.status = 'active'
                and r.role in ('administrator', 'moderator', 'support')),
      'Enquiries can only be assigned to the enquiries team'
    );
  end if;

  update public.enquiries
  set status = p_status,
      team_assignee = p_team_assignee,
      follow_up_at = p_follow_up_at,
      handled_by = case when p_status in ('responded', 'closed', 'spam') then auth.uid() else handled_by end,
      handled_at = case when p_status in ('responded', 'closed', 'spam') and e.status is distinct from p_status then now() else handled_at end
  where id = e.id;

  perform app.audit('enquiry.update', 'enquiry', e.id::text,
    jsonb_build_object('status', e.status, 'team_assignee', e.team_assignee, 'follow_up_at', e.follow_up_at),
    jsonb_build_object('status', p_status, 'team_assignee', p_team_assignee, 'follow_up_at', p_follow_up_at));

  if p_team_assignee is not null and p_team_assignee is distinct from e.team_assignee and p_team_assignee <> auth.uid() then
    select * into l from public.listings where id = e.listing_id;
    perform app.deliver_to_user(p_team_assignee, 'enquiry_assigned',
      jsonb_build_object('enquiry_id', e.id, 'listing_id', e.listing_id, 'title', l.title, 'reference', l.reference_code));
  end if;

  if e.status is distinct from p_status or e.team_assignee is distinct from p_team_assignee then
    perform app.queue_sheet_sync(e.id);
  end if;
end;
$$;

create function public.add_enquiry_note(p_enquiry_id uuid, p_body text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id bigint;
begin
  perform app.require(app.can_manage_enquiries(), 'Only the enquiries team can add notes');
  perform app.require_state(exists (select 1 from public.enquiries where id = p_enquiry_id), 'Enquiry not found');
  insert into public.enquiry_notes (enquiry_id, author_id, body)
  values (p_enquiry_id, auth.uid(), btrim(p_body))
  returning id into new_id;
  return new_id;
end;
$$;

-- Listers changing status also update the sheet.
create or replace function public.update_enquiry_status(p_enquiry_id uuid, p_status public.enquiry_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.enquiries;
begin
  select * into e from public.enquiries where id = p_enquiry_id for update;
  perform app.require(found and app.can_handle_enquiry(e.assigned_to, e.listing_id), 'Not allowed');

  update public.enquiries
  set status = p_status,
      handled_by = case when p_status in ('responded', 'closed', 'spam') then auth.uid() else handled_by end,
      handled_at = case when p_status in ('responded', 'closed', 'spam') then now() else handled_at end
  where id = e.id;

  if app.can_manage_enquiries() and e.assigned_to is distinct from auth.uid() then
    perform app.audit('enquiry.status', 'enquiry', e.id::text,
      jsonb_build_object('status', e.status), jsonb_build_object('status', p_status));
  end if;
  if e.status is distinct from p_status then
    perform app.queue_sheet_sync(e.id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- New enquiries alert the team and go to the sheet; new submissions alert reviewers.
-- Same functions as before plus those calls.
-- ---------------------------------------------------------------------------
create or replace function public.submit_enquiry(
  p_listing_id uuid,
  p_name text,
  p_email text,
  p_message text,
  p_phone text default null,
  p_kind public.enquiry_kind default 'enquiry',
  p_requested_visit_at timestamptz default null,
  p_requested_timezone text default null,
  p_consent_text_version text default null
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
    requested_visit_at, requested_timezone, visit_status, consent_text_version, ip_hash, assigned_to
  ) values (
    l.id, auth.uid(), btrim(p_name), lower(btrim(p_email)), nullif(btrim(p_phone), ''), btrim(p_message), p_kind,
    case when p_kind = 'visit_request' then p_requested_visit_at end,
    case when p_kind = 'visit_request' then p_requested_timezone end,
    case when p_kind = 'visit_request' then 'requested'::public.visit_status end,
    p_consent_text_version, ip, recipient
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
  else
    perform app.notify_role('administrator', 'enquiry_received',
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

create or replace function public.submit_listing(p_listing_id uuid)
returns public.listing_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings := app.lock_listing(p_listing_id);
  missing text[];
begin
  perform app.require(
    app.is_active_user() and (l.owner_id = auth.uid() or (l.agent_id = auth.uid() and app.has_role('agent'))),
    'You can only submit your own listings'
  );
  perform app.require(app.is_email_verified(), 'Verify your email address before submitting');
  perform app.require_state(l.status in ('draft', 'rejected'), 'Only drafts or rejected listings can be submitted');

  missing := app.listing_missing_fields(l);
  if cardinality(missing) > 0 then
    raise exception 'Listing is incomplete' using errcode = '22023', detail = array_to_string(missing, ', ');
  end if;

  perform app.check_rate_limit('submit:' || auth.uid(), (app.settings()).submission_limit_per_day, interval '1 day');

  update public.listings set status = 'pending_review', submitted_at = now() where id = l.id;
  perform app.log_listing_status(l.id, l.status, 'pending_review');
  perform app.alert_team('listing_submitted',
    jsonb_build_object('listing_id', l.id, 'reference', l.reference_code, 'title', l.title), 'review');
  perform app.deliver_to_user(auth.uid(), 'listing_received',
    jsonb_build_object('listing_id', l.id, 'reference', l.reference_code, 'title', l.title,
                       'review_hours', (app.settings()).review_hours_target),
    array['push']::public.notification_channel[]);
  return 'pending_review';
end;
$$;

revoke execute on function
  app.alert_team(text, jsonb, text),
  app.queue_sheet_sync(uuid)
  from public, anon, authenticated;
revoke execute on function
  public.admin_sync_all_enquiries_to_sheet(),
  public.admin_new_sheets_secret(),
  public.admin_update_enquiry(uuid, public.enquiry_status, uuid, timestamptz),
  public.add_enquiry_note(uuid, text)
  from public, anon;
