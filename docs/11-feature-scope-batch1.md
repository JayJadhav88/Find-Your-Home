# 11 · Partner feature scope: Batch 1

What was built from `Real_Estate_App_Master_Feature_Scope.xlsx` (2026-10-20), how to use it, and what still needs a decision. Nothing here needs a paid service.

## Admin access and roles

- **First admin.** `node scripts/admin-bootstrap.mjs --create --email you@example.com` creates a confirmed account with a one-time password saved to `.secrets/first-admin.txt` (git-ignored, never printed). The password must be changed at first sign-in; the old one stops working. There is no shared or master password. Remove the account later from Admin → Team & roles once someone else is a super admin.
- **Team & roles** (staff) and **Customers** (members) are separate admin pages. Roles:

| Role | Can do |
| --- | --- |
| Super admin | Everything, including integrations, settings, roles and feature switches |
| Moderator | Review listings, reports, builders, leads |
| CRM manager | All leads: assign, status, notes, add leads |
| Sales agent | Only leads assigned to them: status, notes, call log (cannot reassign) |
| Support | All leads, as before |
| Content manager | Pages, home banners, floating button |
| Marketing | Send messages to members |

The database enforces each row; the admin menu only shows what a role may open.

## Leads (Admin → Leads & enquiries)

- One place for every lead: property enquiries, the **Contact us** form (website and app), and leads the team adds by hand (walk-ins, calls).
- Pipeline: New → Assigned → Contacted → Qualified → Visit scheduled → Negotiation → Won / Lost / Unqualified (plus Responded, Closed, Spam from before). Lost and Unqualified need a reason.
- Each lead shows its source (website, app, contact form, QR, manual) and campaign tags (`utm_*` from the first visit, kept 30 days), lead age, first-response time, a call log (outcome + note), a full history, and a warning when the same phone or email already has other leads.
- Google Sheets rows now include type, interest, source and lost reason.
- **Brokerage model:** if leads should go to your team rather than to owners, switch off Admin → Settings → "Owners receive enquiries for their own listings".

## Projects and builders (Admin → Builders)

- Builders are their own records (add, edit, hide, merge duplicates). Each has a public page `/builders/<name>` with its live projects.
- New projects carry configurations (2 BHK, 3 BHK …), price range, launch date and construction stage (Upcoming / Under construction / Ready). The registration number is shown as "checked by our team" only after a moderator ticks it on the review page.
- Owners can mark a live listing **Under negotiation** or **Unavailable** without a new review (website account page and app editor). Unavailable listings leave search.

## Location search (OpenStreetMap)

- Search by PIN code, by a typed place ("near Baner, Pune"), or by the visitor's location (asked only when they tap "Use my location"; rounded to about 100 m and kept only in the search address, or in a saved search if the member saves it). Choose 2, 5, 10 or 25 km (the list is the `radius_options` site setting; no admin screen for it yet) and sort by nearest.
- Places are looked up with OpenStreetMap's free Nominatim service, following its usage policy: one request a second from the server, results cached, a named User-Agent, 30 lookups per visitor per hour, and "Places found with OpenStreetMap" shown. Listings are placed automatically from their locality/city/PIN after saving; approximate addresses are rounded to about 1 km.
- For heavy traffic later, switch to a paid geocoder or a self-hosted Nominatim; only `supabase/functions/_shared/geocode.ts` changes.

## Site content (Admin → Site content)

- **Home banners** with image upload, button link, website/app/both, start and end time, order. **Floating button** (e.g. WhatsApp) on every page and in the app. Clicks are counted per day; links go through `/go/…` so only addresses saved by the team can be opened.
- **Feature switches** (super admins): referral programme, videography, phone OTP, AI recommendations, pop-up, map view. All off; they reserve the switch for later batches and change nothing yet.

## Checks run (2026-10-20)

Database tests 13 files / 357 passing; Edge Function unit tests 87; shared unit tests 73; app typecheck, lint, Jest (10); website typecheck, lint and production build; Playwright (see the delivery plan). Browser check: Contact us form creates a lead (source "contact_form"); "near a place" search looks up Baner, Pune through the local function and adds coordinates. Found and fixed during the check: the contact page showed "not found" until its text was published; a search link naming a place without coordinates skipped the lookup.

Not checked on a phone yet: the app's near-me (location permission), banners, Contact us and new editor fields. They pass typecheck, lint and unit tests.

## Needs your decision (later batches)

- **Pilot:** referral programme (who can refer, reward amount, when it is paid, terms) and videography booking (cities served, price or free, cancellation terms).
- **Next:** map view, recently viewed, similar properties, QR codes for listings, CSV lead import, daily lead summary, site-visit booking, pop-up, brochure downloads.
- **Future (needs paid services or legal review):** comparison, loan/EMI calculators, AI recommendations, phone OTP (SMS provider), online payments.
