#!/usr/bin/env node
// Runs the background workers once (photo publishing + email sending), or repeatedly
// with --watch. For local development; hosted environments use the pg_cron schedule in
// docs/07-operations.md.
//
//   pnpm workers           # run once
//   pnpm workers --watch   # every 30 seconds
//
// Reads WORKER_SECRET from supabase/functions/.env and FUNCTIONS_URL (default: local stack).

import { readFileSync } from "node:fs";

const envFile = new URL("../supabase/functions/.env", import.meta.url);
let secret = process.env.WORKER_SECRET;
if (!secret) {
  try {
    const match = readFileSync(envFile, "utf8").match(/^WORKER_SECRET=(.+)$/m);
    secret = match?.[1]?.trim();
  } catch {
    // handled below
  }
}
if (!secret) {
  console.error("run-workers: set WORKER_SECRET (see supabase/functions/.env.example)");
  process.exit(1);
}

const base = (process.env.FUNCTIONS_URL ?? "http://127.0.0.1:54321/functions/v1").replace(/\/$/, "");

async function call(name) {
  try {
    const response = await fetch(`${base}/${name}`, {
      method: "POST",
      headers: { "x-worker-secret": secret, "Content-Type": "application/json" },
      body: "{}",
    });
    const body = await response.text();
    console.log(`${new Date().toISOString()} ${name} HTTP ${response.status} ${body}`);
    return response.ok;
  } catch (error) {
    console.error(`${new Date().toISOString()} ${name} unreachable: ${error.message}`);
    return false;
  }
}

async function runOnce() {
  const results = [await call("process-jobs"), await call("send-emails")];
  return results.every(Boolean);
}

if (process.argv.includes("--watch")) {
  await runOnce();
  setInterval(runOnce, 30_000);
} else {
  process.exit((await runOnce()) ? 0 : 1);
}
