# 04 · Delivery plan

Each milestone leaves the repository runnable and ends with a report: what changed, files touched, checks actually run with results, configuration still needed, known limitations, next step.

## Phase 0 — Architecture (this delivery)

Docs `01`–`06`. No code. Exit: owner answers the blocking questions in [06-open-questions.md](06-open-questions.md).

## Phase 1 — Secure platform foundation

| Milestone | Content | Verified by | Status (2026-10-18) |
| --- | --- | --- | --- |
| 1.1 Repo scaffold | pnpm + Turborepo workspaces, `packages/config`, Next.js and Expo apps that build, `.env.example`, env validation (zod), README skeleton | `pnpm build`, `pnpm lint`, `pnpm typecheck`, Android bundle export | ✅ Done |
| 1.2 Schema | Migrations for all tables in `02-data-model.md`, enums, constraints, indexes, `updated_at` triggers, reference-code sequence | `supabase db reset` applies cleanly | ✅ Done |
| 1.3 RLS + workflow | RLS for every table, helper role functions, protected-column triggers, listing transition functions, rate-limit function, audit log | pgTAP suite against `03-permissions.md` | ✅ Done — 78 pgTAP checks pass. Not yet covered by tests: agent-assigned listings, admin taxonomy/settings writes, data-request RPCs, moderator access to settings |
| 1.4 Auth + roles | Sign-up profile/role trigger, suspension (ban + session revoke), email verification required, `scripts/admin-bootstrap.mjs` | pgTAP + bootstrap run against the local API | ✅ Done |
| 1.5 Storage | Buckets, storage policies, MIME/size limits, publish/unpublish worker | pgTAP storage policy tests; worker tests | ✅ Done — buckets/policies (pgTAP), `process-jobs` photo publishing with metadata stripping and `send-emails` (log + Resend adapters): 22 unit tests + 14-step local end-to-end smoke test. Hosted scheduling (pg_cron) documented, not yet run |
| 1.6 Shared package | zod schemas, generated DB types, API client, `Intl` formatters, design tokens | Vitest | 🟡 Generated types, enum-sync test, formatters, env validation, tokens done (22 tests). Form schemas and API client move to Phase 2, where the first screens use them |
| 1.7 Seed + docs | Clearly labelled DEMO seed, README setup/troubleshooting | Fresh setup run end to end | ✅ Done (demo listings have no photos yet) |

## Phase 2 — Web MVP

Status 2026-10-18: **built; lint, typecheck and production build pass; 32 Playwright browser tests pass (twice in a row) against the local stack** — see [apps/web/e2e/README.md](../apps/web/e2e/README.md). Earlier manual browser testing found and fixed: signed-in pages hanging under Next 16 prerendering, suspended users getting HTTP 500 at sign-in, stale listing photos after approval, local image optimisation blocked, duplicate form ids and ambiguous button names in admin.

Known behaviour: a missing or unpublished listing renders “Page not found” with `noindex` but HTTP status 200, because listing pages stream (Next.js sends the status before the lookup finishes). Truly unknown routes return 404.

