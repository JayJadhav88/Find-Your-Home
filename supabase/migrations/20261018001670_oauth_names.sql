-- Google sign-in: new accounts take their name from Google (full_name / name) when no
-- display name was given. Same function as before otherwise.
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

  insert into public.profiles (id, display_name) values (new.id, requested_name);
  insert into public.user_roles (user_id, role) values (new.id, 'buyer');
  return new;
end;
$$;
