# 05 · Environments and cost assumptions

Status: **Phase 0 estimate.** Prices below are the last list prices known to the author and **must be re-checked on each provider's pricing page before anything is purchased.** Nothing is bought, created, or published without the owner's explicit approval.

## Environments

| Environment | Web | Backend | Mobile | Data |
| --- | --- | --- | --- | --- |
| Local | `pnpm dev` | Supabase local stack (Docker) | Expo Go / dev build | DEMO seed |
| Preview / staging | Per-branch preview deploys | Separate Supabase project | EAS `preview` builds (internal testers) | DEMO seed + test accounts |
| Production | Production deploy on custom domain | Separate Supabase project, backups on | Store builds | Real data only |

Each environment has its own keys; production secrets never appear in preview or local config.

## Fixed and one-time costs

| Item | Assumption | Approx. cost |
| --- | --- | --- |
| Apple Developer Program | Required to publish on the App Store; owner's legal entity | US$99 / year |
| Google Play Console | Required to publish on Google Play | US$25 one-time |
| Domain name | `.com` or local TLD | ~US$10–40 / year, varies by TLD |
| Supabase | Free plan is fine for local/staging but pauses inactive projects and has small limits; production should be on Pro | Free → Pro from ~US$25 / month (includes some compute and usage) |
| Web hosting | Vercel's free Hobby plan is for **non-commercial** use only, so a business site needs Pro (~US$20 / member / month) — or Netlify, Cloudflare Pages, or a Node host as alternatives | ~US$0–20+ / month |
| Expo EAS | Free tier has a limited monthly build quota and queues; paid plans add priority builds | US$0 → ~US$19+ / month |
| Error monitoring | Sentry free developer tier initially | US$0 to start |

## Usage-based costs (cannot be fixed without usage assumptions)

| Item | Driver | Note |
| --- | --- | --- |
| Database / compute | Listing count, search traffic | Supabase compute add-ons if Pro baseline is outgrown |
| Storage + bandwidth | Photos per listing × listings × views | Re-encoding to WebP and size limits keep this down |
| Transactional email | Enquiries, moderation notices, auth emails | Most providers (Resend, Postmark, SES, Brevo) have a free or low tier; production needs a verified sender domain |
| Maps / geocoding | Map loads, geocoding calls | Deferred; quotas and terms differ by provider |
| SMS / OTP / WhatsApp API | Messages sent | Deferred; click-to-chat WhatsApp links are free |
| Payments | Transaction fees + tax handling | Deferred until market and provider are chosen |

## Rough monthly picture (to be refined)

- **Development / pilot:** ~US$0 / month plus store accounts (Supabase free, free hosting tier while non-commercial testing, EAS free).
- **Launched, low traffic:** roughly US$45–80 / month (Supabase Pro + hosting + email low tier), plus Apple US$99/yr, Google US$25 once, domain. Grows with photo storage, bandwidth and any maps/SMS usage.

Spend alerts and caps (Supabase spend cap, hosting usage alerts) are configured in Phase 4.
