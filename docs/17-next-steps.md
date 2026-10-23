# 17 · What's left before launch (step by step)

Live site: https://coral-salamander-372599.hostingersite.com

## 1. Sign in (no passwords needed)

1. Open the live site and click **Sign in**.
2. Click **Continue with Google** and pick your Gmail.
3. Admins (`patilsharvari611@gmail.com`, `jaydeepjadhav313212111010@gmail.com`) land in the account area. Click **Admin** at the top.

You never need to create or remember a password: Google sign-in is enough. Email and password sign-in still exists for people without Google.

**If Google says "Access blocked" or "not a test user":** add that Gmail in Google Cloud → **Google Auth Platform → Audience → Test users → Add users**, or do step 2.

## 2. Let every customer use Google sign-in (5 minutes)

While the Google app is in "Testing", only the test users you list can sign in with Google.

1. Open https://console.cloud.google.com (the Google account that owns the project) and pick **Find Your Home** at the top.
2. **Google Auth Platform → Branding**: check the app name and support email, and add the links:
   - Application home page: `https://coral-salamander-372599.hostingersite.com`
   - Privacy policy: `https://coral-salamander-372599.hostingersite.com/privacy`
   - Terms: `https://coral-salamander-372599.hostingersite.com/terms`
3. **Audience → Publish app → Confirm.** Because we only ask for name and email, Google doesn't need to review it.

Publish the Privacy and Terms pages first (step 3), since Google checks they open.

## 3. Fill in the basics in the admin panel (15 minutes)

1. **Admin → Settings:**
   - Brand name;
   - Contact email and phone (shown in the footer);
   - Default currency: **INR**;
   - Area unit: **sq ft**;
   - Locale **en-IN**, time zone **Asia/Kolkata**.

   Click **Save**.
2. **Admin → Types, amenities & places:** add your cities and localities (e.g. India → Maharashtra → Pune → Baner).
3. **Admin → Pages:** open About, Privacy policy and Terms of use, write the text, tick **Published**, and **Save**. Privacy and Terms should be reviewed by a lawyer.
4. **Admin → Listings → Add property** to add your first homes, or **Import from Excel** for many at once.

## 4. Emails (needed before real customers, about 30 minutes, needs your own domain)

Today the site records emails but doesn't send them, and Supabase only sends sign-up and password emails to your own team.

1. Sign up free at https://resend.com.
2. **Domains → Add domain**, then add the DNS records Resend shows in **Hostinger → Domains → DNS** and wait until Resend says **Verified**.
3. Resend → **API Keys → Create** (sending access).
4. Tell Claude "Resend is ready". Claude will:
   - switch the site's emails on (Admin → Integrations, `EMAIL_PROVIDER=resend`);
   - set Resend as Supabase's email sender (Authentication → Emails → SMTP).

   You'll paste the key yourself where it's needed.

## 5. Upgrade the database before launch (2 minutes, $25/month)

The free plan pauses after 7 days without visitors and keeps no backups.

1. Open https://supabase.com/dashboard, pick **find-your-home-mumbai**.
2. **Organization settings → Billing → Change plan → Pro** and add a card.

## 6. Your own domain (about 30 minutes plus waiting)

1. Hostinger → **Websites → coral-salamander… → Connect domain**, enter your domain (e.g. `findyourhome.in`), and follow the steps. DNS can take a few hours.
2. Tell Claude the new domain. Claude updates the website address in Hostinger, Supabase (site URL, redirect URLs, function settings) and Google Cloud, then redeploys.

## 7. The phone app in the stores

1. Set up phone notifications and a test build: [15-phone-push.md](15-phone-push.md).
2. Tell Claude to point the app at the live site (it changes the three `EXPO_PUBLIC_*` values for the build).
3. Google Play: create a developer account at https://play.google.com/console ($25 once). Apple: https://developer.apple.com/programs ($99 a year).
4. Claude prepares the store build (`eas build --profile production`), and you upload it and fill in the store listing.

## 8. Tidy up (10 minutes)

1. Supabase dashboard → the old **Find Your Home** project (Seoul) → **Settings → Pause project** (or Delete).
2. Delete `client_secret_….json` from your **Downloads** folder.
3. Google Cloud → **Clients → Find Your Home → Add secret**. Tell Claude, who switches Supabase to the new secret. Then **disable the old secret** (it was pasted in chat).
4. Keep the `.secrets` folder on the laptop private. It holds the live keys. Never upload it.

## Banners (Admin → Site content)

1. **Add a banner:** give it a title, an optional subtitle and button text, a **Button link** (e.g. `/search?category=new_project` or an `https://` address) and an **Image** (Upload).
2. **Where it shows:**
   - **Top banner:** one at a time, changing every 5 seconds, under the header on every page. Use a wide image, about 1600 × 500.
   - **Offers row:** cards side by side (1 on phones, 2 on tablets, 3 on computers), in the middle of the home page and above the footer elsewhere. Use an image about 800 × 450.
3. **Order** decides the sequence (lower first). **Start** and **End** schedule it. **Show on** picks website, app or both.

Banners and clicks appear within a minute on the website and the app. Admin, account and sign-in pages never show banners.

## Already done

- Website live on Hostinger, with every push to GitHub redeploying it.
- Database in Mumbai, background jobs every minute.
- Place search and map positions.
- Google sign-in without passwords.
- Admin panel, pages, properties, leads, banners, and roles for the team.
