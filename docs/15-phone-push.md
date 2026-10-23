# 15 · Phone push notifications (Android test build)

> **Update 2026-10-23:** the `preview` build now talks to the **live** site (its `EXPO_PUBLIC_*` values are stored in Expo for the `preview` environment), so Part D is done and plain-http access is off. After adding `google-services.preview.json` (Part B), add `"APP_GOOGLE_SERVICES_FILE": "./google-services.preview.json"` back to the `preview` profile in `apps/mobile/eas.json` for push notifications.

These steps get notifications onto an Android phone even when the app is closed. Everything here is free. **Expo Go can't receive push notifications**, so you'll install a test build of the app (an APK) instead. It talks to the database on this laptop, so the phone and laptop must be on the same Wi-Fi or hotspot.

Run the commands in a terminal inside `find-your-home\apps\mobile`. The ones that ask for a password you type yourself; never paste passwords or keys into chat.

## Part A · Expo account (5 minutes)

1. Create a free account at https://expo.dev/signup.
2. Sign in from the terminal:
   ```
   npx.cmd eas-cli@latest login
   ```
3. Link the project to your account:
   ```
   npx.cmd eas-cli@latest init
   ```
   Answer **Yes** to create a project. It adds a project ID to `app.json`.

## Part B · Firebase (10 minutes)

Use the same Google account and project as Google sign-in (`findyourhome-512401`).

1. Open https://console.firebase.google.com → **Create a project** → **Join an existing Google Cloud project** (or "Add Firebase to a Google Cloud project") → pick **findyourhome**. Google Analytics is optional; you can switch it off.
2. On the project home, click the **Android** icon ("Add app"):
   - **Android package name:** `com.findyourhome.app.preview` (exactly)
   - **App nickname:** `Find Your Home (preview)`
   - Skip the SHA-1 field → **Register app**.
3. Click **Download google-services.json**. Save it as **`apps\mobile\google-services.preview.json`** (rename it). Skip the remaining Firebase steps ("Add Firebase SDK" and so on); Expo handles those.
4. Click the gear icon → **Project settings** → **Service accounts** → **Generate new private key** → **Generate key**. A file like `findyourhome-512401-firebase-adminsdk-….json` downloads. **This one is secret.** Keep it in your Downloads folder; git is set up to ignore it.

## Part C · Give the key to Expo (3 minutes)

```
npx.cmd eas-cli@latest credentials
```

Choose **Android** → **preview** → **Google Service Account** → **Manage your Google Service Account Key for Push Notifications (FCM V1)** → **Set up a Google Service Account Key for Push Notifications (FCM V1)** → **Upload a new service account key**. Then give the path to the secret file from Part B step 4.

## Part D · Tell the build where the database is (2 minutes)

Cloud builds can't see `apps\mobile\.env.local`, so set the same three public values in Expo. Use this laptop's current address (`ipconfig` → IPv4, today `192.168.43.91`):

```
npx.cmd eas-cli@latest env:set --environment preview --visibility plaintext --name EXPO_PUBLIC_SUPABASE_URL --value http://192.168.43.91:44321
```
```
npx.cmd eas-cli@latest env:set --environment preview --visibility plaintext --name EXPO_PUBLIC_SITE_URL --value http://192.168.43.91:3000
```
```
npx.cmd eas-cli@latest env:set --environment preview --visibility plaintext --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <the EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY value from apps\mobile\.env.local>
```

The publishable key is designed to be public, so plaintext is fine.

## Part E · Build and install (20–30 minutes, mostly waiting)

```
npx.cmd eas-cli@latest build --profile preview --platform android
```

The build runs on Expo's servers (free plan: it may wait in a queue). When it finishes, the terminal shows a link and a QR code. Open it on the phone, download the APK and install it. Android will ask to allow installs from your browser.

## Part F · Try it

1. Make sure `start-local.cmd` is running, including the **background jobs** window.
2. On the phone, open **Find Your Home (preview)** and sign in (e.g. `demo.buyer@example.test`). Go to **Account → Notifications → Notification settings → Turn on phone notifications**, allow notifications, and make sure **Phone notifications** is on. Then **Save**.
3. Close the app completely.
4. On the laptop, sign in as an admin and go to **Admin → Send a message**. Write a title and message, tick **Phone and browser notifications**, and send it now (or a minute from now with **Send later**).
5. Within about 30 seconds the notification appears on the phone. Tapping it opens the app.

## Good to know

- If the laptop's Wi-Fi address changes, repeat the first two commands in Part D with the new address and build again.
- The test build has its own package name (`…preview`), so it installs next to Expo Go and a future store app.
- **Before the Play Store:** choose the permanent package name (the `production` profile in `eas.json` still uses a placeholder). Register it in Firebase the same way, upload the same key under **production**, and point the database settings at the live server.
- **iPhone** push needs an Apple Developer account (paid yearly). EAS sets up the push key during the first iOS build.
