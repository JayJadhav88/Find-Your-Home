import Image from "next/image";
import Link from "next/link";
import { displayArea, displayPrice, listingPath, PURPOSE_LABEL, publicImageUrl } from "@/lib/listing-format";
import type { ListingCardData } from "@/lib/public-data";
import { Badge } from "./ui";

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
          <Badge>{PURPOSE_LABEL[listing.purpose]}</Badge>
          {listing.is_featured ? <Badge tone="sold">Featured</Badge> : null}
          {isNew ? <Badge tone="published">New</Badge> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="text-lg font-semibold">{displayPrice(listing, locale)}</p>
        <h3 className="font-medium">
          <Link href={listingPath(listing)} className="after:absolute after:inset-0 group-focus-within:underline">
            {listing.title}
          </Link>
        </h3>
        {place ? <p className="text-sm text-text-muted">{place}</p> : null}
        {facts.length ? <p className="mt-auto pt-2 text-sm text-text-muted">{facts.join(" · ")}</p> : null}
      </div>
    </article>
  );
}

export function ListingGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}
