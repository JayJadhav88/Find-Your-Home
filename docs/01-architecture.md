# 01 · Architecture proposal

Status: **Phase 0 proposal — awaiting owner review.** No application code exists yet.

## 1. Starting point

- Folder `find-your-home` is new and empty apart from these docs. There is no existing code to preserve.
- Tooling found on the development machine (2026-10-18):

| Tool | Status | Needed for |
| --- | --- | --- |
| Node.js 22.17.1 + npm | Installed | Everything |
| pnpm | Missing — enable with `corepack enable` (ships with Node) | Monorepo workspaces |
| Git | **Missing** | Version control, deploys, history of every milestone |
| Docker Desktop | **Missing** | Local Supabase stack (`supabase start`) and database policy tests |
| Supabase CLI | Missing — run through `npx supabase` or install | Migrations, local stack, Edge Functions |

Git and Docker affect how Phase 1 runs; see [06-open-questions.md](06-open-questions.md).

## 2. Stack (as specified in the brief, no deviations proposed)

```
find-your-home/
├─ apps/
│  ├─ web/          Next.js (App Router, TypeScript) — public site, account area, /admin
│  └─ mobile/       Expo + React Native (Expo Router) — iOS and Android
├─ packages/
│  ├─ shared/       Domain types, zod schemas, API client, formatting, design tokens
│  └─ config/       Shared tsconfig / ESLint / Prettier presets
├─ supabase/
│  ├─ migrations/   Ordered SQL migrations (schema, RLS, functions, storage policies)
│  ├─ functions/    Edge Functions (Deno) for work that needs secrets
│  ├─ tests/        pgTAP tests for RLS and workflow functions
│  ├─ seed.sql      Local/demo data only, clearly labelled "DEMO"
│  └─ config.toml
├─ scripts/         Admin bootstrap and maintenance scripts (run with server credentials)
├─ docs/            These documents, later the developer and operations guides
├─ .env.example     Variable names and descriptions, never values
└─ package.json     pnpm workspaces + Turborepo task runner
```

Choices inside the specified stack:

- **pnpm workspaces + Turborepo** for builds, lint and test caching across apps.
- **Admin panel lives inside `apps/web`** under `/admin` (separate route group and layout). One deployment, one auth session, no second app to secure. It is excluded from robots/sitemap and checked server-side on every request.
- **Expo Router** for file-based native navigation that mirrors the web URL structure, which also makes deep links straightforward.
- **zod** schemas in `packages/shared` are the single definition of every form and API payload. Web and mobile validate with them for fast feedback; the database re-validates with constraints and functions.

## 3. Where the rules live (service boundary)

The brief requires that permission and workflow rules are not duplicated across web and mobile. The proposal puts them in exactly one place: **PostgreSQL**.

```
 Web (Next.js server + browser) ─┐
                                 ├─► Supabase API (PostgREST / RPC, Auth, Storage)
 Mobile (Expo)  ─────────────────┘        │
                                          ▼
                   PostgreSQL: RLS policies + workflow functions + triggers
                                          │
                     notification_outbox  ▼
                   Edge Functions (secrets: email provider, image publishing,
                                   admin invites) ── external providers
```

| Concern | Enforced by |
| --- | --- |
| Who can read/write which row | Row Level Security on every table and storage bucket |
| Listing lifecycle (submit, approve, reject, suspend, sold/rented, archive) | `SECURITY DEFINER` SQL functions called as RPC, which check the caller's role from the database (not from client input) and write audit + status history |
| Columns a client must never set (owner, status, featured, published dates, reviewer) | `BEFORE UPDATE/INSERT` triggers that reject changes unless made inside a workflow function |
| Field validity (price ≥ 0, bedrooms range, currency exists, slug format…) | CHECK / FK constraints, mirrored by zod for UX |
| Anything needing a secret (sending email, copying approved photos to the public bucket, inviting staff) | Edge Functions using the service role, never shipped to a client |
| UI hiding of buttons | Convenience only |

The service-role key exists only in Edge Functions, the Next.js server environment (for a small number of server actions such as signed document URLs), and the bootstrap script. Clients use the anon key plus the user's session.

## 4. Authentication and roles

- Supabase Auth with email + password, email verification required before submitting listings or enquiries as a signed-in user, secure password reset. Social/OTP sign-in deferred.
- Roles are stored in a `user_roles` table (a user may hold several, e.g. `owner` + `buyer`). Every new account receives `buyer`; choosing "I want to list a property" grants `owner` through a function that applies the configured rules.
- RLS helper functions (`app.has_role('moderator')`, `app.is_staff()`) read the **table**, so revoking a role or suspending a user takes effect on the next request rather than at token expiry. A custom access-token hook may copy roles into the JWT purely for UI decisions.
- Suspended accounts: sign-in blocked via an auth hook and every write policy also checks `profiles.status = 'active'`.
- **Admin bootstrap**: `pnpm admin:bootstrap --email you@example.com` run from a trusted terminal with the service-role key. It grants `administrator` to an existing, email-verified account and writes an audit entry. There is no web form for this. After that, administrators invite moderators/agents from `/admin/users` via an Edge Function.

