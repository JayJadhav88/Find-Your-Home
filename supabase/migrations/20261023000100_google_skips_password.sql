-- People who sign in with Google never need a password. When an account that was created with a
-- one-time password (scripts/admin-bootstrap.mjs) signs in with Google, the one-time password is
-- replaced by a random one nobody knows, so the copy in the .secrets file stops working, and
-- the "choose your own password" step is cleared. Called by the website and app right after
-- a Google sign-in.

create function public.finish_google_sign_in()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null
     or not exists (select 1 from auth.identities i where i.user_id = me and i.provider = 'google')
     or not exists (select 1 from app.password_change_required r where r.user_id = me) then
    return false;
  end if;
  -- The trigger on auth.users clears the requirement when the password changes.
  update auth.users
  set encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf'))
  where id = me;
  delete from app.password_change_required where user_id = me;
  perform app.audit('account.google_replaced_one_time_password', 'user', me::text);
  return true;
end;
$$;

revoke all on function public.finish_google_sign_in() from public, anon;
grant execute on function public.finish_google_sign_in() to authenticated;
