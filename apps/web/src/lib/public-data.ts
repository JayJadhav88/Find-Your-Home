import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "./supabase";

// Public, cookie-free data. Cached with tags; Server Actions call updateTag() after changes.
// Tags: "settings", "taxonomy", "content", "listings", `listing:${reference}`.

export async function getSiteSettings() {
  "use cache";
  cacheLife("hours");
  cacheTag("settings");
  const { data, error } = await createPublicClient().from("site_settings").select("*").single();
  if (error) throw error;
  return data;
}

export async function getTaxonomy() {
  "use cache";
  cacheLife("hours");
  cacheTag("taxonomy");
  const db = createPublicClient();
  const [types, amenities, locations, currencies] = await Promise.all([
    db.from("property_types").select("id, slug, name, is_residential").eq("is_active", true).order("sort_order"),
    db.from("amenities").select("id, slug, name, category").eq("is_active", true).order("sort_order"),
    db.from("locations").select("id, parent_id, level, name, slug, country_code").eq("is_active", true).order("name"),
    db.from("currencies").select("code, name").eq("is_enabled", true).order("code"),
  ]);
  for (const result of [types, amenities, locations, currencies]) if (result.error) throw result.error;
  return {
    propertyTypes: types.data ?? [],
    amenities: amenities.data ?? [],
    locations: locations.data ?? [],
    currencies: currencies.data ?? [],
  };
}

export type Taxonomy = Awaited<ReturnType<typeof getTaxonomy>>;

/** "Old Town, Sampleton" style label with the full parent chain. */
export function locationLabel(taxonomy: Taxonomy, id: string | null | undefined): string {
  const byId = new Map(taxonomy.locations.map((location) => [location.id, location]));
  const parts: string[] = [];
  let current = id ? byId.get(id) : undefined;
  while (current) {
    parts.push(current.name);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return parts.join(", ");
}

export async function getContentPage(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("content");
  const { data } = await createPublicClient()
    .from("content_pages")
    .select("slug, title, body_markdown, updated_at")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

export async function getHomeListings() {
  "use cache";
  cacheLife("minutes");
  cacheTag("listings");
  const db = createPublicClient();
  const [featured, recent] = await Promise.all([
    db.rpc("search_listings", { p_featured_only: true, p_limit: 6 }),
    db.rpc("search_listings", { p_limit: 6 }),
  ]);
  if (featured.error) throw featured.error;
  if (recent.error) throw recent.error;
  return { featured: (featured.data ?? []).slice(0, 6), recent: (recent.data ?? []).slice(0, 6) };
}

export type ListingCardData = Awaited<ReturnType<typeof getHomeListings>>["recent"][number];

/** Full public listing by reference code (published only, enforced by RLS). */
export async function getPublicListing(reference: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("listings", `listing:${reference}`);
  const db = createPublicClient();
  const { data: listing, error } = await db
    .from("listings")
    .select(
      `*, property_type:property_types(name, slug),
       media:listing_media(id, kind, public_key, alt_text, sort_order, is_cover),
       amenities:listing_amenities(amenity:amenities(id, name, category))`,
    )
    .eq("reference_code", reference)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  if (!listing) return null;

  const { data: contact } = await db.rpc("get_listing_contact", { p_listing_id: listing.id }).maybeSingle();
  return { ...listing, contact: contact ?? null };
}

export async function getListingReferenceById(id: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("listings");
  const { data } = await createPublicClient()
    .from("listings")
    .select("reference_code, slug")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();
  return data;
}

export async function getSitemapEntries() {
  "use cache";
  cacheLife("hours");
  cacheTag("listings");
  const { data } = await createPublicClient()
    .from("listings")
    .select("reference_code, slug, updated_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(45000);
  return data ?? [];
}
