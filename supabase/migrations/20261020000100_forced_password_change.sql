-- First-admin bootstrap: an account created with a one-time password must choose its own
-- password before using the site. The requirement is cleared by the database itself when the
-- password actually changes (a trigger on auth.users), so it cannot be skipped from a client.

create table app.password_change_required (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
revoke all on app.password_change_required from anon, authenticated;

create function app.clear_password_change_requirement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    delete from app.password_change_required where user_id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_password_changed
  after update of encrypted_password on auth.users
  for each row execute function app.clear_password_change_requirement();

-- For the signed-in person: must they set a new password first?
create function public.must_change_password()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from app.password_change_required where user_id = auth.uid());
$$;

-- Used by scripts/admin-bootstrap.mjs (service role) right after creating the account.
create function public.require_password_change(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into app.password_change_required (user_id) values (p_user_id) on conflict do nothing;
$$;

revoke execute on function public.must_change_password() from public, anon;
revoke execute on function public.require_password_change(uuid) from public, anon, authenticated;
grant execute on function public.require_password_change(uuid) to service_role;
