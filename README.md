# Find Your Home

Real estate listing platform: public website, web app with admin panel, and iOS/Android apps on one shared Supabase backend.

**Primary features: Rental / Resale / New project (verified builders) categories, admin bulk import from Excel with image links, and YouTube/Instagram videos on listings.**

**Current status: Phase 3 (mobile app) built — the iOS/Android app with the three categories, builder projects, videos, search, saved homes, enquiries and the owner listing editor with camera/gallery photos, on top of the Phase 2 website and admin panel. The app has passed type, lint, unit and bundle checks but has not yet been run on a phone or simulator. Phase 3b added notifications on every channel, team roles, enquiry management with Google Sheets, broadcasts, Google sign-in, saved-search alerts, listing expiry, reports and owner insights. Not yet built: comparison view, curated SEO landing pages. Nothing is deployed.** See [docs/04-delivery-plan.md](docs/04-delivery-plan.md) for exactly what was and wasn't tested.

| Document | Contents |
| --- | --- |
| [docs/01-architecture.md](docs/01-architecture.md) | Stack, monorepo layout, where rules are enforced, auth, media, search, notifications, security, testing |
| [docs/02-data-model.md](docs/02-data-model.md) | Tables, enums, listing lifecycle, storage buckets |
| [docs/03-permissions.md](docs/03-permissions.md) | Role × capability matrix (spec for RLS and tests) |
| [docs/04-delivery-plan.md](docs/04-delivery-plan.md) | Phases 1–5 broken into verifiable milestones, with progress |
| [docs/05-environments-and-costs.md](docs/05-environments-and-costs.md) | Environments and cost assumptions |
| [docs/06-open-questions.md](docs/06-open-questions.md) | Assumptions, defaults, and open questions |
| [docs/07-operations.md](docs/07-operations.md) | Photo-publishing, image-import and email workers, Resend setup, hosted scheduling |
| [docs/08-excel-import-guide.md](docs/08-excel-import-guide.md) | For administrators: adding many properties from Excel, image and video links |
| [docs/09-mobile-app.md](docs/09-mobile-app.md) | The mobile app: what it does, trying it on your phone, store builds and what you need to provide |
| [docs/10-notifications-and-team.md](docs/10-notifications-and-team.md) | Notifications (in app, email, phone, browser, WhatsApp), team roles, enquiries, Google Sheets, broadcasts, extras, and how to set up each integration |

## Requirements

- Node.js 22+ and pnpm (`npm install -g pnpm`)
- Docker Desktop, running (WSL 2 backend on Windows)
- Git

## Local setup

```bash
pnpm install
pnpm db:start        # first run downloads the Supabase images (several GB)
pnpm db:test         # database permission and workflow tests (pgTAP)
pnpm test            # shared package unit tests
pnpm test:functions  # Edge Function unit tests (image sanitizer, email)
pnpm workers         # run the photo + email workers once (needs supabase/functions/.env)
pnpm smoke           # API-level end-to-end flow against the local stack (demo accounts)
pnpm e2e             # Playwright browser tests (needs a web build; see apps/web/e2e/README.md)
pnpm typecheck && pnpm lint && pnpm build
```

`pnpm exec supabase status` prints the local URLs and keys. Put the API URL and **publishable** key into `apps/web/.env.local` and `apps/mobile/.env.local` using the names in [.env.example](.env.example). The **secret** key is only for the bootstrap script and server code, never for a `NEXT_PUBLIC_` / `EXPO_PUBLIC_` variable (the shared config validator refuses to start if you do).

| Command | What it does |
| --- | --- |
| `pnpm db:start` / `pnpm db:stop` | Start / stop the local Supabase stack |
| `pnpm db:reset` | Rebuild the local database from migrations + demo seed |
| `pnpm db:test` | Run `supabase/tests/database/*.test.sql` |
| `pnpm db:types` | Regenerate `packages/shared/src/database.types.ts` after a schema change |
| `pnpm --filter @fyh/web dev` | Website on http://localhost:3000 (development mode) |
| `pnpm --filter @fyh/web build && pnpm --filter @fyh/web start` | Production build of the website on http://localhost:3000 |
| `pnpm --filter @fyh/mobile start` | Expo dev server |

Local auth emails (confirmation, password reset) are caught by Mailpit at http://127.0.0.1:44324.

### Demo data (local only)