## 5. Media

- Uploads go to a **private** `listing-uploads` bucket under random keys (`{listing_id}/{uuid}.{ext}`), never the user's filename. Storage RLS: only the listing owner and staff can read/write objects under their listing's folder; size and MIME allowlist enforced by bucket config and re-checked server-side (magic-byte sniffing in the publishing function).
- When a listing is **approved**, the `process-jobs` Edge Function copies the approved images into a **public** `listing-public` bucket served via CDN, after checking each file's real type and stripping metadata (GPS EXIF, XMP, comments) without re-encoding; orientation is kept. When it is unpublished, those copies are removed. Drafts and rejected photos are therefore never publicly reachable, while published pages stay cacheable and SEO-friendly. See [07-operations.md](07-operations.md).
- Listing documents (floor plans, title papers) stay in a private `listing-documents` bucket and are served only through short-lived signed URLs after a permission check.

## 6. Search

- PostgreSQL only for MVP: B-tree/composite indexes on the filter columns, a generated `tsvector` for keyword search, `pg_trgm` for fuzzy location matching.
- Keyset (cursor) pagination with a stable tiebreaker (`sort_key, id`) for newest and price sorts.
- Search is exposed as one `search_listings(filters)` SQL function so web and mobile share identical behaviour. Filters are URL query parameters on web (`/search?purpose=rent&city=…&min_price=…`), parsed with the shared zod schema; the results page is server-rendered, so it works without JavaScript.
- A dedicated search service (Typesense, Meilisearch, Algolia) is worth considering only when measured p95 query time or relevance complaints justify it — roughly tens of thousands of active listings or a need for typo-tolerant ranking across many fields.

## 7. Notifications

- Enquiry, visit-request and moderation emails are written to a `notification_outbox` table inside the same transaction as the business event. A scheduled Edge Function (pg_cron, every minute) sends them through a provider adapter with exponential backoff and records the result. If no provider is configured the outbox keeps the messages and the admin dashboard shows "email not configured" instead of pretending they were sent.
- Local development uses Supabase's built-in mail catcher for auth email and a `log` adapter for app email.
- Push notifications (mobile) are opt-in and a Phase 3/5 item; declining them never blocks core use.

## 8. Configuration and branding

- **Build-time** (env): Supabase URL/anon key, site URL, feature flags for integrations.
- **Run-time, admin-editable** (`site_settings` typed table): brand name, contact email/phone/WhatsApp, default locale, default currency, enabled currencies, area units, timezone, moderation rules, upload limits, comparison size, SEO defaults, legal page content. No country, currency or contact detail is hard-coded.
- **Design tokens** (colours, type scale, radius, spacing) live in `packages/shared/tokens` and feed both Tailwind on web and the React Native theme, so a rebrand is a token change.
- Formatting uses `Intl.NumberFormat` / `Intl.DateTimeFormat` with the configured locale, currency and timezone.

## 9. Security and privacy baseline

- RLS enabled on every table from the first migration; pgTAP tests prove each policy for anon, buyer, owner (own vs other), moderator and administrator.
- Rate limits: Supabase Auth limits for sign-in/sign-up/reset; a Postgres token-bucket function for enquiries and listing submissions keyed by user or hashed IP. Optional, configurable captcha (Cloudflare Turnstile or hCaptcha) on public forms — off by default.
- Next.js: server actions with origin checks, `SameSite=Lax` HttpOnly session cookies via `@supabase/ssr`, strict security headers and CSP.
- Mobile: session tokens in encrypted storage (`expo-secure-store` key + encrypted AsyncStorage, because SecureStore values are size-limited).
- Personal data is minimised: enquiry IPs stored only as salted hashes for rate limiting; data export and account-deletion requests are workflows in the account area; retention periods are settings.
- Audit log is append-only (no update/delete policy; trigger blocks changes).

## 10. Testing approach

| Layer | Tool | What it proves |
| --- | --- | --- |
| Database | pgTAP via `supabase test db` (needs Docker) | RLS policies, workflow functions, triggers |
| Shared package | Vitest | Schemas, formatting, API client |
| Web | Playwright | Public search → detail, sign-up, submit listing, moderate, enquiry |
| Mobile | Jest + React Native Testing Library; Maestro flows optional | Core screens and flows |
| CI | GitHub Actions (once Git and a remote exist) | Lint, type-check, tests, migration check |

Every milestone report will list which of these actually ran.
