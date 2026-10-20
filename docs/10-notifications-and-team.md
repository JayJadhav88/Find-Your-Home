# 10 · Notifications, team access and lead management

What this phase added, and what you (the owner) need to set up for each part. Everything works on the website and in the phone app.

## For members

| Feature | Where |
| --- | --- |
| Notification inbox with unread count | Website: bell in the header → Notifications. App: Account tab badge → Notifications |
| "Usually reviewed within N hours" after submitting a listing | Message after Submit, on the listing page, and as a notification. Set N in Admin → Settings → Notifications |
| Choose channels: email, phone/browser, WhatsApp (with consent), saved-search alerts, quiet hours, time zone | Website: Notifications → How we contact you. App: Notifications → Notification settings |
| Browser notifications (even when the site is closed) | Website: Notifications → Turn on browser notifications. iPhone: add the site to the Home Screen first |
| Phone notifications (even when the app is closed) | App: asked after submitting a listing, or Notification settings → Turn on phone notifications. **Needs an installed build, not Expo Go on Android** |
| Saved searches with alerts | Website: Search → Save search & get alerts; Account → Saved searches. App: Explore → Save this search; Account → Saved searches |
| Report a listing | Bottom of every listing (website and app) |
| Views, enquiries and saves per listing; renew before expiry | My listings (website and app) |
| Google sign-in | Sign-in and sign-up pages, once set up (below) |

Every notification is always kept in the in-app inbox. Email, push and WhatsApp follow each person's choices. WhatsApp is only used after the person switches it on, enters their number and agrees (the time of consent is recorded).

## For the team

### Roles (Admin → Team & roles)

Batch 1 added CRM manager, Sales agent and Content manager, and split members into Admin → Customers. The current table is in [11-feature-scope-batch1.md](11-feature-scope-batch1.md).

| Role | Can do |
| --- | --- |
| Super admin (administrator) | Everything, including integrations, settings, users and roles |
| Moderator | Review listings, reports and fraud warnings, handle enquiries |
| Support | Enquiries only: see all, assign, change status, notes |
| Marketing | Send messages to members (broadcasts) |

Team roles need a verified email address. The admin menu only shows what a role may open, and the database enforces the same rules.

### Enquiries (Admin → Enquiries)

Counts by status, filters (assigned to me, not assigned, follow-up due), and a page per enquiry with Email / Call / WhatsApp buttons, status (New → Contacted → Visit scheduled → Responded → Closed / Spam), team owner, follow-up date and internal notes (never shown to listers or visitors).

**Alerts for new enquiries**: each team member chooses in their own Notifications page → Team alerts: in app, email, phone/browser, WhatsApp. Moderators and super admins also choose how they hear about listings waiting for review.

### Sending a message (Admin → Send a message)

