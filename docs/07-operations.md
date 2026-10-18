# 07 · Background workers, email and scheduling

Two Edge Functions do the work that needs secrets. Business events only write rows (`job_queue`, `notification_outbox`) in the same transaction as the change, so nothing is lost if a worker or provider is down. Workers retry with backoff (1, 2, 4 … 60 minutes, up to 8 attempts).

| Function | Reads | Does |
| --- | --- | --- |
| `process-jobs` | `job_queue` | On publish: downloads each listing photo from the private bucket, verifies its real file type, strips metadata (GPS, camera serials, XMP, comments, PNG text, WebP EXIF/XMP) while keeping orientation, and writes a copy under a random name to the public `listing-public` bucket. On unpublish (rejected, suspended, sold, rented, archived, material edit): deletes the public copies. Skips jobs that are stale (e.g. re-approved meanwhile). |
| `process-jobs` (image import) | `job_queue` kind `import_listing_images` | Downloads spreadsheet image links with SSRF protection (https only, private/local addresses blocked after DNS lookup and on every redirect, 15 s timeout, 10 MB cap), checks the real file type, strips metadata, stores the copy, then publishes the listing or sends it to review. Per-link results are saved in the job's `payload.result`. Remaining risk: DNS rebinding between the check and the request; acceptable for admin-only input. |
| `send-emails` | `notification_outbox` | Renders the template and sends through the configured provider. Emails only say *what happened* and link to the dashboard; enquirer contact details and messages are never put in email. |

Both functions require the header `x-worker-secret: <WORKER_SECRET>`; they are deployed with `verify_jwt = false` because they are not called by users.

Photos are not re-encoded (the Edge Runtime's CPU limits make that unreliable for large images). Metadata stripping is done on the bytes, and file types are checked by content. HEIC uploads are refused; the mobile app converts photos to JPEG on the device before upload (Phase 3).

## Local development

For the e2e import test only, `supabase/functions/.env` sets `ALLOW_HTTP_IMAGE_IMPORT=true` and `IMPORT_ALLOWED_PRIVATE_HOSTS=host.docker.internal` so the worker can fetch test images from this machine. **Never set these in production.** Restart with `pnpm db:stop && pnpm db:start` after changing function env (a container restart keeps the old values).

`supabase/functions/.env` (git-ignored) holds `WORKER_SECRET`, `EMAIL_PROVIDER=log` and `SITE_URL`. Copy [supabase/functions/.env.example](../supabase/functions/.env.example) if it is missing and generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run the workers:

```bash
pnpm workers           # once
pnpm workers --watch   # every 30 seconds while developing
```

With `EMAIL_PROVIDER=log` emails are printed in the Edge Runtime log: `docker logs supabase_edge_runtime_find-your-home`.

`pnpm smoke` runs the full photo + email flow against the local stack with the demo accounts.

## Email with Resend (production)

Nothing below has been done yet; it needs the owner's Resend account and domain.

1. Create a Resend account and **add your sending domain** (for example `mail.your-domain.com`). Add the SPF, DKIM (and recommended DMARC) DNS records Resend shows, and wait until the domain shows as verified. Sending from an unverified domain fails permanently (the worker marks such emails `failed` without retrying).
2. Create an API key with **sending access only**.
3. Set the function secrets on the hosted project:

```bash
pnpm exec supabase secrets set EMAIL_PROVIDER=resend RESEND_API_KEY=<key> EMAIL_FROM="Find Your Home <notifications@mail.your-domain.com>" SITE_URL=https://your-domain.com WORKER_SECRET=<64 hex chars>
```

4. Deploy the functions: `pnpm exec supabase functions deploy process-jobs send-emails`.

If `EMAIL_PROVIDER` is missing or incomplete, `send-emails` claims nothing and reports `configured: false`; queued emails wait until it is configured. Resend's free tier has daily and monthly sending limits — check current limits and pricing on resend.com before launch.

Supabase Auth emails (sign-up confirmation, password reset) are separate: configure custom SMTP in the Supabase dashboard (Resend provides SMTP credentials) so they also come from your domain.

## Scheduling on the hosted project

Locally you run `pnpm workers`. On a hosted Supabase project, schedule both functions every minute with `pg_cron` + `pg_net`. **This has not been run yet** (there is no hosted project); review it when setting up staging.

1. Enable the `pg_cron` and `pg_net` extensions (Dashboard → Database → Extensions).
2. Store the URL and secret in Vault (SQL editor, run once — do not commit the values):

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'functions_url');
select vault.create_secret('<same WORKER_SECRET as the function secret>', 'worker_secret');
```

3. Schedule:

```sql
select cron.schedule('fyh-process-jobs', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_url') || '/process-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
$$);

select cron.schedule('fyh-send-emails', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_url') || '/send-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
$$);
```

## Monitoring

Administrators can read `job_queue` and `notification_outbox` (RLS). The admin dashboard (Phase 2) will show pending, failed and "not configured" counts. Useful queries:

```sql
select status, count(*) from public.notification_outbox group by status;
select kind, status, attempts, last_error from public.job_queue where status <> 'sent' order by id desc limit 20;
```
