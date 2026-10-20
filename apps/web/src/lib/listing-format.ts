import {
  formatArea,
  formatPrice,
  pricePeriodSuffix,
  type AreaUnit,
  type ListingCategory,
  type PriceDisplay,
  type PricePeriod,
} from "@fyh/shared";
import { env } from "./env";

export function publicImageUrl(key: string): string {
  return `${env.supabaseUrl}/storage/v1/object/public/listing-public/${key}`;
}

export function listingPath(listing: { reference_code: string; slug: string }): string {
  return `/properties/${listing.reference_code}/${listing.slug}`;
}

export function displayPrice(
  listing: {
    price_amount: number | null;
    currency: string | null;
    price_period: PricePeriod;
    price_display: PriceDisplay;
  },
  locale: string,
): string {
  if (listing.price_display === "on_request" || listing.price_amount == null || !listing.currency) {
    return "Price on request";
  }
  const suffix = pricePeriodSuffix(listing.price_period);
  return `${formatPrice(Number(listing.price_amount), listing.currency, { locale })}${suffix ? ` ${suffix}` : ""}`;
}

export function displayArea(value: number | null, unit: AreaUnit | null, locale: string): string | null {
  return value != null && unit ? formatArea(Number(value), unit, { locale }) : null;
}

export const PURPOSE_LABEL = { sale: "For sale", rent: "For rent" } as const;

export const CATEGORY_BADGE: Record<ListingCategory, string> = {
  rental: "For rent",
  resale: "Resale",
  new_project: "New project",
};

/** Badge text for a listing: its category when known, otherwise sale/rent. */
export function listingBadge(listing: { category?: ListingCategory | null; purpose: "sale" | "rent" }): string {
  return listing.category ? CATEGORY_BADGE[listing.category] : PURPOSE_LABEL[listing.purpose];
}

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

export const FURNISHING_LABEL = { unfurnished: "Unfurnished", semi_furnished: "Semi-furnished", furnished: "Furnished" } as const;

export const POSSESSION_LABEL = {
  upcoming: "Upcoming launch",
  ready: "Ready to move in",
  under_construction: "Under construction",
  available_from_date: "Available from a date",
} as const;

export const AREA_UNIT_LABEL = { sq_m: "m²", sq_ft: "sq ft", acre: "acres", hectare: "hectares" } as const;

export const PRICE_PERIOD_LABEL = {
  total: "Total price",
  per_month: "Per month",
  per_year: "Per year",
  per_week: "Per week",
  per_day: "Per day",
} as const;
