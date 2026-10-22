# 14 · Pages, properties and notifications (2026-10-22)

## Pages (Admin → Pages)

- **Add a page:** give it a title (and optionally an address). It opens at `/pages/<address>`. Choose **Formatted text** or, for super admins, **HTML (your own code)**.
- **Edit:** click a page. HTML pages take anything you paste: a whole document (`<html>…</html>`) or just the content, with `<style>` and `<script>`. Tick **Whole page** to show your HTML without the site's header and footer.
- **Publish / footer:** pages stay drafts (only the team can preview them) until **Published** is ticked. **Link in the footer** adds an added page after About, Contact, Privacy and Terms.
- **Delete:** at the bottom of an added page. About, Contact, Privacy and Terms can't be deleted; unpublish them instead. They can also be switched to HTML.
- **Who can do what:** content managers add, edit and delete formatted-text pages. Only super admins create or change HTML, publish an HTML page, or delete one. Every add, delete and HTML change is in the audit log.

**Safety:** HTML pages run in a browser sandbox. Your scripts and styles work, but the page can't read the site's cookies, local storage or anyone's sign-in, so a pasted script can't take over an account. As a result:
- forms in an HTML page must send to another service, or link to `/contact`;
- scripts can't remember things between visits through `localStorage`;
- links open in the whole window.

Search engines read the page best with **Whole page** ticked.

## Properties (super admins)

- **Add:** Admin → Listings → **Add property** (the property is yours; submit it for review, then approve it yourself).
- **Edit anyone's property:** open it in Admin → Listings → **Edit details and photos**. Changes go live straight away without re-review, and the changed fields are recorded in the audit log.
- **Delete permanently:** at the bottom of the property's admin page; type its reference (e.g. FYH-001234) to confirm. The property, its photos, videos and history are removed from the website and app. **Its leads are kept**, with the reference noted on each lead. To hide a property for now, use **Suspend** instead.
- Moderators review but don't get these tools.

## Notifications

Already built (Admin → **Send a message**): title, message, link, audience (everyone, owners, buyers…), optional city, channels (phone and browser notifications, email, WhatsApp), **Send later** at a date and time, and a weekly cap per person. Every message also appears in the bell (in-app inbox) on the website and in the app.

- **On this computer** messages are sent by the background workers. `start-local.cmd` now starts them in a third, minimised window ("background jobs"), checking every 30 seconds. Without that window, scheduled and push messages wait.
- **Browser notifications** (also when the site isn't open) work locally once a member allows them under My account → Notifications.
- **Phone notifications when the app is closed** need an installed build of the app, not Expo Go (Expo Go can't receive push notifications on Android). It's free to set up:
  1. an Expo account (`npx eas-cli@latest login`, then `npx eas-cli@latest init` in `apps/mobile`);
  2. a Firebase project for Android push (FCM V1), added with `npx eas-cli@latest credentials`;
  3. a build (`npx eas-cli@latest build --profile preview --platform android`), installed on the phone.

  iOS also needs an Apple Developer account (paid). Details: [10-notifications-and-team.md](10-notifications-and-team.md) → Phone notifications.
- **Live site:** schedule the workers every minute with `pg_cron` ([07-operations.md](07-operations.md)).

## Checks run (2026-10-22)

Database tests (pages, admin property tools and all earlier files) pass. Website typecheck, lint and production build pass. Browser tests: 52 of 52 pass, including 5 new ones:
- Show/Hide password;
- an HTML page shown inside the site, with its style applied, its script running and cookies blocked;
- standard pages can't be deleted;
- the super admin property tools;
- moderators don't get those tools.

Also checked by hand in Claude's browser: the HTML page opened directly ran its script, while cookies and storage were blocked.

**Not checked:**
- deleting a property in the browser (covered by database tests only);
- push to a real phone (needs the build above).
