-- Browser (web push) subscriptions alongside phone push tokens. Both are the "push" channel.

create table public.web_push_subscriptions (
  -- The browser's push service address. Only the big push services are accepted, so the
  -- worker can never be pointed at an arbitrary server.
  endpoint text primary key check (
    char_length(endpoint) <= 1000 and endpoint ~ (
      '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com'
      || '|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com)/'
    )
  ),
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index web_push_subscriptions_user_idx on public.web_push_subscriptions (user_id, last_seen_at desc);

alter table public.web_push_subscriptions enable row level security;
create policy "Users read their own browser subscriptions"
  on public.web_push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.web_push_subscriptions from anon, authenticated;
grant select on public.web_push_subscriptions to authenticated;

create function public.register_web_push(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require(auth.uid() is not null and app.is_active_user(), 'Sign in first');
  insert into public.web_push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, last_seen_at = now();

  delete from public.web_push_subscriptions
  where user_id = auth.uid()
    and endpoint not in (
      select endpoint from public.web_push_subscriptions where user_id = auth.uid()
      order by last_seen_at desc limit 10
    );
end;
$$;

create function public.unregister_web_push(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.web_push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

create function public.worker_remove_web_push(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.web_push_subscriptions where endpoint = p_endpoint;
$$;

revoke execute on function public.register_web_push(text, text, text), public.unregister_web_push(text) from public, anon;
revoke execute on function public.worker_remove_web_push(text) from public, anon, authenticated;
grant execute on function public.worker_remove_web_push(text) to service_role;

-- Push is queued when the person has a phone or a browser registered.
create or replace function app.deliver_to_user(
  p_user uuid,
  p_kind text,
  p_data jsonb,
  p_channels public.notification_channel[] default array['email', 'push', 'whatsapp']::public.notification_channel[],
  p_in_app boolean default true,
  p_broadcast_id bigint default null,
  p_wait_for_quiet_hours boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  prefs public.notification_preferences;
  note_id bigint;
  send_at timestamptz;
  data jsonb := coalesce(p_data, '{}'::jsonb);
begin
  if not exists (select 1 from public.profiles where id = p_user and status = 'active') then
    return;
  end if;
  select * into prefs from public.notification_preferences where user_id = p_user;
  send_at := case when p_wait_for_quiet_hours then app.next_delivery_time(p_user) else now() end;

  if p_in_app then
    insert into public.notifications (user_id, kind, data, broadcast_id)
    values (p_user, p_kind, data, p_broadcast_id)
    returning id into note_id;
  end if;

  if 'email' = any (p_channels) and coalesce(prefs.email_enabled, true) then
    insert into public.notification_outbox
      (template, recipient_user_id, template_data, channel, notification_id, broadcast_id, next_attempt_at)
    values (p_kind, p_user, data, 'email', note_id, p_broadcast_id, send_at);
  end if;

  if 'push' = any (p_channels) and coalesce(prefs.push_enabled, true)
     and (exists (select 1 from public.push_tokens where user_id = p_user)
          or exists (select 1 from public.web_push_subscriptions where user_id = p_user)) then
    insert into public.notification_outbox
      (template, recipient_user_id, template_data, channel, notification_id, broadcast_id, next_attempt_at)
    values (p_kind, p_user, data, 'push', note_id, p_broadcast_id, send_at);
  end if;

  if 'whatsapp' = any (p_channels) and coalesce(prefs.whatsapp_enabled, false) then
    insert into public.notification_outbox
      (template, recipient_user_id, template_data, channel, notification_id, broadcast_id, next_attempt_at)
    values (p_kind, p_user, data, 'whatsapp', note_id, p_broadcast_id, send_at);
  end if;
end;
$$;

drop function public.worker_claim_notifications(integer, public.notification_channel[]);

create function public.worker_claim_notifications(
  p_limit integer default 25,
  p_channels public.notification_channel[] default array['email']::public.notification_channel[]
)
returns table (
  id bigint,
  template text,
  channel public.notification_channel,
  recipient_email text,
  recipient_phone text,
  push_tokens text[],
  web_push jsonb,
  recipient_name text,
  recipient_locale text,
  template_data jsonb,
  attempts smallint,
  notification_id bigint
)
language sql
security definer
set search_path = ''
as $$
  with leased as (
    update public.notification_outbox n
    set attempts = n.attempts + 1, next_attempt_at = now() + interval '10 minutes'
    where n.id in (
      select o.id from public.notification_outbox o
      where o.status = 'pending' and o.next_attempt_at <= now() and o.channel = any (p_channels)
      order by o.id
      for update skip locked
      limit least(greatest(p_limit, 1), 100)
    )
    returning n.*
  )
  select l.id, l.template, l.channel,
         case
           when l.recipient_user_id is null then l.recipient_email
           when p.status = 'active' and coalesce(pr.email_enabled, true) then u.email::text
         end,
         case when p.status = 'active' and pr.whatsapp_enabled then pr.whatsapp_number end,
         case when p.status = 'active' and coalesce(pr.push_enabled, true) then
           array(select t.token from public.push_tokens t where t.user_id = l.recipient_user_id order by t.last_seen_at desc)
         end,
         case when p.status = 'active' and coalesce(pr.push_enabled, true) then
           coalesce((
             select jsonb_agg(jsonb_build_object('endpoint', w.endpoint, 'p256dh', w.p256dh, 'auth', w.auth))
             from public.web_push_subscriptions w where w.user_id = l.recipient_user_id
           ), '[]'::jsonb)
         end,
         p.display_name,
         coalesce(p.preferred_locale, (select s.default_locale from public.site_settings s where s.id)),
         l.template_data, l.attempts, l.notification_id
  from leased l
  left join public.profiles p on p.id = l.recipient_user_id
  left join public.notification_preferences pr on pr.user_id = l.recipient_user_id
  left join auth.users u on u.id = l.recipient_user_id
  order by l.id;
$$;

revoke execute on function public.worker_claim_notifications(integer, public.notification_channel[])
  from public, anon, authenticated;
grant execute on function public.worker_claim_notifications(integer, public.notification_channel[]) to service_role;