| Area | Built | How it was checked |
| --- | --- | --- |
| Design system | Tokens → Tailwind theme, accessible form fields, buttons, alerts, badges, cards, empty states, focus styles, skip link | Label check on the search filters (28/28 fields labelled); mobile layout at 375 px (no horizontal scroll) |
| Public pages | Home (featured + recent), search (all filters as shareable URLs, sort, keyset “Next page”), listing page (gallery, facts, amenities, location + OpenStreetMap link, contact card, JSON-LD, breadcrumbs, canonical redirect), About/Contact/Privacy/Terms (admin-edited, unpublished notice by default), sitemap, robots, 404/error pages | Browser: home, filtered search + sort, listing page, JSON-LD present |
| Search backend | `search_listings` RPC | 17 pgTAP checks |
| Auth | Sign up (email confirmation), sign in, sign out, forgot/reset password, email-link callback, session-refresh proxy, `?next=` redirects | e2e: sign-up with email confirmation (Mailpit), unconfirmed sign-in refused, password reset (mismatch, new works, old fails), no account enumeration |
| Account | Overview, profile, privacy (data copy, deletion request), saved homes, enquiries inbox + detail (reply status, confirm/decline/cancel visits), my listings | Browser: enquiry received by owner and marked replied; saving a home. **Not checked:** visit confirm/decline in the UI, deletion request |
| Owner listing flow | Guided form (all fields, cascading location pickers), draft → photos (upload, previews, alt text, cover, reorder, remove) → submit → withdraw / sold / rented / archive / restore, moderator notes, history | e2e: create draft, submit refused without photo, JPEG upload + alt text, non-image refused, submit, archive. **Not automated:** editing a live listing in the UI (covered by pgTAP), photo reorder/remove |
| Moderation & admin | Dashboard, listings table (filter, search, paging), review page (private photo previews, all details, approve/reject/suspend/reinstate with reasons, feature, assign agent), users (roles, suspend), enquiries, types/amenities/places, settings + currencies, content pages, privacy requests, audit log, CSV exports | Browser (manual): users (grant/remove role, suspend → sign-in refused, reactivate), settings (save, invalid time zone, currency), taxonomy (amenity, neighbourhood with inherited country), content page (Markdown, script stays inert), exports + audit log. e2e: moderation approve, users, settings, amenity, export audit, moderator/buyer blocked. 17 pgTAP checks |
| Photos & email | Worker publishes metadata-free copies and asks the website to refresh its cache | Browser: approved listing showed its published photo on the home page after the worker ran |
| Deferred | Comparison view, curated location/type landing pages (table exists), full Lighthouse/axe audit (only label/id/tap-target checks are automated) | — |

## Phase 2b — Primary business features (2026-10-18)

| Feature | Built | Checked by |
| --- | --- | --- |
| Categories: Rental, Resale, New project | `listing_category` on every listing (kept in sync with sale/rent), category filter in search, navigation, home "New projects" section, badges, breadcrumbs | pgTAP (category rules, search), e2e |
| Builders | `builder` role granted by admins, public company profile shown as "Verified builder", project name and registration number; only builders can list New project (database rule) | pgTAP, e2e |
| YouTube / Instagram videos | Up to 10 per listing from links (only the video id is stored), click-to-load player on the listing page and the admin review page | Unit tests (link parsing), pgTAP (validation, visibility), e2e (no third-party load before play) |
| Excel bulk import | Admin page with template download (live lists sheet), check-then-import with per-row problems, owner and publish/review choice, recent imports; image links downloaded safely by the worker, broken links reported | Unit tests (parsing, SSRF guards), pgTAP (permissions, per-row isolation, audit), e2e (end to end with a real image download) |

See [08-excel-import-guide.md](08-excel-import-guide.md) for the administrator guide.

## Phase 3 — Mobile MVP

Expo Router app on the same backend: onboarding/sign-in, search + filters, detail with gallery, favorites, enquiry/visit request, profile, owner submission with camera/library upload, my listings, role-appropriate dashboard. Encrypted session storage, offline/error states, deep links to listing URLs. EAS build profiles (development, preview, production); store submission documentation.

## Phase 4 — Hardening and launch readiness

RLS/authorization review, cross-platform flow verification, accessibility and responsive review, query plans for search, image performance, production Supabase project with backups/PITR decision, monitoring (Sentry or similar), spend alerts, email sender domain (SPF/DKIM/DMARC), restore drill, privacy and store disclosure docs, launch checklist with what was and was not exercised.

## Phase 5 — Optional growth (owner approval per item)

Maps and geocoding, payments/featured packages, analytics, reviews, agent verification, push notifications, CSV import, automated listing expiry, advanced reporting, pending-revision moderation, dedicated search service.

## MVP definition of done (from the brief)

Tracked as a checklist in the Phase 4 report; each item names the test or manual check that proved it.
