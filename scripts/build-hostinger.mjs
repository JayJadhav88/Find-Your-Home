#!/usr/bin/env node
// Builds the website as one self-contained Node.js server for Hostinger (or any Node host):
//
//   pnpm build            (same as pnpm build:hostinger; pnpm build:all builds every package)
//   node apps/web/.next/standalone/apps/web/server.js      # PORT and HOSTNAME from the host
//
// Hostinger settings: root directory "/", package manager pnpm, build command
// "pnpm run build", framework "Other", entry file
// "apps/web/.next/standalone/apps/web/server.js". NEXT_PUBLIC_* variables must be set
// before the build, because they are built into the pages. See docs/16-going-live.md.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const web = `${root}apps/web/`;
const standalone = `${web}.next/standalone/apps/web/`;

for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SITE_URL"]) {
  if (!process.env[name] && !existsSync(`${web}.env.local`) && !existsSync(`${web}.env.production`)) {
    console.error(`build-hostinger: set ${name} in the host's environment variables before building.`);
    process.exit(1);
  }
}

rmSync(`${web}.next/standalone`, { recursive: true, force: true });
const build = spawnSync("node", [`${web}node_modules/next/dist/bin/next`, "build", web], {
  stdio: "inherit",
  env: { ...process.env, NEXT_OUTPUT: "standalone" },
});
if (build.status !== 0) process.exit(build.status ?? 1);

// The standalone server serves these from its own folder.
cpSync(`${web}.next/static`, `${standalone}.next/static`, { recursive: true });
if (existsSync(`${web}public`)) cpSync(`${web}public`, `${standalone}public`, { recursive: true });
console.log("build-hostinger: ready → apps/web/.next/standalone/apps/web/server.js");
