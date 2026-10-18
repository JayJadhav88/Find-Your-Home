-- Listing expiry checks every published listing, so run it at most once an hour even though
-- the delivery worker runs every minute.
insert into app.config (key, value) values ('expiry_last_run', '1970-01-01T00:00:00Z') on conflict do nothing;

create or replace function public.worker_expire_listings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings;
  reminded integer := 0;
  expired integer := 0;
  ends timestamptz;
begin
  if (app.settings()).listing_expiry_days = 0 then
    return jsonb_build_object('reminded', 0, 'expired', 0);
  end if;
  update app.config set value = now()::text
  where key = 'expiry_last_run' and value::timestamptz < now() - interval '1 hour';
  if not found then
    return jsonb_build_object('skipped', 'ran within the last hour');
  end if;

  for l in select * from public.listings where status = 'published' for update skip locked loop
    ends := app.listing_expires_at(l);
    if ends <= now() then
      update public.listings set status = 'archived', archived_at = now(), expired_at = now() where id = l.id;
      perform app.log_listing_status(l.id, 'published', 'archived', 'Expired: not renewed in time');
      perform app.deliver_to_user(l.owner_id, 'listing_expired',
        jsonb_build_object('listing_id', l.id, 'title', l.title, 'reference', l.reference_code));
      expired := expired + 1;
    elsif ends <= now() + interval '7 days'
          and (l.expiry_reminded_at is null or l.expiry_reminded_at < coalesce(l.renewed_at, l.published_at)) then
      update public.listings set expiry_reminded_at = now() where id = l.id;
      perform app.deliver_to_user(l.owner_id, 'listing_expiring',
        jsonb_build_object('listing_id', l.id, 'title', l.title, 'reference', l.reference_code,
                           'expires_on', to_char(ends at time zone (app.settings()).default_timezone, 'YYYY-MM-DD')));
      reminded := reminded + 1;
    end if;
  end loop;
  return jsonb_build_object('reminded', reminded, 'expired', expired);
end;
$$;
