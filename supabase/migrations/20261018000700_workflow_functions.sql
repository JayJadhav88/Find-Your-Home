-- Workflow functions (RPC). These are the ONLY way to change listing status, roles,
-- account status and enquiry state. Web and mobile both call them, so the rules live
-- in one place. Error codes: 42501 -> 401/403, PT409 -> 409 (invalid state),
-- PT429 -> 429 (rate limited), 22023 -> 400 (invalid input).

create function app.require(condition boolean, message text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if condition is not true then
    raise exception '%', message using errcode = '42501';
  end if;
end;
$$;

create function app.require_state(condition boolean, message text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if condition is not true then
    raise exception '%', message using errcode = 'PT409';
  end if;
end;
$$;

grant execute on function app.require(boolean, text), app.require_state(boolean, text)
  to anon, authenticated, service_role;

-- Notify every active staff member with the given role.
create function app.notify_role(p_role public.app_role, p_template text, p_data jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification_outbox (template, recipient_user_id, template_data)
  select p_template, ur.user_id, p_data
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id and p.status = 'active'
  where ur.role = p_role;
$$;

revoke execute on function app.notify_role(public.app_role, text, jsonb) from public, anon, authenticated;

-- ===========================================================================
-- Accounts and roles
-- ===========================================================================

-- A verified member opts in to listing property (if self-service is enabled).
create function public.become_owner()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require(auth.uid() is not null and app.is_active_user(), 'Sign in to list a property');
  perform app.require(app.is_email_verified(), 'Verify your email address before listing a property');
  perform app.require((app.settings()).self_service_owner, 'Listing accounts are created by invitation only');

  insert into public.user_roles (user_id, role, granted_by)
  values (auth.uid(), 'owner', auth.uid())
  on conflict do nothing;
end;
$$;

create function public.admin_set_role(p_user_id uuid, p_role public.app_role, p_granted boolean)
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
      p_role not in ('moderator', 'administrator')
        or exists (select 1 from auth.users where id = p_user_id and email_confirmed_at is not null),
      'Staff roles require a verified email address'
    );
    insert into public.user_roles (user_id, role, granted_by)
    values (p_user_id, p_role, auth.uid())
    on conflict do nothing;

    if p_role = 'agent' then
      insert into public.agent_profiles (user_id) values (p_user_id) on conflict do nothing;
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

create function public.admin_set_account_status(p_user_id uuid, p_status public.account_status, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous public.account_status;
begin
  perform app.require(app.is_admin(), 'Only administrators can change account status');
  perform app.require_state(p_user_id <> auth.uid(), 'You cannot change your own account status');

  select status into previous from public.profiles where id = p_user_id for update;
  perform app.require_state(found, 'User not found');

  update public.profiles set status = p_status where id = p_user_id;

  -- Block sign-in and token refresh for suspended accounts; end existing sessions.
  if p_status = 'suspended' then
    update auth.users set banned_until = 'infinity' where id = p_user_id;
    delete from auth.sessions where user_id = p_user_id;
  elsif p_status = 'active' then
    update auth.users set banned_until = null where id = p_user_id;
  end if;

  perform app.audit(
    'account.status', 'user', p_user_id::text,
    jsonb_build_object('status', previous),
    jsonb_build_object('status', p_status, 'reason', p_reason)
  );
end;
$$;

create function public.request_data_export()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid;
begin
  perform app.require(auth.uid() is not null, 'Sign in first');
  insert into public.data_requests (user_id, kind) values (auth.uid(), 'export')
  on conflict do nothing
  returning id into request_id;
  perform app.require_state(request_id is not null, 'An export request is already open');
  perform app.notify_role('administrator', 'data_request_created', jsonb_build_object('kind', 'export'));
  return request_id;
end;
$$;

create function public.request_account_deletion()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid;
begin
  perform app.require(auth.uid() is not null, 'Sign in first');
  insert into public.data_requests (user_id, kind) values (auth.uid(), 'deletion')
  on conflict do nothing
  returning id into request_id;
  perform app.require_state(request_id is not null, 'A deletion request is already open');
  update public.profiles set status = 'deletion_requested' where id = auth.uid() and status = 'active';
  perform app.notify_role('administrator', 'data_request_created', jsonb_build_object('kind', 'deletion'));
  return request_id;
end;
$$;

-- First administrator. Callable ONLY with the service-role key (scripts/admin-bootstrap.mjs).
create function public.bootstrap_admin(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  select id into target
  from auth.users
  where lower(email) = lower(btrim(p_email)) and email_confirmed_at is not null;

  if target is null then
    raise exception 'No verified account with that email. Sign up and confirm the email first.'
      using errcode = 'PT409';
  end if;

  insert into public.user_roles (user_id, role) values (target, 'administrator') on conflict do nothing;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, after)
  values (null, 'role.bootstrap_admin', 'user', target::text, jsonb_build_object('role', 'administrator'));
  return target;
end;
$$;

revoke execute on function public.bootstrap_admin(text) from public, anon, authenticated;
grant execute on function public.bootstrap_admin(text) to service_role;

-- ===========================================================================
-- Listing lifecycle
-- ===========================================================================

create function app.listing_missing_fields(l public.listings)
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
         then 'cover photo' end
  ], null);
$$;

revoke execute on function app.listing_missing_fields(public.listings) from public, anon;

create function app.lock_listing(p_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings;
begin
  select * into l from public.listings where id = p_listing_id for update;
  if not found then
    raise exception 'Listing not found' using errcode = 'PT409';
  end if;
  return l;
end;
$$;

revoke execute on function app.lock_listing(uuid) from public, anon;

create function public.submit_listing(p_listing_id uuid)
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
  perform app.notify_role('moderator', 'listing_submitted',
    jsonb_build_object('listing_id', l.id, 'reference', l.reference_code, 'title', l.title));
  return 'pending_review';
end;
$$;

create function public.withdraw_listing(p_listing_id uuid)
returns public.listing_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings := app.lock_listing(p_listing_id);
begin
  perform app.require(
    app.is_active_user() and (l.owner_id = auth.uid() or (l.agent_id = auth.uid() and app.has_role('agent'))),
    'You can only withdraw your own listings'
  );
  perform app.require_state(l.status = 'pending_review', 'Only listings awaiting review can be withdrawn');

  update public.listings set status = 'draft', submitted_at = null where id = l.id;
  perform app.log_listing_status(l.id, l.status, 'draft', 'Withdrawn by the lister');
  return 'draft';
end;
$$;

create function public.moderate_listing(
  p_listing_id uuid,
  p_decision text,
  p_reason text default null,
  p_reason_visible_to_owner boolean default true
)
returns public.listing_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings := app.lock_listing(p_listing_id);
  target public.listing_status;
  reason text := nullif(btrim(p_reason), '');
begin
  perform app.require(app.is_staff(), 'Only moderators can review listings');

  case p_decision
    when 'approve' then
      perform app.require_state(l.status = 'pending_review', 'Only listings awaiting review can be approved');
      perform app.require_state(cardinality(app.listing_missing_fields(l)) = 0, 'Listing is incomplete');
      target := 'published';
    when 'reject' then
      perform app.require_state(l.status = 'pending_review', 'Only listings awaiting review can be rejected');
      target := 'rejected';
    when 'suspend' then
      perform app.require_state(l.status = 'published', 'Only published listings can be suspended');
      target := 'suspended';
    when 'reinstate' then
      perform app.require_state(l.status = 'suspended', 'Only suspended listings can be reinstated');
      target := 'published';
    else
      raise exception 'Unknown decision %', p_decision using errcode = '22023';
  end case;

  if p_decision in ('reject', 'suspend') and reason is null then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  update public.listings
  set status = target,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      published_at = case when target = 'published' then now() else null end,
      first_published_at = case when target = 'published' then coalesce(first_published_at, now()) else first_published_at end,
      is_featured = case when target = 'published' then is_featured else false end,
      featured_until = case when target = 'published' then featured_until else null end
  where id = l.id;

  perform app.log_listing_status(l.id, l.status, target, reason, p_reason_visible_to_owner);
  perform app.audit('listing.' || p_decision, 'listing', l.id::text,
    jsonb_build_object('status', l.status), jsonb_build_object('status', target, 'reason', reason));
  perform app.enqueue_notification('listing_decision', l.owner_id, null, jsonb_build_object(
    'listing_id', l.id, 'reference', l.reference_code, 'title', l.title, 'decision', p_decision,
    'reason', case when p_reason_visible_to_owner then reason end));
  return target;
end;
$$;

create function public.set_listing_outcome(p_listing_id uuid, p_outcome public.listing_status)
returns public.listing_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings := app.lock_listing(p_listing_id);
  is_lister boolean := app.is_active_user()
    and (l.owner_id = auth.uid() or (l.agent_id = auth.uid() and app.has_role('agent')));
begin
  perform app.require(is_lister or app.is_admin(), 'You can only update your own listings');

  case p_outcome
    when 'sold' then
      perform app.require_state(l.purpose = 'sale' and l.status = 'published', 'Only published sale listings can be marked sold');
    when 'rented' then
      perform app.require_state(l.purpose = 'rent' and l.status = 'published', 'Only published rental listings can be marked rented');
    when 'archived' then
      perform app.require_state(l.status <> 'archived', 'Listing is already archived');
      perform app.require_state(l.status <> 'suspended' or app.is_admin(), 'Suspended listings can only be archived by an administrator');
    else
      raise exception 'Outcome must be sold, rented or archived' using errcode = '22023';
  end case;

  update public.listings
  set status = p_outcome,
      published_at = null,
      is_featured = false,
      featured_until = null,
      archived_at = case when p_outcome = 'archived' then now() else archived_at end
  where id = l.id;

  perform app.log_listing_status(l.id, l.status, p_outcome);
  if not is_lister then
    perform app.audit('listing.' || p_outcome, 'listing', l.id::text,
      jsonb_build_object('status', l.status), jsonb_build_object('status', p_outcome));
  end if;
  return p_outcome;
end;
$$;

create function public.restore_listing(p_listing_id uuid)
returns public.listing_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings := app.lock_listing(p_listing_id);
begin
  perform app.require(
    app.is_admin() or (app.is_active_user() and l.owner_id = auth.uid()),
    'You can only restore your own listings'
  );
  perform app.require_state(l.status in ('archived', 'sold', 'rented'), 'Only archived, sold or rented listings can be restored');

  update public.listings set status = 'draft', archived_at = null, submitted_at = null where id = l.id;
  perform app.log_listing_status(l.id, l.status, 'draft', 'Restored to draft');
  return 'draft';
end;
$$;

create function public.set_listing_featured(p_listing_id uuid, p_featured boolean, p_until timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings := app.lock_listing(p_listing_id);
begin
  perform app.require(app.is_admin(), 'Only administrators can feature listings');
  perform app.require_state(not p_featured or l.status = 'published', 'Only published listings can be featured');
  perform app.require_state(p_until is null or p_until > now(), 'Featured end date must be in the future');

  update public.listings
  set is_featured = p_featured, featured_until = case when p_featured then p_until end
  where id = l.id;

  perform app.audit(case when p_featured then 'listing.feature' else 'listing.unfeature' end,
    'listing', l.id::text, jsonb_build_object('is_featured', l.is_featured),
    jsonb_build_object('is_featured', p_featured, 'until', p_until));
end;
$$;

create function public.assign_listing_agent(p_listing_id uuid, p_agent_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings := app.lock_listing(p_listing_id);
begin
  perform app.require(app.is_admin(), 'Only administrators can assign agents');
  perform app.require_state(
    p_agent_id is null or exists (select 1 from public.user_roles where user_id = p_agent_id and role = 'agent'),
    'That user is not an agent'
  );

  update public.listings set agent_id = p_agent_id where id = l.id;
  perform app.audit('listing.assign_agent', 'listing', l.id::text,
    jsonb_build_object('agent_id', l.agent_id), jsonb_build_object('agent_id', p_agent_id));
end;
$$;

-- Moderation history for the lister: hides reasons marked staff-only.
create function public.get_listing_history(p_listing_id uuid)
returns table (from_status public.listing_status, to_status public.listing_status, reason text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require(app.can_manage_listing(p_listing_id), 'Not allowed');
  return query
    select e.from_status, e.to_status,
           case when e.reason_visible_to_owner or app.is_staff() then e.reason end,
           e.created_at
    from public.listing_status_events e
    where e.listing_id = p_listing_id
    order by e.created_at desc, e.id desc;
end;
$$;

-- Contact details for a public listing, limited to what the lister chose to show.
create function public.get_listing_contact(p_listing_id uuid)
returns table (
  display_name text,
  agency_name text,
  phone text,
  whatsapp text,
  email text,
  contact_via_form boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.listings;
  agent public.agent_profiles;
begin
  select * into l from public.listings where id = p_listing_id;
  perform app.require(found and (l.status = 'published' or app.can_manage_listing(l.id)), 'Listing not available');

  if l.agent_id is not null then
    select * into agent from public.agent_profiles where user_id = l.agent_id;
    return query
      select p.display_name, agent.agency_name,
             case when l.show_phone then agent.public_phone end,
             case when l.show_whatsapp then agent.whatsapp end,
             case when l.show_email then agent.public_email end,
             l.contact_via_form
      from public.profiles p where p.id = l.agent_id;
  else
    return query
      select p.display_name, null::text,
             case when l.show_phone then p.phone end,
             case when l.show_whatsapp then p.phone end,
             case when l.show_email then u.email::text end,
             l.contact_via_form
      from public.profiles p join auth.users u on u.id = p.id
      where p.id = l.owner_id;
  end if;
end;
$$;

-- ===========================================================================
-- Enquiries and visit requests
-- ===========================================================================

create function public.submit_enquiry(
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

  return new_id;
end;
$$;

create function public.update_enquiry_status(p_enquiry_id uuid, p_status public.enquiry_status)
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

  if app.is_staff() and e.assigned_to is distinct from auth.uid() then
    perform app.audit('enquiry.status', 'enquiry', e.id::text,
      jsonb_build_object('status', e.status), jsonb_build_object('status', p_status));
  end if;
end;
$$;

create function public.respond_to_visit(p_enquiry_id uuid, p_confirm boolean)
returns public.visit_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.enquiries;
  result public.visit_status := case when p_confirm then 'confirmed' else 'declined' end;
begin
  select * into e from public.enquiries where id = p_enquiry_id for update;
  perform app.require(found and app.can_handle_enquiry(e.assigned_to, e.listing_id), 'Not allowed');
  perform app.require_state(e.kind = 'visit_request' and e.visit_status = 'requested', 'Only pending visit requests can be answered');

  update public.enquiries
  set visit_status = result, status = 'responded', handled_by = auth.uid(), handled_at = now()
  where id = e.id;

  perform app.enqueue_notification('visit_response', e.sender_user_id,
    case when e.sender_user_id is null then e.email end,
    jsonb_build_object('enquiry_id', e.id, 'listing_id', e.listing_id, 'visit_status', result,
                       'requested_visit_at', e.requested_visit_at, 'requested_timezone', e.requested_timezone));
  return result;
end;
$$;

create function public.cancel_visit_request(p_enquiry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.enquiries;
begin
  select * into e from public.enquiries where id = p_enquiry_id for update;
  perform app.require(found and e.sender_user_id = auth.uid(), 'Not allowed');
  perform app.require_state(e.kind = 'visit_request' and e.visit_status in ('requested', 'confirmed'),
    'This visit request cannot be cancelled');

  update public.enquiries set visit_status = 'cancelled' where id = e.id;

  if e.assigned_to is not null then
    perform app.enqueue_notification('visit_cancelled', e.assigned_to, null,
      jsonb_build_object('enquiry_id', e.id, 'listing_id', e.listing_id));
  end if;
end;
$$;

-- Workflow RPCs are for signed-in users, except the public enquiry form and contact lookup.
revoke execute on function
  public.become_owner(),
  public.admin_set_role(uuid, public.app_role, boolean),
  public.admin_set_account_status(uuid, public.account_status, text),
  public.request_data_export(),
  public.request_account_deletion(),
  public.submit_listing(uuid),
  public.withdraw_listing(uuid),
  public.moderate_listing(uuid, text, text, boolean),
  public.set_listing_outcome(uuid, public.listing_status),
  public.restore_listing(uuid),
  public.set_listing_featured(uuid, boolean, timestamptz),
  public.assign_listing_agent(uuid, uuid),
  public.get_listing_history(uuid),
  public.update_enquiry_status(uuid, public.enquiry_status),
  public.respond_to_visit(uuid, boolean),
  public.cancel_visit_request(uuid)
  from public, anon;
