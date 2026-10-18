# Find Your Home

Real estate listing platform: public website, web app with admin panel, and iOS/Android apps on one shared Supabase backend.

**Current status: Phase 1 (secure platform foundation) — database, permissions, auth rules, storage rules, admin bootstrap and demo data are done and tested. Not yet built: the media publishing worker and email sender (Edge Functions), and every user-facing screen (Phase 2 web, Phase 3 mobile).**

| Document | Contents |
| --- | --- |
| [docs/01-architecture.md](docs/01-architecture.md) | Stack, monorepo layout, where rules are enforced, auth, media, search, notifications, security, testing |
| [docs/02-data-model.md](docs/02-data-model.md) | Tables, enums, listing lifecycle, storage buckets |
| [docs/03-permissions.md](docs/03-permissions.md) | Role × capability matrix (spec for RLS and tests) |
| [docs/04-delivery-plan.md](docs/04-delivery-plan.md) | Phases 1–5 broken into verifiable milestones, with progress |
| [docs/05-environments-and-costs.md](docs/05-environments-and-costs.md) | Environments and cost assumptions |
| [docs/06-open-questions.md](docs/06-open-questions.md) | Assumptions, defaults, and open questions |

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
pnpm typecheck && pnpm lint && pnpm build
```

`pnpm exec supabase status` prints the local URLs and keys. Put the API URL and **publishable** key into `apps/web/.env.local` and `apps/mobile/.env.local` using the names in [.env.example](.env.example). The **secret** key is only for the bootstrap script and server code, never for a `NEXT_PUBLIC_` / `EXPO_PUBLIC_` variable (the shared config validator refuses to start if you do).

| Command | What it does |
| --- | --- |
| `pnpm db:start` / `pnpm db:stop` | Start / stop the local Supabase stack |
| `pnpm db:reset` | Rebuild the local database from migrations + demo seed |
| `pnpm db:test` | Run `supabase/tests/database/*.test.sql` |
| `pnpm db:types` | Regenerate `packages/shared/src/database.types.ts` after a schema change |
| `pnpm --filter @fyh/web dev` | Website on http://localhost:3000 |
| `pnpm --filter @fyh/mobile start` | Expo dev server |

Local auth emails (confirmation, password reset) are caught by Mailpit at http://127.0.0.1:54324.

### Demo data (local only)

`supabase/seed.sql` creates fictional, clearly labelled `[DEMO]` listings in "Demo Country" and four demo accounts — `demo.admin@`, `demo.moderator@`, `demo.owner@` and `demo.buyer@example.test` — whose shared password is written at the top of that file. The seed never runs against a hosted project unless you run it there yourself; don't.

## Admin bootstrap

There is no public "make me admin" path. To create the first administrator:

1. Sign up normally with the email you want to use and confirm it.
2. From a trusted terminal, with that environment's API URL and secret key in the shell (not in a file):

```bash
SUPABASE_URL=https://<project>.supabase.co SUPABASE_SECRET_KEY=<secret key> pnpm admin:bootstrap --email you@example.com
```

The script calls `bootstrap_admin`, which only the service role can execute, and writes an audit-log entry. After that, administrators grant roles from the admin panel (`admin_set_role`).

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

Rule of thumb: clients read and write content through RLS-protected tables; anything that changes status, roles or ownership goes through a workflow function. Workflow errors use `42501` (not allowed), `PT409` (wrong state), `22023` (invalid input) and `PT429` (rate limited), which the API returns as 401/403, 409, 400 and 429.

## Troubleshooting

- **`supabase start` times out with "kong container is not ready"** and Kong restarts with exit code 0: a Docker image was corrupted by an interrupted download (seen after a sudden shutdown). Check with `docker run --rm --entrypoint sh public.ecr.aws/supabase/kong:2.8.1 -c "wc -c /docker-entrypoint.sh"`. If it prints `0`, run `pnpm db:stop`, `docker rmi public.ecr.aws/supabase/kong:2.8.1`, then `pnpm db:start`. The same fix applies to any other image that misbehaves silently.
- **Low memory:** Realtime, Studio, Edge Runtime, vector storage and log analytics are switched off in `supabase/config.toml` to keep the local stack light. Turn Studio (`[studio] enabled = true`) back on if you want the database UI at http://127.0.0.1:54323.
- **`permission denied for function …`** from the API: the function is deliberately not callable by that role (for example `bootstrap_admin` for anyone but the service role).

Deployment, backups and production configuration are documented in Phase 4.
