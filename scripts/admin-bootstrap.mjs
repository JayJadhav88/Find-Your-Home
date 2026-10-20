#!/usr/bin/env node
// Creates the first administrator, or promotes an existing verified account.
//
//   Create a new admin account with a one-time password (recommended for the first admin):
//     SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/admin-bootstrap.mjs --create --email you@example.com
//
//   Give an existing admin a new one-time password (e.g. the first one was lost):
//     SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/admin-bootstrap.mjs --reset --email you@example.com
//
//   Promote an account that already signed up and confirmed its email:
//     SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/admin-bootstrap.mjs --email you@example.com
//
// With --create, a long random one-time password is written to .secrets/first-admin.txt (or
// the name given with --file)
// (git-ignored, readable only on this computer) and is never printed. The account must choose
// its own password at first sign-in before it can use the site. Delete the file afterwards.
// Run from a trusted terminal only. The secret key is read from the environment, never saved.

import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const emailIndex = args.indexOf("--email");
const email = emailIndex >= 0 ? args[emailIndex + 1]?.trim().toLowerCase() : undefined;
const create = args.includes("--create");
const reset = args.includes("--reset");
const fileIndex = args.indexOf("--file");
const fileName = fileIndex >= 0 ? args[fileIndex + 1] : "first-admin.txt";
if (!/^[A-Za-z0-9._-]+\.txt$/.test(fileName ?? "")) {
  console.error("admin-bootstrap: --file must be a plain file name ending in .txt");
  process.exit(1);
}

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
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

const headers = { apikey: secretKey, Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" };

async function call(path, body, method = "POST") {
  const response = await fetch(`${url}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) fail(data?.msg ?? data?.message ?? data?.error_description ?? `request to ${path} failed with HTTP ${response.status}`);
  return data;
}

if (create && reset) fail("use either --create or --reset, not both");

async function findUser() {
  for (let page = 1; page <= 50; page++) {
    const data = await call(`/auth/v1/admin/users?page=${page}&per_page=200`, undefined, "GET");
    const found = (data?.users ?? []).find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if ((data?.users ?? []).length < 200) break;
  }
  fail(`no account with the email ${email}; use --create instead`);
}

if (create || reset) {
  // 24 random bytes → 32 URL-safe characters, plus a digit and symbol for password rules.
  const password = `${randomBytes(24).toString("base64url")}9!`;
  const user = create
    ? await call("/auth/v1/admin/users", {
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: email.split("@")[0] },
      })
    : await call(`/auth/v1/admin/users/${(await findUser()).id}`, { password }, "PUT");
  await call("/rest/v1/rpc/require_password_change", { p_user_id: user.id });

  const folder = new URL("../.secrets/", import.meta.url);
  mkdirSync(folder, { recursive: true });
  const file = new URL(fileName, folder);
  writeFileSync(
    file,
    [
      "First administrator — one-time sign-in details. Do not share or commit this file.",
      `Site:     ${process.env.SITE_URL ?? "http://localhost:3000"}/sign-in`,
      `Email:    ${email}`,
      `Password: ${password}`,
      "",
      "You must choose a new password straight after signing in. Then delete this file.",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  try {
    chmodSync(file, 0o600);
  } catch {
    // Windows keeps the default per-user permissions on the user's own folder.
  }
  console.log(`admin-bootstrap: ${create ? "created" : "gave a new one-time password to"} ${email} (user id ${user.id}).`);
  console.log(`admin-bootstrap: one-time password saved to .secrets/${fileName} (not printed).`);
}

const id = await call("/rest/v1/rpc/bootstrap_admin", { p_email: email });
console.log(`admin-bootstrap: ${email} is now a super admin (user id ${id}).`);
