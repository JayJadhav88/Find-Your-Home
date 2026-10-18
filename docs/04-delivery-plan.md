# 04 · Delivery plan

Each milestone leaves the repository runnable and ends with a report: what changed, files touched, checks actually run with results, configuration still needed, known limitations, next step.

## Phase 0 — Architecture (this delivery)

Docs `01`–`06`. No code. Exit: owner answers the blocking questions in [06-open-questions.md](06-open-questions.md).

## Phase 1 — Secure platform foundation

| Milestone | Content | Verified by |
| --- | --- | --- |
| 1.1 Repo scaffold | pnpm + Turborepo workspaces, `packages/config`, empty Next.js and Expo apps that build, `.env.example`, env validation (zod) for each app, README skeleton | `pnpm build`, `pnpm lint`, `pnpm typecheck` |
| 1.2 Schema | Migrations for all tables in `02-data-model.md`, enums, constraints, indexes, `updated_at` triggers, reference-code sequence | `supabase db reset` applies cleanly |
| 1.3 RLS + workflow | RLS for every table, helper role functions, protected-column triggers, listing transition functions, rate-limit function, audit log | pgTAP suite covering every cell of `03-permissions.md` |
| 1.4 Auth + roles | Sign-up profile/role triggers, suspension hook, email verification, `scripts/admin-bootstrap` | pgTAP + manual bootstrap run against local stack |
| 1.5 Storage | Buckets, storage policies, MIME/size limits, publish/unpublish Edge Function skeleton | pgTAP storage policy tests; function unit tests |
| 1.6 Shared package | zod schemas, generated DB types, API client (`listings`, `search`, `favorites`, `enquiries`), `Intl` formatters, design tokens | Vitest |
| 1.7 Seed + docs | Clearly labelled DEMO seed (types, amenities, sample locations, sample listings with placeholder images), README setup/troubleshooting | Fresh-clone setup run end to end |

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
