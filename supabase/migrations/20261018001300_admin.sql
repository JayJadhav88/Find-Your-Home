-- Admin panel support: user directory with emails, privacy-request handling, export
-- auditing, and automatic audit entries for administrator edits to reference data.

-- Users with email and roles. Emails live in auth.users, which clients cannot read.
create function public.admin_list_users(
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  email text,
  display_name text,
  status public.account_status,
  roles public.app_role[],
  email_confirmed boolean,
  created_at timestamptz,
  listings_count bigint
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
           (select count(*) from public.listings l where l.owner_id = p.id)
    from public.profiles p
    join auth.users u on u.id = p.id
    where p_query is null or btrim(p_query) = ''
       or p.display_name ilike '%' || btrim(p_query) || '%'
       or u.email ilike '%' || btrim(p_query) || '%'
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

create function public.admin_update_data_request(
  p_id uuid,
  p_status public.data_request_status,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous public.data_requests;
begin
  perform app.require(app.is_admin(), 'Only administrators can handle privacy requests');
  select * into previous from public.data_requests where id = p_id for update;
  perform app.require_state(found, 'Request not found');

  update public.data_requests
  set status = p_status,
      notes = coalesce(nullif(btrim(p_notes), ''), notes),
      handled_by = auth.uid(),
      completed_at = case when p_status in ('completed', 'rejected') then now() end
  where id = p_id;

  perform app.audit('data_request.' || p_status, 'data_request', p_id::text,
    jsonb_build_object('status', previous.status), jsonb_build_object('status', p_status));
end;
$$;

-- The web app calls this before streaming a CSV export, so every export is audited.
create function public.admin_record_export(p_kind text, p_rows integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require(app.is_admin(), 'Only administrators can export data');
  perform app.audit('export.' || p_kind, 'export', p_kind, null, jsonb_build_object('rows', p_rows));
end;
$$;

revoke execute on function
  public.admin_list_users(text, integer, integer),
  public.admin_update_data_request(uuid, public.data_request_status, text),
  public.admin_record_export(text, integer)
  from public, anon;

-- ---------------------------------------------------------------------------
-- Audit administrator edits made directly through RLS-protected tables.
-- ---------------------------------------------------------------------------
create function app.audit_admin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb := to_jsonb(coalesce(new, old));
begin
  if app.jwt_role() = 'authenticated' then
    perform app.audit(
      lower(tg_op) || '.' || tg_table_name,
      tg_table_name,
      coalesce(row_data ->> 'id', row_data ->> 'slug', row_data ->> 'code'),
      case when tg_op <> 'INSERT' then to_jsonb(old) end,
      case when tg_op <> 'DELETE' then to_jsonb(new) end
    );
  end if;
  return null;
end;
$$;

create trigger site_settings_audit after update on public.site_settings
  for each row execute function app.audit_admin_change();
create trigger currencies_audit after insert or update or delete on public.currencies
  for each row execute function app.audit_admin_change();
create trigger property_types_audit after insert or update or delete on public.property_types
  for each row execute function app.audit_admin_change();
create trigger amenities_audit after insert or update or delete on public.amenities
  for each row execute function app.audit_admin_change();
create trigger locations_audit after insert or update or delete on public.locations
  for each row execute function app.audit_admin_change();
create trigger content_pages_audit after insert or update or delete on public.content_pages
  for each row execute function app.audit_admin_change();
create trigger homepage_sections_audit after insert or update or delete on public.homepage_sections
  for each row execute function app.audit_admin_change();
create trigger landing_pages_audit after insert or update or delete on public.landing_pages
  for each row execute function app.audit_admin_change();
