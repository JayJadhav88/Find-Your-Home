import { NextResponse, type NextRequest } from "next/server";
import { secretMatches } from "@/lib/shared-secret";

// OpenStreetMap's Nominatim refuses requests from Supabase's cloud servers (HTTP 403), so the
// Supabase functions (geocode, process-jobs) send their place lookups through this route on the
// website's own server. Only those functions may call it (REVALIDATE_SECRET). It is not a general
// proxy: it only ever asks Nominatim's search for one place. Caching and the per-visitor limit
// stay in the Supabase functions; this route keeps Nominatim's one-request-per-second rule.

export const dynamic = "force-dynamic";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const SPACING_MS = 1100;
const MAX_WAIT_MS = 5000;
const USER_AGENT = /^FindYourHome\/1\.0 \([^\r\n()]{1,150}\)$/;

// The website runs as one Node process, so a module-level clock spaces out all lookups.
let nextSlot = 0;

async function takeTurn(): Promise<boolean> {
  const now = Date.now();
  const start = Math.max(now, nextSlot);
  if (start - now > MAX_WAIT_MS) return false;
  nextSlot = start + SPACING_MS;
  if (start > now) await new Promise((resolve) => setTimeout(resolve, start - now));
  return true;
}

export async function POST(request: NextRequest) {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected || expected.length < 32) {
    return NextResponse.json({ error: "REVALIDATE_SECRET is not configured" }, { status: 503 });
  }
  if (!secretMatches(request.headers.get("x-geocode-secret") ?? "", expected)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { q?: unknown; countrycodes?: unknown; userAgent?: unknown } | null;
  const q = typeof body?.q === "string" ? body.q.replace(/\s+/g, " ").trim() : "";
  const country = typeof body?.countrycodes === "string" ? body.countrycodes.toLowerCase() : "";
  const userAgent = typeof body?.userAgent === "string" ? body.userAgent : "";
  if (q.length < 2 || q.length > 200 || (country && !/^[a-z]{2}$/.test(country)) || !USER_AGENT.test(userAgent)) {
    return NextResponse.json({ error: "Bad lookup" }, { status: 400 });
  }

  if (!(await takeTurn())) return NextResponse.json({ error: "Busy" }, { status: 429 });

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  if (country) url.searchParams.set("countrycodes", country);
  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": userAgent, Accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    // Pass Nominatim's answer through unchanged; the caller reads its status and results.
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Could not reach the map service" }, { status: 502 });
  }
}
