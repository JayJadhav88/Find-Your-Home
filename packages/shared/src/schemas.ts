import { z } from "zod";
import { parseVideoUrl, splitLinks } from "./videos";
import {
  ADDRESS_VISIBILITIES,
  AREA_UNITS,
  ENQUIRY_KINDS,
  FURNISHINGS,
  LISTING_CATEGORIES,
  LISTING_PURPOSES,
  POSSESSION_STATUSES,
  PRICE_DISPLAYS,
  PRICE_PERIODS,
} from "./domain";

// Shared validation for web and mobile forms. The database re-checks everything with
// constraints and workflow functions; these schemas exist for fast, friendly feedback.

/** Empty form fields arrive as "" — treat them as "not provided". */
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

const optionalNumber = (min: number, max: number, { integer = false } = {}) =>
  z.preprocess(
    blankToUndefined,
    (integer ? z.coerce.number().int() : z.coerce.number()).min(min).max(max).optional(),
  );

const optionalUuid = z.preprocess(blankToUndefined, z.uuid().optional());

const optionalHttpsUrl = z.preprocess(
  blankToUndefined,
  z.url({ protocol: /^https$/, error: "Use a full https:// link" }).max(500).optional(),
);

const checkbox = z.preprocess((value) => value === true || value === "on" || value === "true", z.boolean());

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(72, "Use at most 72 characters")
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/\d/, "Include at least one number");

export const emailSchema = z.email("Enter a valid email address").max(254).transform((value) => value.toLowerCase());

export const signUpSchema = z.object({
  displayName: z.string().trim().min(1, "Enter your name").max(100),
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Enter your name").max(100),
  phone: optionalText(32),
  marketingOptIn: checkbox,
});

// ---------------------------------------------------------------------------
// Enquiries
// ---------------------------------------------------------------------------
export const enquirySchema = z
  .object({
    listingId: z.uuid(),
    name: z.string().trim().min(1, "Enter your name").max(100),
    email: emailSchema,
    phone: optionalText(32),
    message: z.string().trim().min(1, "Write a message").max(5000),
    kind: z.enum(ENQUIRY_KINDS).default("enquiry"),
    /** Local date-time from <input type="datetime-local">, interpreted in `timeZone`. */
    visitAt: optionalText(32),
    timeZone: optionalText(64),
    consent: checkbox,
  })
  .superRefine((value, ctx) => {
    if (value.kind === "visit_request" && (!value.visitAt || !value.timeZone)) {
      ctx.addIssue({ code: "custom", path: ["visitAt"], message: "Choose a date and time for the visit" });
    }
    if (!value.consent) {
      ctx.addIssue({ code: "custom", path: ["consent"], message: "Please agree so we can pass your message on" });
    }
  });

// ---------------------------------------------------------------------------
// Listing form (owner/agent)
// ---------------------------------------------------------------------------
export const listingFormSchema = z
  .object({
    title: z.string().trim().min(3, "Use at least 3 characters").max(140),
    description: z.preprocess((value) => value ?? "", z.string().trim().max(10000)),
    category: z.enum(LISTING_CATEGORIES),
    projectName: optionalText(140),
    projectRegistrationNumber: optionalText(60),
    propertyTypeId: optionalUuid,
    priceAmount: optionalNumber(0, 999_999_999_999),
    currency: z.preprocess(blankToUndefined, z.string().regex(/^[A-Z]{3}$/).optional()),
    pricePeriod: z.enum(PRICE_PERIODS).default("total"),
    priceNegotiable: checkbox,
    priceDisplay: z.enum(PRICE_DISPLAYS).default("show"),
    countryId: optionalUuid,
    regionId: optionalUuid,
    cityId: optionalUuid,
    localityId: optionalUuid,
    postalCode: optionalText(20),
    addressVisibility: z.enum(ADDRESS_VISIBILITIES).default("approximate"),
    streetAddress: optionalText(300),
    areaUnit: z.preprocess(blankToUndefined, z.enum(AREA_UNITS).optional()),
    areaValue: optionalNumber(0.01, 9_999_999_999),
    builtUpArea: optionalNumber(0.01, 9_999_999_999),
    carpetArea: optionalNumber(0.01, 9_999_999_999),
    plotArea: optionalNumber(0.01, 9_999_999_999),
    bedrooms: optionalNumber(0, 50, { integer: true }),
    bathrooms: optionalNumber(0, 50, { integer: true }),
    balconies: optionalNumber(0, 50, { integer: true }),
    parkingSpaces: optionalNumber(0, 100, { integer: true }),
    floorNumber: optionalNumber(-5, 300, { integer: true }),
    totalFloors: optionalNumber(0, 300, { integer: true }),
    yearBuilt: optionalNumber(1600, 2100, { integer: true }),
    furnishing: z.preprocess(blankToUndefined, z.enum(FURNISHINGS).optional()),
    possessionStatus: z.preprocess(blankToUndefined, z.enum(POSSESSION_STATUSES).optional()),
    availableFrom: z.preprocess(blankToUndefined, z.iso.date().optional()),
    /** YouTube / Instagram links, one per line (or comma-separated). */
    videoUrls: z.preprocess((value) => (typeof value === "string" ? value : ""), z.string().max(5000)),
    virtualTourUrl: optionalHttpsUrl,
    contactViaForm: checkbox,
    showPhone: checkbox,
    showWhatsapp: checkbox,
    showEmail: checkbox,
    amenityIds: z.preprocess(
      (value) => (value == null ? [] : Array.isArray(value) ? value : [value]),
      z.array(z.uuid()).max(100),
    ),
  })
  .superRefine((value, ctx) => {
    const areas = [value.areaValue, value.builtUpArea, value.carpetArea, value.plotArea];
    if (areas.some((area) => area !== undefined) && !value.areaUnit) {
      ctx.addIssue({ code: "custom", path: ["areaUnit"], message: "Choose the unit for the area" });
    }
    if (value.priceAmount !== undefined && !value.currency) {
      ctx.addIssue({ code: "custom", path: ["currency"], message: "Choose a currency" });
    }
    if (value.category === "new_project" && !value.projectName) {
      ctx.addIssue({ code: "custom", path: ["projectName"], message: "Enter the project name" });
    }
    const links = splitLinks(value.videoUrls);
    const bad = links.filter((link) => !parseVideoUrl(link));
    if (bad.length) {
      ctx.addIssue({ code: "custom", path: ["videoUrls"], message: `Not a YouTube or Instagram video: ${bad[0]!.slice(0, 60)}` });
    }
    if (links.length > 10) ctx.addIssue({ code: "custom", path: ["videoUrls"], message: "Add at most 10 videos" });
    if (value.floorNumber !== undefined && value.totalFloors !== undefined && value.floorNumber > value.totalFloors) {
      ctx.addIssue({ code: "custom", path: ["floorNumber"], message: "The floor cannot be above the top floor" });
    }
  });

