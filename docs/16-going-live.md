# 16 · The live site (Hostinger + Supabase)

Set up 2026-10-23.

| Part | Where | Notes |
| --- | --- | --- |
| Website | Hostinger Business → Web Apps → `coral-salamander-372599.hostingersite.com` (temporary address) | Node.js 22, built from GitHub `JayJadhav88/Find-Your-Home`, branch `main`; **every push to main redeploys** |
| Database, sign-in, files | Supabase project `find-your-home-mumbai` (`perckbkfdaepwlkiigsv`), Mumbai, Free plan | 40 database changes loaded; no demo data |
| Background jobs | Supabase Edge Functions: process-jobs, send-emails, deliver-notifications, geocode | Run every minute by `pg_cron`; the worker secret is in Supabase Vault |

## Hostinger settings

Framework **Other**, root `./`, package manager **pnpm**, build command `pnpm run build` (= `scripts/build-hostinger.mjs`), entry file `apps/web/.next/standalone/apps/web/server.js`.

Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`, `NEXT_PUBLIC_GOOGLE_SIGN_IN` (false for now), `HOSTNAME=0.0.0.0`, `REVALIDATE_SECRET`. The values are in the git-ignored `.secrets/hostinger.env` on the laptop, which can be uploaded with **Import .env**. Never add `SUPABASE_SECRET_KEY` there.

Why the build looks the way it does (shared hosting limits):
- It uses webpack, not Turbopack, because Turbopack can't start its helper processes.
- It uses one worker and few threads, because the server refuses to start more.
- It produces a self-contained server with real copies of Next.js's helper packages.
- `NEXT_PUBLIC_*` values are built into the pages, so **change them in Hostinger, then redeploy**.

## Supabase settings

- **Function secrets** (`supabase secrets list`): `WORKER_SECRET`, `REVALIDATE_SECRET`, `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `EMAIL_PROVIDER=log`, `SITE_URL`, `REVALIDATE_URL`, `GEOCODE_PROXY_URL` (`https://coral-salamander-372599.hostingersite.com/api/geocode`). Values are in the git-ignored `.secrets/live-functions.env`.
- **Authentication → URL Configuration:**
  - Site URL: the Hostinger address;
  - Redirect URLs: `https://coral-salamander-372599.hostingersite.com/**` and `findyourhome://**`.
- **Admins:** two super admins, created with one-time passwords in `.secrets/live-admin-patil.txt` and `.secrets/live-admin-jaydeep.txt`. A new password is required at first sign-in.

## Place search (OpenStreetMap)

OpenStreetMap's free place lookup (Nominatim) refuses requests from Supabase's servers (403), so the lookups go through the website:

1. The search box calls the Supabase `geocode` function, which checks the cache and the per-visitor limit.
2. On a cache miss it asks the website's `/api/geocode` route (on Hostinger, which OpenStreetMap accepts), sending `REVALIDATE_SECRET` to prove who it is.
3. The route asks OpenStreetMap, at most once a second, and passes the answer back.

The `process-jobs` worker finds listing map pins the same way. Without `GEOCODE_PROXY_URL` (local development) the functions call OpenStreetMap directly. If the domain changes, update `GEOCODE_PROXY_URL` too.

## Updating the site

Commit and `git push` to `main`; Hostinger rebuilds (about 3 minutes). For database changes, run `npx supabase db push` (linked to the Mumbai project). For function changes, run `npx supabase functions deploy --use-api`.

## Not done yet / known limits

- **Emails aren't sent:** `EMAIL_PROVIDER=log`. Supabase's built-in sign-in emails (confirm sign-up, reset password) only reach your own team's addresses on the free setup. Before real customers:
  1. create a Resend account and verify your domain;
  2. set the Resend key in Admin → Integrations and `EMAIL_PROVIDER=resend`;
  3. set Resend as Supabase's SMTP server (Authentication → Emails → SMTP settings).
- **Google sign-in** is on (2026-10-23): Supabase has the Google client (pushed with `supabase config push` from a copy of config.toml using the live addresses), and Hostinger has `NEXT_PUBLIC_GOOGLE_SIGN_IN=true`. Google Cloud must list `https://perckbkfdaepwlkiigsv.supabase.co/auth/v1/callback` under the client's Authorized redirect URIs. While the Google app is in **Testing**, only listed test users can sign in; **Publish app** for everyone. Signing in with Google never asks for a password: an account made with a one-time password gets a random one nobody knows (`finish_google_sign_in`).
- **The phone app** still points at the laptop. For a live app build, set the `EXPO_PUBLIC_*` values to the live addresses ([15-phone-push.md](15-phone-push.md) Part D).
- **Own domain:** in Hostinger, Connect domain. Then update `NEXT_PUBLIC_SITE_URL` in Hostinger, `SITE_URL` / `REVALIDATE_URL` / `GEOCODE_PROXY_URL` in Supabase secrets, and the Supabase Site URL and redirect URLs. Redeploy.
- **Free Supabase plan:** the project pauses after 7 days without activity and has no backups. Upgrade to Pro before launch.
- **The older Seoul project** ("Find Your Home") is unused. Pause or delete it in Supabase.
- **The repository is public**, by your choice. Never commit secrets: `.secrets/` and `.env*` are git-ignored.
