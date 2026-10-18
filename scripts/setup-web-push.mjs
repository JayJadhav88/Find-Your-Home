#!/usr/bin/env node
// Creates the key pair for browser notifications (VAPID) and adds it to the local env files
// if they don't have one yet:
//   supabase/functions/.env   WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY (private: server only)
//   apps/web/.env.local        NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY (public: given to browsers)
//
//   pnpm setup:web-push            # local files
//   pnpm setup:web-push --print    # only print a new pair (for hosted secrets)
//
// Keep the same pair once people have subscribed: a new pair makes old subscriptions stop.

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const toBase64Url = (bytes) => Buffer.from(bytes).toString("base64url");

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicKey = toBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
const privateKey = (await crypto.subtle.exportKey("jwk", pair.privateKey)).d;

if (process.argv.includes("--print")) {
  console.log(`WEB_PUSH_PUBLIC_KEY=${publicKey}\nWEB_PUSH_PRIVATE_KEY=${privateKey}\nNEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY=${publicKey}`);
  process.exit(0);
}

const functionsEnv = new URL("../supabase/functions/.env", import.meta.url);
const webEnv = new URL("../apps/web/.env.local", import.meta.url);

function read(file) {
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

const existing = read(functionsEnv).match(/^WEB_PUSH_PUBLIC_KEY=(.+)$/m)?.[1]?.trim();
if (existing) {
  console.log("supabase/functions/.env already has browser push keys; keeping them.");
} else {
  const current = read(functionsEnv);
  writeFileSync(
    functionsEnv,
    `${current}${current && !current.endsWith("\n") ? "\n" : ""}WEB_PUSH_PUBLIC_KEY=${publicKey}\nWEB_PUSH_PRIVATE_KEY=${privateKey}\n`,
  );
  console.log("Added WEB_PUSH_PUBLIC_KEY / WEB_PUSH_PRIVATE_KEY to supabase/functions/.env");
}

const browserKey = existing ?? publicKey;
const web = read(webEnv);
if (/^NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY=/m.test(web)) {
  writeFileSync(webEnv, web.replace(/^NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY=.*$/m, `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY=${browserKey}`));
} else {
  writeFileSync(webEnv, `${web}${web && !web.endsWith("\n") ? "\n" : ""}NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY=${browserKey}\n`);
}
console.log("Set NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY in apps/web/.env.local");
console.log("Restart the database stack (pnpm db:stop && pnpm db:start) and the website to use them.");
