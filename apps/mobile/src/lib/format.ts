import { formatArea, formatPrice, pricePeriodSuffix, type AreaUnit, type ListingCategory, type PriceDisplay, type PricePeriod } from "@fyh/shared";

export const CATEGORY_BADGE: Record<ListingCategory, string> = {
  rental: "For rent",
  resale: "Resale",
  new_project: "New project",
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_review: "Awaiting review",
  published: "Live",
  rejected: "Changes requested",
  suspended: "Suspended",
  archived: "Archived",
  sold: "Sold",
  rented: "Rented",
};

export const STATUS_TONE: Record<string, "brand" | "success" | "warning" | "danger" | "muted"> = {
  draft: "muted",
  pending_review: "warning",
  published: "success",
  rejected: "danger",
  suspended: "danger",
  archived: "muted",
  sold: "brand",
  rented: "brand",
};

export function displayPrice(
  listing: { price_amount: number | null; currency: string | null; price_period: PricePeriod; price_display: PriceDisplay; price_max?: number | null },
  locale: string,
): string {
  if (listing.price_display === "on_request" || listing.price_amount == null || !listing.currency) return "Price on request";
  const suffix = pricePeriodSuffix(listing.price_period);
  const from = formatPrice(Number(listing.price_amount), listing.currency, { locale });
  // New projects can show a range.
  if (listing.price_max != null && Number(listing.price_max) > Number(listing.price_amount)) {
    return `${from} – ${formatPrice(Number(listing.price_max), listing.currency, { locale })}`;
  }
  return `${from}${suffix ? ` ${suffix}` : ""}`;
}

export function displayArea(value: number | null, unit: AreaUnit | null, locale: string): string | null {
  return value != null && unit ? formatArea(Number(value), unit, { locale }) : null;
}

export function roomsLine(listing: { bedrooms: number | null; bathrooms: number | null; area_value: number | null; area_unit: AreaUnit | null }, locale: string) {
  return [
    listing.bedrooms != null ? (listing.bedrooms === 0 ? "Studio" : `${listing.bedrooms} bed`) : null,
    listing.bathrooms != null ? `${listing.bathrooms} bath` : null,
    displayArea(listing.area_value, listing.area_unit, locale),
  ]
    .filter(Boolean)
    .join(" · ");
}
