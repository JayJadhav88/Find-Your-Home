#!/usr/bin/env node
// Grants the administrator role to an existing, email-verified account.
//
// Usage (run from a trusted terminal, never from a browser or CI log):
//   SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/admin-bootstrap.mjs --email you@example.com
//
// The secret key is read from the environment only; it is never written to disk.

const args = process.argv.slice(2);
const emailIndex = args.indexOf("--email");
const email = emailIndex >= 0 ? args[emailIndex + 1] : undefined;

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

function fail(message) {
  console.error(`admin-bootstrap: ${message}`);
  process.exit(1);
}

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  fail("pass the account email with --email you@example.com");
}
if (!url || !secretKey) {
  fail("set SUPABASE_URL and SUPABASE_SECRET_KEY in the environment (see README → Admin bootstrap)");
}

const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/bootstrap_admin`, {
  method: "POST",
  headers: {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ p_email: email }),
});

const body = await response.json().catch(() => null);

if (!response.ok) {
  fail(body?.message ?? `request failed with HTTP ${response.status}`);
}

console.log(`admin-bootstrap: ${email} is now an administrator (user id ${body}).`);
