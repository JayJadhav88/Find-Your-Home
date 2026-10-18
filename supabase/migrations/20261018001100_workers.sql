-- Worker support: claim/finish functions for the job queue and email outbox, used by the
-- process-jobs and send-emails Edge Functions. Callable only with the service role.

-- HEIC cannot be displayed by most browsers. Apps convert to JPEG before uploading.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'listing-uploads';

alter table public.site_settings
  alter column allowed_image_types set default array['image/jpeg', 'image/png', 'image/webp'];
update public.site_settings
set allowed_image_types = array_remove(allowed_image_types, 'image/heic');

-- Retry schedule: 1, 2, 4, 8 ... minutes, capped at 1 hour; give up after 8 attempts.
create function app.retry_delay(p_attempts integer)
returns interval
language sql
immutable
set search_path = ''
as $$
  select least(power(2, greatest(p_attempts - 1, 0)), 60) * interval '1 minute';
$$;

-- ---------------------------------------------------------------------------
-- Job queue
-- ---------------------------------------------------------------------------

-- Lease up to p_limit due jobs. A leased job is invisible for 10 minutes, so a crashed
-- worker's job is retried automatically.
create function public.worker_claim_jobs(p_limit integer default 10)
returns setof public.job_queue
language sql
security definer
set search_path = ''
as $$
  update public.job_queue j
  set attempts = j.attempts + 1, next_attempt_at = now() + interval '10 minutes'
  where j.id in (
    select id from public.job_queue
    where status = 'pending' and next_attempt_at <= now()
    order by id
    for update skip locked
    limit least(greatest(p_limit, 1), 50)
  )
  returning j.*;
$$;

create function public.worker_finish_job(p_id bigint, p_ok boolean, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.job_queue
  set status = case
        when p_ok then 'sent'::public.outbox_status
        when attempts >= 8 then 'failed'::public.outbox_status
        else 'pending'::public.outbox_status
      end,
      finished_at = case when p_ok or attempts >= 8 then now() end,
      next_attempt_at = case when p_ok then next_attempt_at else now() + app.retry_delay(attempts) end,
      last_error = case when p_ok then null else left(p_error, 2000) end
  where id = p_id;
$$;

-- ---------------------------------------------------------------------------
-- Email outbox
-- ---------------------------------------------------------------------------

-- Lease due emails and resolve each recipient's address. Recipients whose account is no
-- longer active get recipient_email = null and are marked skipped by the worker.
create function public.worker_claim_notifications(p_limit integer default 25)
returns table (
  id bigint,
  template text,
  recipient_email text,
  recipient_name text,
  template_data jsonb,
  attempts smallint
)
language sql
security definer
set search_path = ''
as $$
  with leased as (
    update public.notification_outbox n
    set attempts = n.attempts + 1, next_attempt_at = now() + interval '10 minutes'
    where n.id in (
      select id from public.notification_outbox
      where status = 'pending' and next_attempt_at <= now()
      order by id
      for update skip locked
      limit least(greatest(p_limit, 1), 100)
    )
    returning n.*
  )
  select l.id, l.template,
         coalesce(l.recipient_email, case when p.status = 'active' then u.email::text end),
         p.display_name,
         l.template_data, l.attempts
  from leased l
  left join public.profiles p on p.id = l.recipient_user_id
  left join auth.users u on u.id = l.recipient_user_id
  order by l.id;
$$;

create function public.worker_finish_notification(
  p_id bigint,
  p_status public.outbox_status,
  p_provider_message_id text default null,
  p_error text default null,
  p_permanent boolean default false
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notification_outbox
  set status = case
        when p_status = 'failed' and attempts < 8 and not p_permanent then 'pending'::public.outbox_status
        else p_status
      end,
      next_attempt_at = case when p_status = 'failed' and not p_permanent then now() + app.retry_delay(attempts) else next_attempt_at end,
      provider_message_id = coalesce(p_provider_message_id, provider_message_id),
      sent_at = case when p_status = 'sent' then now() else sent_at end,
      last_error = case when p_status = 'sent' then null else left(p_error, 2000) end
  where id = p_id;
$$;

revoke execute on function
  public.worker_claim_jobs(integer),
  public.worker_finish_job(bigint, boolean, text),
  public.worker_claim_notifications(integer),
  public.worker_finish_notification(bigint, public.outbox_status, text, text, boolean)
  from public, anon, authenticated;

grant execute on function
  public.worker_claim_jobs(integer),
  public.worker_finish_job(bigint, boolean, text),
  public.worker_claim_notifications(integer),
  public.worker_finish_notification(bigint, public.outbox_status, text, text, boolean)
  to service_role;

-- Administrators can see delivery health in the dashboard.
create policy "Administrators read the email outbox"
  on public.notification_outbox for select to authenticated
  using ((select app.is_admin()));
create policy "Administrators read the job queue"
  on public.job_queue for select to authenticated
  using ((select app.is_admin()));
grant select on public.notification_outbox, public.job_queue to authenticated;
