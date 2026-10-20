import Image from "next/image";
import Link from "next/link";
import { displayArea, displayPrice, listingBadge, listingPath, publicImageUrl } from "@/lib/listing-format";
import type { AreaUnit, ListingCategory, ListingPurpose, PriceDisplay, PricePeriod } from "@fyh/shared";
import { Badge } from "./ui";

/** Fields a listing card needs; matches search_listings rows (which can contain nulls). */
export interface ListingCardData {
  id: string;
  reference_code: string;
  slug: string;
  title: string;
  purpose: ListingPurpose;
  category?: ListingCategory | null;
  project_name?: string | null;
  price_amount: number | null;
  currency: string | null;
  price_period: PricePeriod;
  price_display: PriceDisplay;
  bedrooms: number | null;
  bathrooms: number | null;
  area_value: number | null;
  area_unit: AreaUnit | null;
  city_name: string | null;
  locality_name: string | null;
  cover_key: string | null;
  cover_alt: string | null;
  is_featured: boolean;
  availability?: string | null;
  builder_name?: string | null;
  price_max?: number | null;
  distance_km?: number | null;
}

export function ListingCard({ listing, locale, isNew = false }: { listing: ListingCardData; locale: string; isNew?: boolean }) {
  const area = displayArea(listing.area_value, listing.area_unit, locale);
  const facts = [
    listing.bedrooms != null ? `${listing.bedrooms === 0 ? "Studio" : `${listing.bedrooms} bed`}` : null,
    listing.bathrooms != null ? `${listing.bathrooms} bath` : null,
    area,
  ].filter(Boolean);
  const place = [listing.locality_name, listing.city_name].filter(Boolean).join(", ");

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <div className="relative aspect-[4/3] bg-surface-muted">
        {listing.cover_key ? (
          <Image
            src={publicImageUrl(listing.cover_key)}
            alt={listing.cover_alt ?? ""}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">No photo yet</div>
        )}
        <div className="absolute left-3 top-3 flex gap-2">
          <Badge>{listingBadge(listing)}</Badge>
          {listing.is_featured ? <Badge tone="sold">Featured</Badge> : null}
          {isNew ? <Badge tone="published">New</Badge> : null}
          {listing.availability === "under_negotiation" ? <Badge tone="pending_review">Under negotiation</Badge> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="text-lg font-semibold">{displayPrice(listing, locale)}</p>
        <h3 className="font-medium">
          <Link href={listingPath(listing)} className="after:absolute after:inset-0 group-focus-within:underline">
            {listing.title}
          </Link>
        </h3>
        {listing.project_name ? (
          <p className="text-sm font-medium text-brand">
            {listing.project_name}
            {listing.builder_name ? <span className="font-normal text-text-muted"> by {listing.builder_name}</span> : null}
          </p>
        ) : null}
        {place || listing.distance_km != null ? (
          <p className="text-sm text-text-muted">
            {place}
            {listing.distance_km != null ? `${place ? " · " : ""}${Number(listing.distance_km) < 1 ? "under 1" : Math.round(Number(listing.distance_km) * 10) / 10} km away` : ""}
          </p>
        ) : null}
        {facts.length ? <p className="mt-auto pt-2 text-sm text-text-muted">{facts.join(" · ")}</p> : null}
      </div>
    </article>
  );
}

export function ListingGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}
