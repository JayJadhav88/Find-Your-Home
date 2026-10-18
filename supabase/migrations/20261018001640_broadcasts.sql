-- Broadcasts: an administrator or marketing team member sends one message to many members,
-- in the app and (for people who agreed to news) by email, phone/browser push and WhatsApp.
-- Plus test messages for the Integrations page and the optional Expo access token.

create or replace function app.integration_secret_names()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['resend_api_key', 'whatsapp_access_token', 'expo_access_token', 'sheets_webhook_secret'];
$$;

create type public.broadcast_status as enum ('scheduled', 'sending', 'sent', 'cancelled');

create table public.broadcasts (
  id bigint generated always as identity primary key,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  -- A page on this site ("/search?...") or an https link.
  url text check (url ~ '^(/[^/\s][^\s]*|/|https://[^\s]+)$' and char_length(url) <= 500),
  audience text not null check (audience in ('everyone', 'owners', 'buyers', 'builders', 'team')),
  -- Optional: only people connected to this city (own, saved or enquired about a home there).
  city_id uuid references public.locations (id) on delete set null,
  channels public.notification_channel[] not null default array[]::public.notification_channel[],
  scheduled_at timestamptz not null default now(),
  status public.broadcast_status not null default 'scheduled',
  recipients integer,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index broadcasts_due_idx on public.broadcasts (scheduled_at) where status = 'scheduled';

alter table public.notifications
  add constraint notifications_broadcast_fk foreign key (broadcast_id) references public.broadcasts (id) on delete set null;
alter table public.notification_outbox
  add constraint notification_outbox_broadcast_fk foreign key (broadcast_id) references public.broadcasts (id) on delete set null;
create index notifications_broadcast_idx on public.notifications (broadcast_id) where broadcast_id is not null;

alter table public.broadcasts enable row level security;
create policy "Broadcast senders read broadcasts"
  on public.broadcasts for select to authenticated
  using ((select app.can_send_broadcasts()));
revoke all on public.broadcasts from anon, authenticated;
grant select on public.broadcasts to authenticated;

-- People in an audience (active accounts only).
create function app.broadcast_audience(p_audience text, p_city uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  where p.status = 'active'
    and case p_audience
      when 'everyone' then true
      when 'owners' then exists (
        select 1 from public.user_roles r where r.user_id = p.id and r.role in ('owner', 'agent', 'builder'))
      when 'buyers' then not exists (
        select 1 from public.user_roles r where r.user_id = p.id and r.role <> 'buyer')
      when 'builders' then exists (
        select 1 from public.user_roles r where r.user_id = p.id and r.role = 'builder')
      when 'team' then exists (
        select 1 from public.user_roles r where r.user_id = p.id
          and r.role in ('administrator', 'moderator', 'support', 'marketing'))
      else false
    end
    and (
      p_city is null
      or exists (select 1 from public.listings l where l.owner_id = p.id and l.city_id = p_city)
      or exists (select 1 from public.favorites f join public.listings l on l.id = f.listing_id
                 where f.user_id = p.id and l.city_id = p_city)
      or exists (select 1 from public.enquiries e join public.listings l on l.id = e.listing_id
                 where e.sender_user_id = p.id and l.city_id = p_city)
    );
$$;

-- How many people a broadcast would reach, and how many agreed to news outside the app.
create function public.admin_broadcast_audience_size(p_audience text, p_city uuid default null)
returns table (total integer, accepts_news integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require(app.can_send_broadcasts(), 'Only administrators and marketing can send messages');
  return query
    select count(*)::integer, count(*) filter (where p.marketing_opt_in)::integer
    from app.broadcast_audience(p_audience, p_city) a(id)
    join public.profiles p on p.id = a.id;
end;
$$;

create function public.admin_create_broadcast(
  p_title text,
  p_body text,
  p_url text,
  p_audience text,
  p_city uuid,
  p_channels public.notification_channel[],
  p_scheduled_at timestamptz default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id bigint;
begin
  perform app.require(app.can_send_broadcasts(), 'Only administrators and marketing can send messages');
  perform app.check_rate_limit('broadcast:' || auth.uid(), 20, interval '1 day');
  if p_scheduled_at is not null and p_scheduled_at > now() + interval '90 days' then
    raise exception 'Schedule within the next 90 days' using errcode = '22023';
  end if;

  insert into public.broadcasts (title, body, url, audience, city_id, channels, scheduled_at, created_by)
  values (btrim(p_title), btrim(p_body), nullif(btrim(coalesce(p_url, '')), ''), p_audience, p_city,
          coalesce((select array_agg(distinct c) from unnest(p_channels) c), array[]::public.notification_channel[]),
          greatest(coalesce(p_scheduled_at, now()), now()), auth.uid())
  returning id into new_id;

  perform app.audit('broadcast.create', 'broadcast', new_id::text, null,
    jsonb_build_object('title', btrim(p_title), 'audience', p_audience, 'channels', p_channels, 'scheduled_at', p_scheduled_at));
  return new_id;
end;
$$;

create function public.admin_cancel_broadcast(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require(app.can_send_broadcasts(), 'Only administrators and marketing can send messages');
  update public.broadcasts set status = 'cancelled' where id = p_id and status = 'scheduled';
  perform app.require_state(found, 'Only scheduled messages can be cancelled');
  perform app.audit('broadcast.cancel', 'broadcast', p_id::text);
end;
$$;

-- Delivery report: in-app reach and reads, then each outside channel by status.
create function public.admin_broadcast_report(p_id bigint)
returns table (channel text, status text, total integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require(app.can_send_broadcasts(), 'Only administrators and marketing can send messages');
  return query
    select 'in_app', 'delivered', count(*)::integer from public.notifications n where n.broadcast_id = p_id
    union all
    select 'in_app', 'read', count(*)::integer from public.notifications n where n.broadcast_id = p_id and n.read_at is not null
    union all
    select o.channel::text, o.status::text, count(*)::integer
    from public.notification_outbox o where o.broadcast_id = p_id
    group by o.channel, o.status;
end;
$$;

-- Sends broadcasts that are due. Called by the delivery worker (service role).
-- Outside-app channels only reach people who agreed to news, at most broadcast_weekly_cap
-- times in 7 days, and wait for the reader's quiet hours to end.
create function public.worker_send_due_broadcasts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.broadcasts;
  member record;
  cap integer := (app.settings()).broadcast_weekly_cap;
  sent_count integer := 0;
  reached integer;
begin
  for b in
    select * from public.broadcasts
    where status = 'scheduled' and scheduled_at <= now()
    order by scheduled_at
    for update skip locked
  loop
    update public.broadcasts set status = 'sending' where id = b.id;
    reached := 0;
    for member in
      select p.id, p.marketing_opt_in,
             (select count(*) from public.notifications n
              where n.user_id = p.id and n.broadcast_id is not null and n.created_at > now() - interval '7 days') as recent
      from app.broadcast_audience(b.audience, b.city_id) a(id)
      join public.profiles p on p.id = a.id
    loop
      perform app.deliver_to_user(
        member.id,
        'broadcast',
        jsonb_build_object('broadcast_id', b.id, 'title', b.title, 'body', b.body, 'url', b.url),
        case when member.marketing_opt_in and member.recent < cap then b.channels
             else array[]::public.notification_channel[] end,
        true,
        b.id,
        true
      );
      reached := reached + 1;
    end loop;
    update public.broadcasts set status = 'sent', sent_at = now(), recipients = reached where id = b.id;
    sent_count := sent_count + 1;
  end loop;
  return sent_count;
end;
$$;

-- Integrations page: send a test to yourself through one channel (skips the in-app inbox).
create function public.admin_send_test_notification(p_channel public.notification_channel)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require(app.is_admin(), 'Only administrators can test integrations');
  perform app.check_rate_limit('integration-test:' || auth.uid(), 20, interval '1 hour');
  perform app.deliver_to_user(auth.uid(), 'integration_test', jsonb_build_object('channel', p_channel),
    array[p_channel], false);
end;
$$;

revoke execute on function app.broadcast_audience(text, uuid) from public, anon, authenticated;
revoke execute on function
  public.admin_broadcast_audience_size(text, uuid),
  public.admin_create_broadcast(text, text, text, text, uuid, public.notification_channel[], timestamptz),
  public.admin_cancel_broadcast(bigint),
  public.admin_broadcast_report(bigint),
  public.admin_send_test_notification(public.notification_channel)
  from public, anon;
revoke execute on function public.worker_send_due_broadcasts() from public, anon, authenticated;
grant execute on function public.worker_send_due_broadcasts() to service_role;
