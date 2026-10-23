// Public: turns a place typed in the search box ("Baner, Pune" or "411045") into coordinates
// for "near a place" search. Results are cached and each visitor is rate-limited, as
// OpenStreetMap's free service asks. GET /functions/v1/geocode?q=...
import { countryFromLocale, geocode, websiteGeocoder } from "../_shared/geocode.ts";
import { errorMessage, serviceClient } from "../_shared/worker.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
};

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": status === 200 ? "public, max-age=86400" : "no-store" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (request.method !== "GET") return reply({ error: "Use GET" }, 405);

  const q = new URL(request.url).searchParams.get("q")?.replace(/\s+/g, " ").trim() ?? "";
  if (q.length < 2 || q.length > 120) return reply({ error: "Type a place, locality or PIN code" }, 400);

  const db = serviceClient();
  try {
    const cached = await db.rpc("geocode_cache_get", { p_query: q }).maybeSingle();
    const hit = cached.data as { lat: number | null; lng: number | null; label: string | null } | null;
    if (hit) return hit.lat === null ? reply({ found: false }) : reply({ found: true, lat: hit.lat, lng: hit.lng, label: hit.label });

    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
    const limited = await db.rpc("geocode_rate_limit", { p_key: ip });
    if (limited.error) return reply({ error: "Too many searches. Please wait a little." }, 429);

    const { data: settings } = await db.from("site_settings").select("default_locale, contact_email").maybeSingle();
    const place = await geocode(q, {
      userAgent: `FindYourHome/1.0 (${settings?.contact_email ?? Deno.env.get("SITE_URL") ?? "local development"})`,
      countryCode: countryFromLocale(settings?.default_locale),
      fetchImpl: websiteGeocoder((name) => Deno.env.get(name)) ?? undefined,
    });
    await db.rpc("geocode_cache_put", { p_query: q, p_lat: place?.lat ?? null, p_lng: place?.lng ?? null, p_label: place?.label ?? q });
    return place ? reply({ found: true, ...place }) : reply({ found: false });
  } catch (error) {
    console.error(`[geocode] ${errorMessage(error)}`);
    return reply({ error: "Location search is busy. Please try again shortly." }, 503);
  }
});
