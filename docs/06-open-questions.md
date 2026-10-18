# 06 · Assumptions and open questions

## Blocking for Phase 1

1. **Local backend: Docker or a hosted dev project?**
   Docker Desktop is not installed. Supabase's local stack and the database policy tests need it.
   - **A (recommended):** install Docker Desktop (free for small businesses under Docker's licence terms; please confirm it applies) → fully local, free, and RLS tests run offline.
   - **B:** create a free hosted Supabase project used only for development. Works without Docker, but migrations are pushed to the cloud and policy tests run against it.
2. **Git.** Git is not installed. Phase 1 can start without it, but every milestone should be a commit and deploys need a repository. Recommended: install Git for Windows, and say whether you want a GitHub (or other) remote.

## Non-blocking — safe defaults will be used unless you say otherwise

| Topic | Default |
| --- | --- |
| Launch market, currency, locale, timezone | Nothing hard-coded. DEMO seed uses clearly fictional locations and lets you pick defaults in settings. Tell me the launch country if you want realistic location seed data. |
| Area units | Both `sq_ft` and `sq_m`; default chosen in settings |
| Existing site | A recent folder named after `omexorr.com` WordPress uploads exists on this machine. Assumed unrelated. If it holds listings or photos you want migrated, CSV/media import becomes a Phase 5 item (or earlier if you prioritise it). |
| Brand assets | Text wordmark "Find Your Home" and a neutral, warm palette as configurable tokens until you supply a logo and colours |
| Owner leads | Owners see enquiries on their own listings (setting `owner_leads = on`); you can turn it off |
| Material-change policy | Editing price/location/size/rooms/photos of a live listing sends it back to review |
| Who may list | Any verified account can become an `owner`; agents are invited by an administrator |
| Email provider | Adapter with a `log` provider locally; you choose a provider before launch |
| Captcha | Off, configurable |
| Web hosting | Vercel-compatible build, decision deferred to Phase 4 (see cost note on commercial use) |
| Legal pages | Shipped unpublished with a visible "legal text required" notice; text must come from you / a qualified professional |

## Things only the owner can provide (needed by launch, not now)

Legal entity name, business contact details, privacy policy and terms text, Apple/Google developer accounts, domain, email sender domain, logo/colours, and the decision on payments/featured packages.
