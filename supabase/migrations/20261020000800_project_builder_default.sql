-- New projects added by the team (e.g. the Excel import) for a builder account were not
-- linked to that builder's directory entry. Default to it when no builder was chosen.

create or replace function app.listings_project_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  own_builder uuid;
begin
  if new.category <> 'new_project' then
    new.builder_id := null;
  elsif app.is_client_request() and not app.is_staff() then
    -- Builder accounts list their own projects under their own directory entry.
    select id into own_builder from public.builders where user_id = new.owner_id;
    if own_builder is null then
      raise exception 'Only verified builders can list new projects' using errcode = '42501';
    end if;
    new.builder_id := own_builder;
  elsif new.builder_id is null then
    -- Team imports and edits of a builder's project default to that builder's own record.
    select id into new.builder_id from public.builders where user_id = new.owner_id;
  end if;

  -- Only the team marks a registration (e.g. RERA) number as checked.
  if app.is_client_request() and not app.is_staff() then
    new.registration_verified := case when tg_op = 'UPDATE' then old.registration_verified else false end;
  end if;
  if tg_op = 'UPDATE' and new.project_registration_number is distinct from old.project_registration_number
     and not app.is_staff() then
    new.registration_verified := false;
  end if;

  new.configurations := coalesce(
    (select array_agg(distinct left(btrim(c), 30)) from unnest(new.configurations) c where btrim(c) <> ''),
    array[]::text[]);
  -- Stored without spaces so "411 045" and "411045" are the same PIN code.
  new.postal_code := nullif(upper(regexp_replace(coalesce(new.postal_code, ''), '\s+', '', 'g')), '');
  return new;
end;
$$;

-- Link existing projects the same way.
update public.listings l set builder_id = b.id
from public.builders b
where l.category = 'new_project' and l.builder_id is null and b.user_id = l.owner_id;
