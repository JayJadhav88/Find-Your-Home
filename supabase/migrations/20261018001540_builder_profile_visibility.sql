-- Fix: visitors could not see public builder profiles, because the policy looked up
-- user_roles, which visitors cannot read. Use a definer helper that only answers yes/no.

create function app.user_has_role(p_user_id uuid, p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id and p.status = 'active'
    where ur.user_id = p_user_id and ur.role = p_role
  );
$$;

grant execute on function app.user_has_role(uuid, public.app_role) to anon, authenticated, service_role;

drop policy "Public builder profiles are visible to everyone" on public.builder_profiles;
create policy "Public builder profiles are visible to everyone"
  on public.builder_profiles for select to anon, authenticated
  using (
    (is_public and app.user_has_role(user_id, 'builder'))
    or user_id = (select auth.uid())
    or (select app.is_staff())
  );
