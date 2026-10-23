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
import { cpSync, existsSync, realpathSync, rmSync } from "node:fs";
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
// A cache left by a different build mode can crash webpack's hashing; start clean.
rmSync(`${web}.next/cache`, { recursive: true, force: true });
// webpack, not Turbopack: shared hosting doesn't let Turbopack start its helper processes.
const build = spawnSync("node", [`${web}node_modules/next/dist/bin/next`, "build", "--webpack", web], {
  stdio: "inherit",
  // Few threads: shared hosting refuses to start more ("OS can't spawn worker thread").
  env: {
    ...process.env,
    NEXT_OUTPUT: "standalone",
    NEXT_TELEMETRY_DISABLED: "1",
    TOKIO_WORKER_THREADS: "2",
    RAYON_NUM_THREADS: "2",
    UV_THREADPOOL_SIZE: "2",
  },
});
if (build.status !== 0) process.exit(build.status ?? 1);

// The standalone server serves these from its own folder.
cpSync(`${web}.next/static`, `${standalone}.next/static`, { recursive: true });
if (existsSync(`${web}public`)) cpSync(`${web}public`, `${standalone}public`, { recursive: true });
// pnpm keeps Next.js's helper packages beside it in node_modules/.pnpm, which the hosting copy
// of the package doesn't always keep. Put real copies next to the app so `require` finds them.
for (const name of ["@swc/helpers", "styled-jsx", "@next/env"]) {
  const target = `${standalone}node_modules/${name}`;
  rmSync(target, { recursive: true, force: true });
  cpSync(realpathSync(`${web}node_modules/${name}`), target, { recursive: true, dereference: true });
}
console.log("build-hostinger: ready → apps/web/.next/standalone/apps/web/server.js");
