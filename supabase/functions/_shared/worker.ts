// Shared plumbing for worker Edge Functions (Deno only).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * Workers are invoked by the scheduler (pg_cron / scripts/run-workers.mjs) with the
 * x-worker-secret header. Returns a response to send back when the caller is not allowed.
 */
export function rejectUnlessWorker(request: Request): Response | null {
  const expected = Deno.env.get("WORKER_SECRET");
  if (!expected || expected.length < 32) {
    return json({ error: "WORKER_SECRET is not configured (min. 32 characters)" }, 500);
  }
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);
  const provided = request.headers.get("x-worker-secret") ?? "";
  return timingSafeEqual(provided, expected) ? null : json({ error: "Forbidden" }, 403);
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
}

/** Service-role client. The key is injected by the Edge Runtime and never leaves the server. */
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from the Edge Runtime");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}
