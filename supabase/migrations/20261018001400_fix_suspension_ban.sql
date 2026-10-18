-- Fix: Supabase Auth fails to read banned_until = 'infinity' (sign-in returned HTTP 500
-- instead of "user banned"). Use a far-future date, and repair existing suspensions.

create or replace function public.admin_set_account_status(p_user_id uuid, p_status public.account_status, p_reason text default null)
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
    -- Far-future date: Supabase Auth cannot read an 'infinity' timestamp.
    update auth.users set banned_until = now() + interval '100 years' where id = p_user_id;
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

update auth.users set banned_until = now() + interval '100 years' where banned_until = 'infinity';
