-- People an enquiry can be assigned to, for the assignment menu (support staff cannot read
-- other people's roles directly).
create function public.enquiry_team()
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
    where p.status = 'active' and r.role in ('administrator', 'moderator', 'support')
    order by p.display_name;
end;
$$;

revoke execute on function public.enquiry_team() from public, anon;
