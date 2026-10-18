# 03 · Roles and permission matrix

Status: **Phase 0 proposal.** This matrix becomes the spec for RLS policies and pgTAP tests in Phase 1; every ✅/❌ cell gets a test.

Legend: ✅ allowed · 🔸 own records only · 📋 only via workflow function · ❌ denied

Builders (role `builder`, granted only by an administrator) have the same rights as owners, plus listing in the **New project** category and a public company profile. Owners and agents can list Rental and Resale only.

| Capability | visitor | buyer | owner | agent | moderator | administrator |
| --- | --- | --- | --- | --- | --- | --- |
| Read published listings, public media, taxonomy | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Read non-published listings | ❌ | ❌ | 🔸 | 🔸 assigned | ✅ | ✅ |
| Read `listing_private_details` (exact address) | ❌ | ❌ | 🔸 | 🔸 assigned | ✅ | ✅ |
| Create listing (draft) | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| Edit listing content | ❌ | ❌ | 🔸 draft/rejected/published* | 🔸 assigned* | ❌ | ✅ |
| Submit / withdraw / mark sold-rented / archive | ❌ | ❌ | 📋🔸 | 📋🔸 assigned | ❌ | 📋 |
| Approve / reject / suspend / reinstate | ❌ | ❌ | ❌ | ❌ | 📋 | 📋 |
| Feature a listing | ❌ | ❌ | ❌ | ❌ | ❌ | 📋 |
| Upload listing media | ❌ | ❌ | 🔸 | 🔸 assigned | ❌ | ✅ |
| Favorites / comparison list | local only | 🔸 | 🔸 | 🔸 | 🔸 | 🔸 |
| Send enquiry / visit request | ✅ rate-limited | ✅ | ✅ | ✅ | ✅ | ✅ |
| Read enquiries they sent | ❌ | 🔸 | 🔸 | 🔸 | ✅ | ✅ |
| Read enquiries on a listing | ❌ | ❌ | 🔸 if `owner_leads` enabled | 🔸 assigned | ✅ | ✅ |
| Confirm / decline visit, mark enquiry handled | ❌ | ❌ | 🔸 if leads enabled | 🔸 assigned | ✅ | ✅ |
| Own profile (read/update) | ❌ | 🔸 | 🔸 | 🔸 | 🔸 | ✅ all |
| Read other users' profiles | public agent profiles only | same | same | same | limited fields | ✅ |
| Suspend / reactivate users | ❌ | ❌ | ❌ | ❌ | ❌ | 📋 |
| Grant roles | ❌ | ❌ | ❌ | ❌ | ❌ | 📋 (cannot remove own last admin role) |
| Manage taxonomy, homepage, content pages | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage site settings (branding, limits, moderation rules) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Read audit log | ❌ | ❌ | ❌ | ❌ | own actions | ✅ |
| Export operational data | ❌ | ❌ | ❌ | ❌ | ❌ | 📋 audited |
| Bulk import listings from Excel | ❌ | ❌ | ❌ | ❌ | ❌ | 📋 audited |
| Add / remove listing videos | ❌ | ❌ | 🔸 while editable | 🔸 assigned | ❌ | ✅ |
| Access `/admin` | ❌ | ❌ | ❌ | ❌ | moderation pages | ✅ |

\* Editing material fields of a published listing triggers the material-change policy (see data model).

## Team roles added in Phase 3b

`support` (enquiries: read all, assign, status, internal notes) and `marketing` (broadcasts) can open the admin panel but cannot review listings or change settings. Moderators also handle enquiries and reports. Only administrators manage integrations, users, roles and settings. See [10-notifications-and-team.md](10-notifications-and-team.md).

## Rules that apply to every row above

1. Identity comes from `auth.uid()` on the server. Any `user_id`, `owner_id`, `role` or `status` in a client payload is ignored or rejected by triggers.
2. A suspended account fails every write policy and cannot sign in.
3. Only active, email-verified accounts can create listings or hold staff roles.
4. Moderators have no access to secrets, billing (future), role grants or site settings.
5. Staff actions (`moderator`, `administrator`) are written to `audit_log` by the same function that performs them.
6. Listing reads that include owner contact details return only the fields the listing's contact preferences allow.
