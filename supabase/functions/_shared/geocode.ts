// Place → coordinates with OpenStreetMap's Nominatim service (free; no key).
// Usage policy: identify the app in the User-Agent, at most one request per second, cache
// results, no search-as-you-type. https://operations.osmfoundation.org/policies/nominatim/
// Pure TypeScript (fetch only), so it runs in Deno Edge Functions and in Vitest.

export interface Place {
  lat: number;
  lng: number;
  label: string;
}

export const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/** "Baner, Pune, 411045, IN" style query from the parts that are present. */
export function placeQuery(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part ?? "").replace(/[\r\n\t]+/g, " ").trim())
    .filter(Boolean)
    .join(", ")
    .slice(0, 200);
}

export async function geocode(
  query: string,
  options: { userAgent: string; countryCode?: string | null; fetchImpl?: typeof fetch },
): Promise<Place | null> {
  const q = query.trim();
  if (q.length < 2) return null;
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  if (options.countryCode && /^[a-z]{2}$/i.test(options.countryCode)) url.searchParams.set("countrycodes", options.countryCode.toLowerCase());

  const response = await (options.fetchImpl ?? fetch)(url.toString(), {
    headers: { "User-Agent": options.userAgent, Accept: "application/json" },
    redirect: "error",
  });
  if (response.status === 429 || response.status >= 500) throw new Error(`Geocoding service busy (${response.status})`);
  // A refusal (e.g. 403 when the service blocks a server) is not "no such place": never cache it.
  if (!response.ok) throw new Error(`Geocoding service refused the request (${response.status})`);
  const results = (await response.json().catch(() => [])) as Array<{ lat?: string; lon?: string; display_name?: string }>;
  const first = results[0];
  const lat = Number(first?.lat);
  const lng = Number(first?.lon);
  if (!first || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, label: String(first.display_name ?? q).slice(0, 200) };
}

/** Two-letter country code from a locale such as "en-IN" (null when there is none). */
export function countryFromLocale(locale: string | null | undefined): string | null {
  const region = (locale ?? "").split("-")[1];
  return region && /^[A-Za-z]{2}$/.test(region) ? region.toLowerCase() : null;
}
