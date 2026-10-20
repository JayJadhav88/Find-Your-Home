# 13 · Turning on "Continue with Google"

The website and the app already have a **Continue with Google** button. It stays hidden until Google knows about your site. Google charges nothing for sign-in. You need a Google account and about 10 minutes.

## 1. Create the Google project (once)

1. Open https://console.cloud.google.com and sign in with the Google account that should own the setup (for example the business Gmail).
2. At the top, click the project picker → **New project**. Name it `Find Your Home` → **Create**, then select it.

## 2. The consent screen (what people see when they choose Google)

1. Menu → **APIs & Services** → **OAuth consent screen** (it may be called **Google Auth Platform → Branding**). Click **Get started**.
2. App name: `Find Your Home`. User support email: your Gmail. Audience: **External**. Contact email: your Gmail. Agree and **Create**.
3. While the app is in **Testing**, only the Google accounts you add under **Audience → Test users** can sign in (up to 100). Add your own Gmail addresses there.
   Before launch, press **Publish app**. Sign-in that only asks for name and email does not need Google's review.

## 3. The client ID and secret

1. **APIs & Services → Credentials** (or **Google Auth Platform → Clients**) → **Create credentials → OAuth client ID**.
2. Application type: **Web application**. Name: `Find Your Home`.
3. Under **Authorized redirect URIs** → **Add URI**, add these exactly:
   - `http://127.0.0.1:44321/auth/v1/callback` (this computer)
   - later, for the live site: `https://<your-project>.supabase.co/auth/v1/callback`
4. **Create**. Google shows a **Client ID** and a **Client secret**.

## 4. Give them to the site (this computer)

1. Open `supabase/.env` in the project folder (private: never commit or send it).
2. Paste the Client ID after `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=` and the Client secret after `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=`. Save.
3. Tell Claude "Google keys are in". Claude switches the button on, restarts the database and checks it. You don't need to paste the keys in chat.

## How it behaves

- Someone who signs in with Google for the first time gets a normal customer account with their Google name and email.
- If an account already exists with the same Gmail address (for example an admin made with the admin script), Google sign-in opens that same account with its roles.
- An admin account made with a one-time password still asks for a new password once, even after Google sign-in. This happens one time only.
- **On this computer** Google sign-in works on the website at http://localhost:3000. It can't work in the phone app yet: Google only returns people to `localhost` or a real web address, and the phone can't reach this computer's `localhost`. It works in the app once the site is live on the internet.

## For the live site

Supabase Dashboard → **Authentication → Sign In / Providers → Google**: paste the same Client ID and secret, and enable it. Under **URL Configuration**, add your website address and `findyourhome://**`. Then set `NEXT_PUBLIC_GOOGLE_SIGN_IN=true` for the website and `EXPO_PUBLIC_GOOGLE_SIGN_IN=true` for the app build.