export type ListingFormValues = z.infer<typeof listingFormSchema>;

/** Parsed, de-duplicated videos from the form's videoUrls field. */
export function listingFormVideos(values: ListingFormValues) {
  const seen = new Set<string>();
  return splitLinks(values.videoUrls)
    .map(parseVideoUrl)
    .filter((video): video is NonNullable<typeof video> => video !== null)
    .filter((video) => {
      const key = `${video.provider}:${video.videoId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((video, index) => ({ provider: video.provider, video_id: video.videoId, instagram_kind: video.instagramKind, sort_order: index }));
}

/** Maps validated form values to `listings` table columns (snake_case). */
export function listingFormToRow(values: ListingFormValues) {
  return {
    title: values.title,
    description: values.description,
    category: values.category,
    // Kept in sync by the database; sent for older type definitions.
    purpose: (values.category === "rental" ? "rent" : "sale") as (typeof LISTING_PURPOSES)[number],
    project_name: values.category === "new_project" ? (values.projectName ?? null) : null,
    project_registration_number: values.category === "new_project" ? (values.projectRegistrationNumber ?? null) : null,
    property_type_id: values.propertyTypeId ?? null,
    price_amount: values.priceAmount ?? null,
    currency: values.currency ?? null,
    price_period: values.pricePeriod,
    price_negotiable: values.priceNegotiable,
    price_display: values.priceDisplay,
    country_id: values.countryId ?? null,
    region_id: values.regionId ?? null,
    city_id: values.cityId ?? null,
    locality_id: values.localityId ?? null,
    postal_code: values.postalCode ?? null,
    address_visibility: values.addressVisibility,
    area_unit: values.areaUnit ?? null,
    area_value: values.areaValue ?? null,
    built_up_area: values.builtUpArea ?? null,
    carpet_area: values.carpetArea ?? null,
    plot_area: values.plotArea ?? null,
    bedrooms: values.bedrooms ?? null,
    bathrooms: values.bathrooms ?? null,
    balconies: values.balconies ?? null,
    parking_spaces: values.parkingSpaces ?? null,
    floor_number: values.floorNumber ?? null,
    total_floors: values.totalFloors ?? null,
    year_built: values.yearBuilt ?? null,
    furnishing: values.furnishing ?? null,
    possession_status: values.possessionStatus ?? null,
    available_from: values.availableFrom ?? null,
    virtual_tour_url: values.virtualTourUrl ?? null,
    contact_via_form: values.contactViaForm,
    show_phone: values.showPhone,
    show_whatsapp: values.showWhatsapp,
    show_email: values.showEmail,
  };
}

// ---------------------------------------------------------------------------
// Search filters (URL query string <-> search_listings RPC)
// ---------------------------------------------------------------------------
export const SEARCH_SORTS = ["newest", "price_asc", "price_desc", "relevance"] as const;

export const searchParamsSchema = z.object({
  q: optionalText(120),
  purpose: z.preprocess(blankToUndefined, z.enum(LISTING_PURPOSES).optional()).catch(undefined),
  category: z.preprocess(blankToUndefined, z.enum(LISTING_CATEGORIES).optional()).catch(undefined),
  type: z
    .preprocess((value) => (typeof value === "string" ? value.split(",").filter(Boolean) : value), z.array(z.uuid()).max(20))
    .optional()
    .catch(undefined),
  location: optionalUuid.catch(undefined),
  currency: z.preprocess(blankToUndefined, z.string().regex(/^[A-Z]{3}$/).optional()).catch(undefined),
  minPrice: optionalNumber(0, 999_999_999_999).catch(undefined),
  maxPrice: optionalNumber(0, 999_999_999_999).catch(undefined),
  beds: optionalNumber(0, 50, { integer: true }).catch(undefined),
  baths: optionalNumber(0, 50, { integer: true }).catch(undefined),
  minArea: optionalNumber(0, 9_999_999_999).catch(undefined),
  maxArea: optionalNumber(0, 9_999_999_999).catch(undefined),
  unit: z.preprocess(blankToUndefined, z.enum(AREA_UNITS).optional()).catch(undefined),
  amenities: z
    .preprocess((value) => (typeof value === "string" ? value.split(",").filter(Boolean) : value), z.array(z.uuid()).max(30))
    .optional()
    .catch(undefined),
  furnishing: z.preprocess(blankToUndefined, z.enum(FURNISHINGS).optional()).catch(undefined),
  featured: z.preprocess((value) => value === "1" || value === "true", z.boolean()).catch(false),
  recent: optionalNumber(1, 365, { integer: true }).catch(undefined),
  sort: z.preprocess(blankToUndefined, z.enum(SEARCH_SORTS).default("newest")).catch("newest"),
  cursor: optionalText(200).catch(undefined),
});

export type SearchFilters = z.infer<typeof searchParamsSchema>;

/** Tolerant parsing: invalid values are dropped instead of failing the page. */
export function parseSearchParams(input: Record<string, string | string[] | undefined>): SearchFilters {
  const flat = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : value]),
  );
  return searchParamsSchema.parse(flat);
}

/** Builds the arguments for the search_listings RPC. */
export function searchFiltersToRpcArgs(filters: SearchFilters, defaults: { currency?: string | null; pageSize?: number } = {}) {
  const hasPrice = filters.minPrice !== undefined || filters.maxPrice !== undefined;
  const hasArea = filters.minArea !== undefined || filters.maxArea !== undefined;
  return {
    p_q: filters.q ?? undefined,
    p_purpose: filters.purpose ?? undefined,
    p_category: filters.category ?? undefined,
    p_property_type_ids: filters.type?.length ? filters.type : undefined,
    p_location_id: filters.location ?? undefined,
    p_currency: filters.currency ?? (hasPrice ? (defaults.currency ?? undefined) : undefined),
    p_min_price: filters.minPrice ?? undefined,
    p_max_price: filters.maxPrice ?? undefined,
    p_min_bedrooms: filters.beds ?? undefined,
    p_min_bathrooms: filters.baths ?? undefined,
    p_min_area: filters.minArea ?? undefined,
    p_max_area: filters.maxArea ?? undefined,
    p_area_unit: filters.unit ?? (hasArea ? ("sq_m" as const) : undefined),
    p_amenity_ids: filters.amenities?.length ? filters.amenities : undefined,
    p_furnishing: filters.furnishing ?? undefined,
    p_featured_only: filters.featured,
    p_listed_within_days: filters.recent ?? undefined,
    p_sort: filters.sort,
    p_cursor: filters.cursor ?? undefined,
    p_limit: defaults.pageSize ?? 24,
  };
}

/** Serialises filters back to a query string (omitting defaults) for shareable URLs. */
export function searchFiltersToQuery(filters: Partial<SearchFilters>): string {
  const params = new URLSearchParams();
  const set = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === "" || value === false) return;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(","));
      return;
    }
    params.set(key, value === true ? "1" : String(value));
  };
  set("q", filters.q);
  set("purpose", filters.purpose);
  set("category", filters.category);
  set("type", filters.type);
  set("location", filters.location);
  set("currency", filters.currency);
  set("minPrice", filters.minPrice);
  set("maxPrice", filters.maxPrice);
  set("beds", filters.beds);
  set("baths", filters.baths);
  set("minArea", filters.minArea);
  set("maxArea", filters.maxArea);
  set("unit", filters.unit);
  set("amenities", filters.amenities);
  set("furnishing", filters.furnishing);
  set("featured", filters.featured);
  set("recent", filters.recent);
  if (filters.sort && filters.sort !== "newest") set("sort", filters.sort);
  set("cursor", filters.cursor);
  return params.toString();
}

/** Turns zod issues into { fieldName: firstMessage } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    result[key] ??= issue.message;
  }
  return result;
}
