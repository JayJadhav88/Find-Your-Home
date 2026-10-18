# Find Your Home

Real estate listing platform: public website, web app with admin panel, and iOS/Android apps on one shared Supabase backend.

**Current status: Phase 1 in progress — milestone 1.1 (monorepo scaffold) complete. No database, auth or product features yet.**

## Local setup (so far)

Requirements: Node.js 22+, pnpm (`npm install -g pnpm`). Docker Desktop and Git are needed from milestone 1.2 onward.

```bash
pnpm install
pnpm test        # shared package unit tests
pnpm typecheck   # all workspaces
pnpm lint
pnpm build       # production build of the website
pnpm --filter @fyh/web dev      # website on http://localhost:3000
pnpm --filter @fyh/mobile start # Expo dev server (scan with Expo Go)
```

| Workspace | Path | Notes |
| --- | --- | --- |
| `@fyh/web` | `apps/web` | Next.js 16 (App Router, Turbopack, Tailwind 4) |
| `@fyh/mobile` | `apps/mobile` | Expo SDK 58 / React Native 0.88 |
| `@fyh/shared` | `packages/shared` | Domain enums, env validation, `Intl` formatters, design tokens (TypeScript source, consumed directly) |
| `@fyh/config` | `packages/config` | Shared `tsconfig` base |

Environment variables are listed in [.env.example](.env.example). The shared validator refuses to start a client with a Supabase secret key.

| Document | Contents |
| --- | --- |
| [docs/01-architecture.md](docs/01-architecture.md) | Stack, monorepo layout, where rules are enforced, auth, media, search, notifications, security, testing |
| [docs/02-data-model.md](docs/02-data-model.md) | Tables, enums, listing lifecycle, storage buckets |
| [docs/03-permissions.md](docs/03-permissions.md) | Role × capability matrix (spec for RLS and tests) |
| [docs/04-delivery-plan.md](docs/04-delivery-plan.md) | Phases 1–5 broken into verifiable milestones |
| [docs/05-environments-and-costs.md](docs/05-environments-and-costs.md) | Environments and cost assumptions |
| [docs/06-open-questions.md](docs/06-open-questions.md) | Assumptions, defaults, and the questions that block Phase 1 |

Setup, deployment, backup and admin bootstrap instructions will be added here from Phase 1 onward.