`supabase/seed.sql` creates fictional, clearly labelled `[DEMO]` listings in "Demo Country" and four demo accounts — `demo.admin@`, `demo.moderator@`, `demo.owner@`, `demo.buyer@` and `demo.builder@example.test` — whose shared password is written at the top of that file. The seed never runs against a hosted project unless you run it there yourself; don't.

## Admin bootstrap

There is no public "make me admin" path, no shared master password and no hard-coded account. To create the first administrator, run this once per environment from a trusted terminal, with that environment's API URL and secret key in the shell (not in a file):

```bash
SUPABASE_URL=https://<project>.supabase.co SUPABASE_SECRET_KEY=<secret key> pnpm admin:bootstrap --create --email you@example.com
```

This creates the account with a long random one-time password, saved to `.secrets/first-admin.txt` (git-ignored, never printed). Sign in with it; the site sends you straight to "Choose a new password" and nothing else opens until you do. The one-time password then stops working (enforced by the database). Delete the file afterwards.

Without `--create`, the script promotes an account that already signed up and confirmed its email. Either way it calls `bootstrap_admin`, which only the service role can execute, and writes an audit-log entry. After that, administrators manage people in the admin panel: **Team & roles** (staff and their roles) and **Customers** (members). To retire a temporary admin, take away the role or suspend the account there.

Locally the stack listens on ports 44321–44329 (not Supabase's default 543xx), because Windows with Hyper-V/WSL often reserves the 54xxx range after a restart.

## Database layout

| Migration | Contents |
| --- | --- |
| `…0100_foundation` | Extensions, private `app` schema, enums, shared helpers |
| `…0200_accounts` | Profiles, roles, agent profiles, sign-up trigger, role helpers |
| `…0300_taxonomy_and_settings` | Property types, amenities, locations, currencies, typed site settings, content pages |
| `…0400_operations` | Append-only audit log, rate limiting, notification outbox, job queue, privacy requests |
| `…0500_listings` | Listings, private details, media, amenities, status history, protected-column and material-change triggers |
| `…0600_buyer_activity` | Favorites, comparison list, enquiries / visit requests |
| `…0700_workflow_functions` | RPCs: submit/withdraw/moderate/outcome/feature listings, roles, suspension, enquiries, visits, contact card, bootstrap |
| `…0800_rls_policies` | Row Level Security for every table |
| `…0900_storage` | Buckets and object policies |
| `…1000_default_taxonomy` | Starter property types and amenities (admin-editable) |
| `…1100_workers` | Claim/finish functions for the job queue and email outbox; HEIC removed from uploads |

Rule of thumb: clients read and write content through RLS-protected tables; anything that changes status, roles or ownership goes through a workflow function. Workflow errors use `42501` (not allowed), `PT409` (wrong state), `22023` (invalid input) and `PT429` (rate limited), which the API returns as 401/403, 409, 400 and 429.

## Troubleshooting

- **`supabase start` times out with "kong container is not ready"** and Kong restarts with exit code 0: a Docker image was corrupted by an interrupted download (seen after a sudden shutdown). Check with `docker run --rm --entrypoint sh public.ecr.aws/supabase/kong:2.8.1 -c "wc -c /docker-entrypoint.sh"`. If it prints `0`, run `pnpm db:stop`, `docker rmi public.ecr.aws/supabase/kong:2.8.1`, then `pnpm db:start`. The same fix applies to any other image that misbehaves silently.
- **`supabase_edge_runtime` exits (code 255) after `pnpm db:reset`:** run `docker start supabase_edge_runtime_find-your-home` (or `pnpm db:stop && pnpm db:start`).
- **A signed-in page stays on “Loading…”** under Next.js 16: anything that reads the session must go through `createUserClient()` (it calls `connection()`), and any clock read must happen after it. Check `next start` output for `blocking-prerender-current-time`.
- **New photos or listings don't appear after a local rebuild:** `next build` can reuse cached data from an earlier build. Restart, then refresh the listing cache: `curl -X POST http://localhost:3000/api/revalidate -H "x-revalidate-secret: <REVALIDATE_SECRET>"`. The photo worker calls this automatically when `REVALIDATE_URL`/`REVALIDATE_SECRET` are set.
- **Low memory:** Realtime, Studio, vector storage and log analytics are switched off in `supabase/config.toml` to keep the local stack light. Turn Studio (`[studio] enabled = true`) back on if you want the database UI at http://127.0.0.1:44323.
- **`permission denied for function …`** from the API: the function is deliberately not callable by that role (for example `bootstrap_admin` for anyone but the service role).

Deployment, backups and production configuration are documented in Phase 4.
