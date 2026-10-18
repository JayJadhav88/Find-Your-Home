import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/env";
import { listingPath } from "@/lib/listing-format";
import { getSitemapEntries } from "@/lib/public-data";

// Only published listings and public pages. Drafts, private areas and filter
// combinations are excluded.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const listings = await getSitemapEntries();
  return [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/search"), changeFrequency: "daily", priority: 0.8 },
    ...["about", "contact", "privacy", "terms"].map((slug) => ({ url: absoluteUrl(`/${slug}`), priority: 0.3 })),
    ...listings.map((listing) => ({
      url: absoluteUrl(listingPath(listing)),
      lastModified: listing.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