Audience (everyone, owners, members who don't list, builders, team) and optionally a city; channels (always in the app; plus phone/browser, email, WhatsApp); now or scheduled. Outside the app, messages only reach people who ticked "news" in their profile, at most *N* per week (Admin → Settings), and wait for quiet hours to end. Each message shows delivered / read / sent / failed counts. Emails include an opt-out line.

### Reports and fraud warnings (Admin → Reports, and on each listing review)

Visitors can report a listing. Moderators see open reports and, on each listing, automatic warning signs: photos reused on another person's listing, the owner's phone shared with other accounts, 10+ listings in a day, price under a third of similar homes in the same city. These are signals for a human decision, not proof.

### Listing expiry (Admin → Settings → Listings expire after)

Default 90 days (0 = never). Owners get a reminder 7 days before; expired listings are hidden and come back immediately when the owner taps Renew (no new review, because nothing changed).

## Setting up the integrations (Admin → Integrations)

Keys are stored encrypted in Supabase Vault. After saving, they can't be viewed again, only replaced or removed. Each section has a "Send a test" button and the page shows a delivery log.

### Email: Resend

1. Create an account at resend.com, add and verify your domain (DNS records for SPF/DKIM).
2. Create an API key with "sending access".
3. In Integrations: paste the key, set "Send from" (e.g. `Find Your Home <notifications@yourdomain.com>`), save, send a test.

### WhatsApp: Meta WhatsApp Cloud API

1. In Meta Business Manager, create a WhatsApp Business account and add a phone number (it can't be a number already used in the WhatsApp app).
2. Complete business verification (needed for normal sending limits).
3. Create a **system user** with a permanent access token and the `whatsapp_business_messaging` permission.
4. Create message templates and wait for approval:
   - an **Utility** template, e.g. `account_update`, body: `{{1}}: {{2}}` (1 = title, 2 = message);
   - a **Marketing** template for broadcasts, e.g. `news_update`, same two variables.
5. In Integrations: paste the phone number ID (WhatsApp Manager → API setup), the template names and languages, and the token; tick "Send WhatsApp messages"; save; send yourself a test (switch WhatsApp on in your own notification settings first).

Meta charges per conversation/message (prices differ for utility and marketing and by country). Check current pricing in Meta's documentation before launch.

### Phone notifications (Expo push)

Phone push needs an installed build of the app (see [09-mobile-app.md](09-mobile-app.md), EAS). Steps: `npx eas-cli@latest init` in `apps/mobile` (gives the project ID used by `EAS_PROJECT_ID`), then for Android add Firebase credentials with `npx eas-cli@latest credentials` (FCM V1 service account), and for iOS EAS creates the push key during the first build. The Expo access token in Integrations is only needed if you turn on "enhanced push security" in your Expo account.

### Browser notifications (Web Push)

1. Run `pnpm setup:web-push --print` once. Keep the output safe and **never change it later** (changing it stops all existing browser subscriptions).
2. Hosted Supabase: `pnpm exec supabase secrets set WEB_PUSH_PUBLIC_KEY=… WEB_PUSH_PRIVATE_KEY=…`.
3. Website hosting (e.g. Vercel): set `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY` to the same public key and redeploy.

Locally, `pnpm setup:web-push` writes the keys into the local env files.

### Google Sheets (enquiries)

1. Create a Google Sheet. Open Extensions → Apps Script and paste the script shown in Integrations → Google Sheets (also in `apps/web/src/lib/sheets-script.ts`).
2. In Integrations, click **Create a new secret** and paste it into the script in place of `PASTE_SECRET_HERE`.
3. In Apps Script: Deploy → New deployment → Web app; Execute as: *Me*; Who has access: *Anyone*. Authorize, then copy the URL ending in `/exec`.
4. Paste the URL in Integrations, tick "Copy enquiries to my Google Sheet", save. Optionally click "Send all existing enquiries to the sheet".

Each enquiry is one row (updated when its status or owner changes). The sheet contains visitors' names, emails, phone numbers and messages: share it only with people who need it.

### Google sign-in

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → Web application.
2. Authorized redirect URI: `https://<your-project>.supabase.co/auth/v1/callback` (locally `http://127.0.0.1:44321/auth/v1/callback`).
3. Supabase Dashboard → Authentication → Providers → Google: paste client ID and secret, enable. Authentication → URL configuration: add your site URL and `findyourhome://**` to redirect URLs.
4. Set `NEXT_PUBLIC_GOOGLE_SIGN_IN=true` (website) and `EXPO_PUBLIC_GOOGLE_SIGN_IN=true` (app build) to show the button.

Locally: set `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` in the shell, set `enabled = true` under `[auth.external.google]` in `supabase/config.toml`, and restart the database stack.

## Privacy notes for your policy and store answers

- New data collected: notification preferences, WhatsApp number and consent time (only if the member opts in), device push tokens and browser push subscriptions, saved searches, listing reports, daily view counts per listing (no personal data: one count per visitor per day using a random browser id, or the IP hash for app visitors).
- Enquiry details may be copied to the owner's Google Sheet (if connected) and are shared with Google as a processor.
- WhatsApp messages are sent through Meta. Emails go through Resend. Push notifications go through Expo/Google/Apple and the browsers' push services.

## Not verified on this computer

- Real delivery through Resend, Meta WhatsApp, Expo push, Apple/Google push and Google Sheets (needs your accounts). Request formats follow the providers' documentation and are covered by unit tests with fake responses. Browser push was checked to the point of Google's push service accepting the signed request.
- Phone push and Google sign-in in a real app build (Expo Go on Android can't receive push).
- Browser notifications could not be switched on in the test browser (it blocks permission prompts); the page's "blocked" message was checked instead.
