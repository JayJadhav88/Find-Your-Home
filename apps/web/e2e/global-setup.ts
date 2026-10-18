import { execSync } from "node:child_process";
import { stack } from "./support/stack";

// Checks the local stack is up and clears rate-limit counters so repeated runs within an
// hour are not throttled (local database only).
export default async function globalSetup() {
  const { apiUrl, mailpitUrl, publishableKey } = stack();

  const health = await fetch(`${apiUrl}/rest/v1/site_settings?select=brand_name`, {
    headers: { apikey: publishableKey },
  }).catch(() => null);
  if (!health?.ok) throw new Error(`Supabase API not reachable at ${apiUrl}. Run pnpm db:start.`);

  const mail = await fetch(`${mailpitUrl}/api/v1/messages?limit=1`).catch(() => null);
  if (!mail?.ok) throw new Error(`Mailpit not reachable at ${mailpitUrl}.`);

  try {
    execSync(
      `docker exec supabase_db_find-your-home psql -U postgres -c "delete from app.rate_limit_buckets"`,
      { stdio: "ignore" },
    );
  } catch {
    console.warn("[e2e] Could not clear rate limits (docker exec failed); enquiry tests may be throttled.");
  }
}
