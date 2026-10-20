-- The admin panel shows the team (people with a team role) and customers (everyone else)
-- on separate pages. Same function as before plus a filter, and counts useful for customers.

drop function public.admin_list_users(text, integer, integer);

create function public.admin_list_users(
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_kind text default null -- 'team', 'customers' or null for everyone
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
          select 1 from public.user_roles r
          where r.user_id = p.id and r.role in ('administrator', 'moderator', 'support', 'marketing'))
      )
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

-- Add an existing account to the team by its email address.
create function public.admin_add_team_member(p_email text, p_role public.app_role)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  perform app.require(app.is_admin(), 'Only administrators can manage the team');
  perform app.require_state(p_role in ('administrator', 'moderator', 'support', 'marketing'), 'Choose a team role');
  select id into target from auth.users where lower(email) = lower(btrim(p_email));
  perform app.require_state(found, 'No account with that email yet. Ask them to create an account first.');
  perform public.admin_set_role(target, p_role, true);
  return target;
end;
$$;

-- Remove every team role from someone (they keep their customer account).
create function public.admin_remove_from_team(p_user_id uuid)
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
    select role from public.user_roles
    where user_id = p_user_id and role in ('administrator', 'moderator', 'support', 'marketing')
  loop
    perform public.admin_set_role(p_user_id, team_role, false);
  end loop;
end;
$$;

revoke execute on function
  public.admin_list_users(text, integer, integer, text),
  public.admin_add_team_member(text, public.app_role),
  public.admin_remove_from_team(uuid)
  from public, anon;
