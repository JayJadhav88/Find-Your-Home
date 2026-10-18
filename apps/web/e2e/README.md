# End-to-end tests (Playwright)

The suite drives a real browser against the **local** stack only. It refuses to run if the Supabase URL is not on localhost.

## Run

```bash
pnpm db:start                   # local Supabase (demo seed + Mailpit)
pnpm --filter @fyh/web build    # tests use the production build
pnpm e2e                        # starts `next start` if nothing is on :3000
```

The HTML report is written to `apps/web/e2e-report/`, and traces and screenshots of failures to `apps/web/test-results/`. Both folders are git-ignored.

The suite also needs:

- `supabase/functions/.env` with `WORKER_SECRET` (and optionally `REVALIDATE_URL` / `REVALIDATE_SECRET`), because the listing flow runs the photo and email workers;
- Docker. Global setup clears the local rate-limit counters with `docker exec`, so repeated runs are not throttled.

## What is covered (39 tests)

| File | Flows |
| --- | --- |
| `public.spec.ts` | Home, search filters and sort, empty results, listing page (facts, JSON-LD, canonical), slug redirect, 404 and noindex for missing listings, private-area redirects, robots/sitemap, anonymous export refused, labelled forms with no duplicate ids |
| `auth.spec.ts` | Sign-up password rules → unconfirmed sign-in refused → email confirmation via Mailpit → sign in. Forgot password → reset link → mismatch error → new password works, old one fails. No account enumeration on reset |
| `listing-flow.spec.ts` | Owner drafts a listing → submit refused without a photo → JPEG upload with alt text → non-image refused → submit → hidden from visitors → moderator approves → worker publishes the photo → visitor sees the photo and sends an enquiry (consent required) → owner reads it and marks it replied → approval email sent → owner archives → page gone |
| `admin.spec.ts` | Users with emails and accessible action names, settings validation and save, add/deactivate amenity, CSV export audited, moderator blocked from admin-only pages and exports, buyer blocked from admin |
| `categories-import.spec.ts` | Rent/Resale/New projects navigation, only builders can choose New project (project name and video links validated), Excel template download, check → import with a bad row reported, worker downloads image links (one good, one 404) → one listing live and one in review, click-to-play YouTube/Instagram on the listing page, videos on the admin review page. Serves test images from a local server on port 4599 (Windows may ask to allow Node.js network access) and needs the local-only import flags in `supabase/functions/.env` |
| `mobile.spec.ts` | No horizontal scroll on key pages at phone size, listing page usable, 44 px tap targets |

## Data

Tests use the demo accounts from `supabase/seed.sql` and create uniquely named `[DEMO] E2E …` listings, `e2e.*@example.test` accounts and `E2E amenity …` rows (deactivated after the test). Run `pnpm db:reset` to return to a clean demo database.
