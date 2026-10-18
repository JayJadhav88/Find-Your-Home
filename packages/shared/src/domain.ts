// Domain enumerations. These mirror the PostgreSQL enums defined in
// supabase/migrations and must be changed together with a migration.

export const APP_ROLES = ["buyer", "owner", "agent", "moderator", "administrator", "builder"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const STAFF_ROLES = ["moderator", "administrator"] as const satisfies readonly AppRole[];

export const LISTING_CATEGORIES = ["rental", "resale", "new_project"] as const;
export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<ListingCategory, string> = {
  rental: "Rental",
  resale: "Resale",
  new_project: "New project",
};

export const LISTING_PURPOSES = ["sale", "rent"] as const;
export type ListingPurpose = (typeof LISTING_PURPOSES)[number];

export const LISTING_STATUSES = [
  "draft",
  "pending_review",
  "published",
  "rejected",
  "suspended",
  "archived",
  "sold",
  "rented",
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const PRICE_PERIODS = ["total", "per_month", "per_year", "per_week", "per_day"] as const;
export type PricePeriod = (typeof PRICE_PERIODS)[number];

export const PRICE_DISPLAYS = ["show", "on_request"] as const;
export type PriceDisplay = (typeof PRICE_DISPLAYS)[number];

export const ADDRESS_VISIBILITIES = ["exact", "approximate", "hidden"] as const;
export type AddressVisibility = (typeof ADDRESS_VISIBILITIES)[number];

export const FURNISHINGS = ["unfurnished", "semi_furnished", "furnished"] as const;
export type Furnishing = (typeof FURNISHINGS)[number];

export const POSSESSION_STATUSES = ["ready", "under_construction", "available_from_date"] as const;
export type PossessionStatus = (typeof POSSESSION_STATUSES)[number];

export const AREA_UNITS = ["sq_m", "sq_ft", "acre", "hectare"] as const;
export type AreaUnit = (typeof AREA_UNITS)[number];

export const ENQUIRY_KINDS = ["enquiry", "visit_request"] as const;
export type EnquiryKind = (typeof ENQUIRY_KINDS)[number];

export const ENQUIRY_STATUSES = ["new", "in_progress", "responded", "closed", "spam"] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const VISIT_STATUSES = ["requested", "confirmed", "declined", "cancelled"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

/** Statuses whose listings are visible to the public. */
export const PUBLIC_LISTING_STATUSES = ["published"] as const satisfies readonly ListingStatus[];
