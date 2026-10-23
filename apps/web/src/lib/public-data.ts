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
    .select("slug, title, body_markdown, format, description, full_page, is_system, updated_at")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

/** Published pages the team added and chose to link in the footer, in their order. */
export async function getFooterPages() {
  "use cache";
  cacheLife("hours");
  cacheTag("content");
  const { data } = await createPublicClient()
    .from("content_pages")
    .select("slug, title, is_system")
    .eq("in_footer", true)
    .eq("is_system", false)
    .order("sort_order")
    .order("title");
  return data ?? [];
}

/** Published pages the team added (for the sitemap). */
export async function getCustomPages() {
  "use cache";
  cacheLife("hours");
  cacheTag("content");
  const { data } = await createPublicClient().from("content_pages").select("slug, updated_at").eq("is_system", false);
  return data ?? [];
}

/** Where a page lives: About, Contact, Privacy and Terms keep their short addresses. */
export function pagePath(page: { slug: string; is_system: boolean }) {
  return page.is_system ? `/${page.slug}` : `/pages/${page.slug}`;
}

export async function getHomeListings() {
  "use cache";
  cacheLife("minutes");
  cacheTag("listings");
  const db = createPublicClient();
  const [featured, recent, projects] = await Promise.all([
    db.rpc("search_listings", { p_featured_only: true, p_limit: 6 }),
    db.rpc("search_listings", { p_limit: 6 }),
    db.rpc("search_listings", { p_category: "new_project", p_limit: 3 }),
  ]);
  for (const result of [featured, recent, projects]) if (result.error) throw result.error;
  return {
    featured: (featured.data ?? []).slice(0, 6),
    recent: (recent.data ?? []).slice(0, 6),
    newProjects: (projects.data ?? []).slice(0, 3),
  };
}

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
       amenities:listing_amenities(amenity:amenities(id, name, category)),
       videos:listing_videos(provider, video_id, instagram_kind, sort_order)`,
    )
    .eq("reference_code", reference)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  if (!listing) return null;

  const [{ data: contact }, { data: builder }] = await Promise.all([
    db.rpc("get_listing_contact", { p_listing_id: listing.id }).maybeSingle(),
    listing.category === "new_project" && listing.builder_id
      ? db.from("builders").select("name, slug, website").eq("id", listing.builder_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return { ...listing, contact: contact ?? null, builder: builder ?? null };
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

export async function getBuilders() {
  "use cache";
  cacheLife("hours");
  cacheTag("builders");
  const { data } = await createPublicClient().from("builders").select("id, name, slug").eq("is_active", true).order("name");
  return data ?? [];
}

export async function getBuilderBySlug(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("builders", `builder:${slug}`);
  const { data } = await createPublicClient()
    .from("builders")
    .select("id, name, slug, description, website, logo_url, contact_email, contact_phone")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

/** Live banners for one area: "top" (rotating, under the header) or "offers" (side by side). */
export async function getBanners(placement: "top" | "offers", audience: "web" | "app" = "web") {
  "use cache";
  cacheLife("minutes");
  cacheTag("banners");
  const { data } = await createPublicClient()
    .from("banners")
    .select("id, title, subtitle, image_url, cta_label, target_url, audience")
    .eq("placement", placement)
    .in("audience", ["all", audience])
    .order("sort_order")
    .order("created_at", { ascending: false })
    .limit(placement === "top" ? 8 : 12);
  return data ?? [];
}

export async function getFloatingAction() {
  "use cache";
  cacheLife("minutes");
  cacheTag("floating-action");
  const { data } = await createPublicClient().from("floating_action").select("is_active, icon, label, target_url, position").maybeSingle();
  return data?.is_active && data.target_url ? data : null;
}
