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
| 1.5 Storage | Buckets, storage policies, MIME/size limits, publish/unpublish worker | pgTAP storage policy tests; worker tests | 🟡 Buckets and policies done and tested. **Publish/unpublish Edge Function and email sender not built yet** (jobs and emails queue up in `job_queue` / `notification_outbox`) |
| 1.6 Shared package | zod schemas, generated DB types, API client, `Intl` formatters, design tokens | Vitest | 🟡 Generated types, enum-sync test, formatters, env validation, tokens done (22 tests). Form schemas and API client move to Phase 2, where the first screens use them |
| 1.7 Seed + docs | Clearly labelled DEMO seed, README setup/troubleshooting | Fresh setup run end to end | ✅ Done (demo listings have no photos yet) |

## Phase 2 — Web MVP

1. Design system: tokens → Tailwind, base components (button, field, select, dialog, toast, card, gallery, pagination) with focus states and labels.
2. Public pages: home, search (URL filters, server-rendered, keyset pagination), listing detail (gallery, facts, map link, enquiry form), property-type and location landing pages, about/contact, legal placeholders.
3. Auth pages: sign up, sign in, verify email, reset password.
4. Account: profile, favorites, comparison, sent enquiries, data export/deletion request.
5. Owner: listing wizard (draft autosave, photo upload/reorder/alt text, preview, submit), my listings with status and moderation reasons, leads (if enabled).
6. Admin: dashboard, listings table + review page, moderation actions with reasons, users and roles, taxonomy, settings, enquiries, audit log, CSV export.
7. Email: outbox processor + provider adapter + templates.
8. SEO: metadata, canonical URLs, Open Graph, JSON-LD (`RealEstateListing`/`Offer` from validated fields only), breadcrumbs, sitemap, robots.
9. Playwright suite for the MVP definition-of-done flows; Lighthouse/axe checks on key pages.

## Phase 3 — Mobile MVP

Expo Router app on the same backend: onboarding/sign-in, search + filters, detail with gallery, favorites, enquiry/visit request, profile, owner submission with camera/library upload, my listings, role-appropriate dashboard. Encrypted session storage, offline/error states, deep links to listing URLs. EAS build profiles (development, preview, production); store submission documentation.

## Phase 4 — Hardening and launch readiness

RLS/authorization review, cross-platform flow verification, accessibility and responsive review, query plans for search, image performance, production Supabase project with backups/PITR decision, monitoring (Sentry or similar), spend alerts, email sender domain (SPF/DKIM/DMARC), restore drill, privacy and store disclosure docs, launch checklist with what was and was not exercised.

## Phase 5 — Optional growth (owner approval per item)

Maps and geocoding, payments/featured packages, analytics, reviews, agent verification, push notifications, CSV import, automated listing expiry, advanced reporting, pending-revision moderation, dedicated search service.

## MVP definition of done (from the brief)

Tracked as a checklist in the Phase 4 report; each item names the test or manual check that proved it.
