# 09 · Mobile app (iOS and Android)

`apps/mobile` is one Expo (SDK 58) app for iPhone and Android, using the same Supabase backend, the same database rules and the shared `@fyh/shared` code as the website.

## What it does

| Area | Screens |
| --- | --- |
| Explore | Category tabs **All / Rent / Resale / New projects**, keyword search, filters (city, bedrooms, maximum price, sort), endless scrolling, pull to refresh |
| Property | Swipeable photos, price, category, **New-project section with verified builder**, key facts, description, amenities, **YouTube/Instagram videos (play button; nothing loads until tapped)**, map link, call / WhatsApp / email, Save, Share, enquiry or visit request |
| Saved | Saved homes; unavailable ones can be removed |
| My listings | Turn on listing, list of own listings with status, **editor** (Rental/Resale for everyone, **New project for verified builders** with project name and registration number), price, location, size, amenities, **video links**, contact preferences, **photos from the gallery or camera** (converted to JPEG, max 1600 px), submit / withdraw / sold / rented / archive / restore, moderator notes |
| Account | Profile, enquiries (received and sent, confirm/decline visits), data copy request, account deletion request, privacy and terms (open the website), sign out |
| Sign-in | Sign in, create account (email confirmation), forgot password (finishes on the website) |

Security: the session is stored encrypted (key in the iOS Keychain / Android Keystore via `expo-secure-store`, encrypted data in app storage). Only the publishable Supabase key ships in the app. Everything a user may do is enforced by the database, exactly as for the website.

## Try it on your phone (no app store needed)

1. Install **Expo Go** from the App Store or Google Play. It must be a version that supports **SDK 58** (if the store version is older, use a preview build below).
2. Your phone and this computer must be on the same Wi-Fi. Find the computer's address: run `ipconfig` and note the IPv4 address (e.g. `192.168.1.106`).
3. Put that address in `apps/mobile/.env.local` (not committed):

```
EXPO_PUBLIC_SUPABASE_URL=http://192.168.1.106:44321
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key from `pnpm exec supabase status`>
EXPO_PUBLIC_SITE_URL=http://192.168.1.106:3000
```

4. Start the database (`pnpm db:start`) and the app (`pnpm --filter @fyh/mobile start`), then scan the QR code with the phone camera (iPhone) or Expo Go (Android). Windows may ask to allow Node.js on private networks: allow it.

The demo accounts from `supabase/seed.sql` work in the app (e.g. `demo.builder@example.test` to list a new project).

> Running Docker, the database, the website and the app's bundler together is heavy for a laptop. Close other programs, keep the laptop plugged in, and stop what you don't need (`pnpm db:stop`).

## Checks

```bash
pnpm --filter @fyh/mobile typecheck
pnpm --filter @fyh/mobile lint
pnpm --filter @fyh/mobile test        # Jest: encrypted session storage, display helpers
pnpm --filter @fyh/mobile export:check   # builds the iOS + Android JavaScript bundles
```

## Building for the stores (EAS)

Builds run in Expo's cloud, so no Mac or Android Studio is needed. **Nothing here has been run yet**; each step needs your accounts and decisions.

What you need to provide:

| Item | Why |
| --- | --- |
| Expo account | Runs the cloud builds (`npx eas-cli@latest login`) |
| Apple Developer Program (about US$99/year) and an App Store Connect app | Required to publish on the App Store and use TestFlight |
| Google Play developer account (about US$25 one-time) and a Play Console app | Required to publish on Google Play |
| **App identifiers** (e.g. `com.yourcompany.findyourhome`) | Permanent once published. Currently obvious placeholders (`com.example.findyourhome`) in `eas.json`; replace before the first build |
| App icon and splash artwork | Currently the Expo template images |
| Hosted Supabase URL and publishable key | Set as EAS environment variables (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_SITE_URL`) for the `preview` and `production` environments with `eas env:create` — never the secret key |
| Privacy policy URL, support contact | Required by both stores (the website's `/privacy` once published) |

Steps:

1. `npx eas-cli@latest login`, then `npx eas-cli@latest init` in `apps/mobile` (creates the EAS project; put its id in the environment as `EAS_PROJECT_ID` or let the CLI add it).
2. Set the identifiers in `eas.json` and the environment variables above.
3. Internal test build: `npx eas-cli@latest build --profile preview --platform android` (an installable APK) or `--platform ios` (needs Apple device registration).
4. Store build: `npx eas-cli@latest build --profile production --platform all`, then `npx eas-cli@latest submit --platform ios|android`.

### Store privacy answers (draft — review with your adviser)

Data the app collects: name, email address, phone number (optional), messages sent to listers, photos the user uploads for listings, and the user's saved homes and listings. It does not use location services, advertising identifiers, tracking or analytics SDKs. Data is used to provide the service (accounts, listings, enquiries) and is not sold. Users can request a copy or deletion in **Account → Privacy**. The camera and photo library are used only when the user adds listing photos; the microphone is blocked.

## Known limits

- Not tested on a physical device or simulator in this environment (no Android SDK or Mac here). Verified: types, lint, unit tests and the iOS/Android bundle build — see the delivery plan for results.
- HEIC conversion relies on the phone's image decoder (works on iOS 11+ and Android 9+ in general; confirm on a real iPhone).
- Push notifications are not included (optional later feature).
- Visit times are typed as date and time (`2026-11-05`, `14:30`) in the phone's time zone; a native date picker can be added later.
