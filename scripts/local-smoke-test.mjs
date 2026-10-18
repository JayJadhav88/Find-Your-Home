#!/usr/bin/env node
// End-to-end smoke test against the LOCAL stack using the DEMO accounts from seed.sql:
// owner creates a listing + photo (with fake GPS metadata) -> submits -> moderator approves
// -> workers publish a cleaned public copy and send the email -> moderator suspends ->
// workers remove the public copy.
//
//   pnpm db:start && pnpm smoke
//
// Refuses to run against anything other than a localhost API.

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import jpeg from "jpeg-js";

const status = Object.fromEntries(
  execSync("pnpm exec supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
);

const API = status.API_URL;
const PUBLISHABLE = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
const SECRET = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
if (!API || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) {
  console.error(`smoke: refusing to run against non-local API ${API}`);
  process.exit(1);
}

const DEMO_PASSWORD = "DemoPassword123"; // local demo accounts from supabase/seed.sql
const GPS_SECRET = "GPS-LAT-12.3456-LON-65.4321";
const checks = [];

function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail && !condition ? ` — ${detail}` : ""}`);
}

async function request(path, { token, method = "GET", body, headers = {}, raw = false } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      apikey: PUBLISHABLE,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !(body instanceof Uint8Array) ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined,
  });
  const payload = raw ? new Uint8Array(await response.arrayBuffer()) : await response.json().catch(() => null);
  return { status: response.status, body: payload };
}

async function signIn(email) {
  const { status: code, body } = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password: DEMO_PASSWORD },
  });
  if (code !== 200) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(body)}`);
  return body.access_token;
}

function runWorkers() {
  execSync("node scripts/run-workers.mjs", { stdio: "ignore" });
}

function photoWithGps() {
  const width = 24;
  const height = 16;
  const data = Buffer.alloc(width * height * 4, 200);
  const encoded = jpeg.encode({ data, width, height }, 85).data;
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), Buffer.from(`MM\0*\0\0\0\x08\0\0\0\0\0\0${GPS_SECRET}`, "latin1")]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload]);
  return new Uint8Array(Buffer.concat([encoded.subarray(0, 2), app1, encoded.subarray(2)]));
}

const owner = await signIn("demo.owner@example.test");
const moderator = await signIn("demo.moderator@example.test");

const type = await request("/rest/v1/property_types?slug=eq.apartment&select=id");
const created = await request("/rest/v1/listings?select=id,reference_code,status", {
  token: owner,
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: {
    owner_id: "00000000-0000-0000-0000-000000000000", // ignored: the server sets the owner
    title: "[DEMO] Smoke test apartment",
    description: "DEMO listing created by the local smoke test. Not a real property.",
    purpose: "sale",
    property_type_id: type.body[0].id,
    price_amount: 123456,
    currency: "USD",
    country_id: "c0000000-0000-4000-8000-000000000001",
    city_id: "c0000000-0000-4000-8000-000000000003",
    area_unit: "sq_m",
    area_value: 70,
    bedrooms: 2,
    bathrooms: 1,
  },
});
check("owner creates a draft listing", created.status === 201 && created.body?.[0]?.status === "draft", JSON.stringify(created.body));
const listingId = created.body[0].id;

const uploadKey = `${listingId}/${randomUUID()}.jpg`;
const upload = await request(`/storage/v1/object/listing-uploads/${uploadKey}`, {
  token: owner,
  method: "POST",
  headers: { "Content-Type": "image/jpeg" },
  body: photoWithGps(),
});
check("owner uploads a photo to the private bucket", upload.status === 200, JSON.stringify(upload.body));

const media = await request("/rest/v1/listing_media", {
  token: owner,
  method: "POST",
  body: { listing_id: listingId, upload_key: uploadKey, is_cover: true, alt_text: "Demo living room" },
});
check("owner registers the photo as cover", media.status === 201, JSON.stringify(media.body));

const anonPrivate = await request(`/storage/v1/object/listing-uploads/${uploadKey}`, { raw: true });
check("visitors cannot download the private original", anonPrivate.status >= 400);

const submitted = await request("/rest/v1/rpc/submit_listing", { token: owner, method: "POST", body: { p_listing_id: listingId } });
check("owner submits for review", submitted.body === "pending_review", JSON.stringify(submitted.body));

const approved = await request("/rest/v1/rpc/moderate_listing", {
  token: moderator,
  method: "POST",
  body: { p_listing_id: listingId, p_decision: "approve" },
});
check("moderator approves", approved.body === "published", JSON.stringify(approved.body));

runWorkers();

const publicMedia = await request(`/rest/v1/listing_media?listing_id=eq.${listingId}&select=public_key`);
const publicKey = publicMedia.body?.[0]?.public_key;
check("worker publishes a public copy", Boolean(publicKey), JSON.stringify(publicMedia.body));

const publicFile = await request(`/storage/v1/object/public/listing-public/${publicKey}`, { raw: true });
const publicBytes = Buffer.from(publicFile.body ?? []);
check("public copy is downloadable by visitors", publicFile.status === 200);
check("public copy is a valid JPEG", publicBytes[0] === 0xff && publicBytes[1] === 0xd8 && jpeg.decode(publicBytes).width === 24);
check("public copy has the GPS metadata removed", !publicBytes.includes(Buffer.from(GPS_SECRET, "latin1")));

const outbox = await fetch(
  `${API}/rest/v1/notification_outbox?template=eq.listing_decision&template_data->>listing_id=eq.${listingId}&select=status,provider_message_id`,
  { headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` } },
).then((response) => response.json());
check("approval email was sent by the email worker", outbox?.[0]?.status === "sent", JSON.stringify(outbox));

const suspended = await request("/rest/v1/rpc/moderate_listing", {
  token: moderator,
  method: "POST",
  body: { p_listing_id: listingId, p_decision: "suspend", p_reason: "Smoke test suspension" },
});
check("moderator suspends", suspended.body === "suspended", JSON.stringify(suspended.body));

runWorkers();

const afterSuspend = await request(`/storage/v1/object/public/listing-public/${publicKey}`, { raw: true });
check("worker removes the public copy after suspension", afterSuspend.status >= 400);
const anonListing = await request(`/rest/v1/listings?id=eq.${listingId}&select=id`);
check("suspended listing is hidden from visitors", Array.isArray(anonListing.body) && anonListing.body.length === 0);

const failed = checks.filter((item) => !item.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
