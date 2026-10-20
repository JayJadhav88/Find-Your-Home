# 12 · Test accounts (this computer only)

These accounts exist only in the local database on this computer (`supabase start`). They are created by `supabase/seed.sql` and come back after `supabase db reset`. They are not on any live site, and production must never be seeded with them.

**Password for every demo account:** `DemoPassword123`

| Sign in as | Email | What to try |
| --- | --- | --- |
| Customer (buyer) | `demo.buyer@example.test` | Search (PIN code, near a place, near me), save a search, send an enquiry, Contact us, notifications |
| Property owner | `demo.owner@example.test` | List a property, add photos, submit for review, mark a live listing Under negotiation or Unavailable, see enquiries |
| Builder | `demo.builder@example.test` | List a new project: configurations, price range, launch date, registration number |
| Super admin | `demo.admin@example.test` | Everything: Team & roles, Customers, Settings, Integrations, Site content, feature switches |
| Moderator | `demo.moderator@example.test` | Review listings, reports, builders, leads |
| CRM manager | `demo.crm@example.test` | All leads: assign, change status, notes, add a lead |
| Sales agent | `demo.sales@example.test` | Only leads assigned to them (assign one first as the CRM manager) |
| Support | `demo.support@example.test` | All leads |
| Content manager | `demo.content@example.test` | Admin → Site content (banners, floating button) and Pages |
| Marketing | `demo.marketing@example.test` | Admin → Send a message |

**Your own admin** (`patilsharvari611@gmail.com`) is separate: its one-time password is in `.secrets/first-admin.txt` (git-ignored). You must choose a new password the first time you sign in. If that password is lost or was already used, give the account a fresh one: `node scripts/admin-bootstrap.mjs --reset --email patilsharvari611@gmail.com` (with `SUPABASE_URL` and `SUPABASE_SECRET_KEY` set, as in the README).

## Where to sign in

- **Website:** http://localhost:3000/sign-in. The admin panel is http://localhost:3000/admin for team roles.
- **Phone app (Expo Go):** the same emails and password on the Account tab. Team members get an "Admin panel" button that opens the website.

Emails the site sends (password resets, alerts) land in Mailpit at http://127.0.0.1:44324, not in real inboxes.

## Good to know

- Each account is a normal member as well (buyer), so team accounts can also browse and enquire.
- To try the sales agent: sign in as the CRM manager, open a lead, set **Team owner** to Demo Sales Agent, then sign in as the sales agent.
- To start fresh: `npx supabase db reset` restores the demo data but **deletes your own admin account**. Recreate it with `node scripts/admin-bootstrap.mjs --create --email patilsharvari611@gmail.com` (see the README).
