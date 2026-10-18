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

Status 2026-10-18: **built; lint, typecheck and production build pass; core flows checked by hand in a browser against the local stack.** No automated browser tests yet.

| Area | Built | How it was checked |
| --- | --- | --- |
| Design system | Tokens → Tailwind theme, accessible form fields, buttons, alerts, badges, cards, empty states, focus styles, skip link | Label check on the search filters (28/28 fields labelled); mobile layout at 375 px (no horizontal scroll) |
| Public pages | Home (featured + recent), search (all filters as shareable URLs, sort, keyset “Next page”), listing page (gallery, facts, amenities, location + OpenStreetMap link, contact card, JSON-LD, breadcrumbs, canonical redirect), About/Contact/Privacy/Terms (admin-edited, unpublished notice by default), sitemap, robots, 404/error pages | Browser: home, filtered search + sort, listing page, JSON-LD present |
| Search backend | `search_listings` RPC | 17 pgTAP checks |
| Auth | Sign up (email confirmation), sign in, sign out, forgot/reset password, email-link callback, session-refresh proxy, `?next=` redirects | Browser: sign in/out as demo owner and moderator, redirect to sign-in for private pages. **Not checked:** sign-up email confirmation and password reset via Mailpit |
| Account | Overview, profile, privacy (data copy, deletion request), saved homes, enquiries inbox + detail (reply status, confirm/decline/cancel visits), my listings | Browser: enquiry received by owner and marked replied; saving a home. **Not checked:** visit confirm/decline in the UI, deletion request |
| Owner listing flow | Guided form (all fields, cascading location pickers), draft → photos (upload, previews, alt text, cover, reorder, remove) → submit → withdraw / sold / rented / archive / restore, moderator notes, history | Browser: create draft, refused submit without photo, upload photo, submit. **Not checked:** editing a live listing in the UI (covered by pgTAP), reorder/remove photo |
| Moderation & admin | Dashboard, listings table (filter, search, paging), review page (private photo previews, all details, approve/reject/suspend/reinstate with reasons, feature, assign agent), users (roles, suspend), enquiries, types/amenities/places, settings + currencies, content pages, privacy requests, audit log, CSV exports | Browser: moderation queue, approve as moderator, moderator blocked from Settings. 17 pgTAP checks for admin RPCs/audit. **Not checked in the browser:** administrator-only pages (users, settings, taxonomy, content, exports) |
| Photos & email | Worker publishes metadata-free copies and asks the website to refresh its cache | Browser: approved listing showed its published photo on the home page after the worker ran |
| Deferred | Comparison view, curated location/type landing pages (table exists), Playwright suite, Lighthouse/axe audit | — |

## Phase 3 — Mobile MVP

Expo Router app on the same backend: onboarding/sign-in, search + filters, detail with gallery, favorites, enquiry/visit request, profile, owner submission with camera/library upload, my listings, role-appropriate dashboard. Encrypted session storage, offline/error states, deep links to listing URLs. EAS build profiles (development, preview, production); store submission documentation.

## Phase 4 — Hardening and launch readiness

RLS/authorization review, cross-platform flow verification, accessibility and responsive review, query plans for search, image performance, production Supabase project with backups/PITR decision, monitoring (Sentry or similar), spend alerts, email sender domain (SPF/DKIM/DMARC), restore drill, privacy and store disclosure docs, launch checklist with what was and was not exercised.

## Phase 5 — Optional growth (owner approval per item)

Maps and geocoding, payments/featured packages, analytics, reviews, agent verification, push notifications, CSV import, automated listing expiry, advanced reporting, pending-revision moderation, dedicated search service.

## MVP definition of done (from the brief)

Tracked as a checklist in the Phase 4 report; each item names the test or manual check that proved it.
