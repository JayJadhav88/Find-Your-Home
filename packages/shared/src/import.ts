// Spreadsheet import: column definitions, value parsing, name -> id resolution and per-row
// validation. Produces rows for the admin_import_listings RPC (database column names).

import type { ListingCategory } from "./domain";
import { parseVideoUrl, splitLinks, type ParsedVideo } from "./videos";

export interface ImportColumn {
  header: string;
  required?: boolean;
  help: string;
  example: string;
}

/** Template columns, in order. Headers are matched case-insensitively. */
export const IMPORT_COLUMNS: ImportColumn[] = [
  { header: "Category", required: true, help: "Rental, Resale or New project", example: "Resale" },
  { header: "Title", required: true, help: "3–140 characters", example: "Bright 2-bedroom flat near the park" },
  { header: "Description", help: "At least 30 characters to publish", example: "Corner flat with a balcony, close to shops and transport." },
  { header: "Property type", help: "As listed in admin, e.g. Apartment", example: "Apartment" },
  { header: "Price", help: "Number only", example: "250000" },
  { header: "Currency", help: "Three-letter code of an enabled currency", example: "USD" },
  { header: "Price period", help: "Total, Per month, Per year, Per week or Per day", example: "Total" },
  { header: "Price negotiable", help: "Yes or No", example: "No" },
  { header: "Price on request", help: "Yes hides the price", example: "No" },
  { header: "Country", help: "Place name as listed in admin", example: "Demo Country" },
  { header: "Region", help: "Optional", example: "Demo Region" },
  { header: "City", help: "Place name as listed in admin", example: "Sampleton" },
  { header: "Locality", help: "Optional neighbourhood", example: "Old Town (demo)" },
  { header: "Postal code", help: "Optional", example: "" },
  { header: "Street address", help: "Private: never shown publicly", example: "" },
  { header: "Show location", help: "Approximate, Exact or Hidden", example: "Approximate" },
  { header: "Area", help: "Total area, number only", example: "85" },
  { header: "Area unit", help: "sq m, sq ft, acre or hectare", example: "sq m" },
  { header: "Built-up area", help: "Optional", example: "" },
  { header: "Carpet area", help: "Optional", example: "" },
  { header: "Plot area", help: "Optional", example: "" },
  { header: "Bedrooms", help: "Whole number", example: "2" },
  { header: "Bathrooms", help: "Whole number", example: "1" },
  { header: "Balconies", help: "Optional", example: "" },
  { header: "Parking", help: "Number of spaces", example: "" },
  { header: "Floor", help: "Optional", example: "" },
  { header: "Total floors", help: "Optional", example: "" },
  { header: "Year built", help: "Optional", example: "" },
  { header: "Furnishing", help: "Unfurnished, Semi-furnished or Furnished", example: "Semi-furnished" },
  { header: "Availability", help: "Ready, Under construction or Available from date", example: "Ready" },
  { header: "Available from", help: "Date (YYYY-MM-DD)", example: "" },
  { header: "Amenities", help: "Comma-separated names as listed in admin", example: "Parking, Lift / Elevator" },
  { header: "Image URLs", help: "Direct image links (JPEG, PNG, WebP), separated by commas or new lines. The first is the cover.", example: "https://example.com/photo1.jpg" },
  { header: "Video URLs", help: "YouTube or Instagram links, separated by commas or new lines", example: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
  { header: "Virtual tour URL", help: "Optional https link", example: "" },
  { header: "Project name", help: "Required for New project", example: "" },
  { header: "Project registration number", help: "Optional, for New project", example: "" },
];

export interface ImportTaxonomy {
  propertyTypes: Array<{ id: string; name: string; slug: string }>;
  amenities: Array<{ id: string; name: string; slug: string }>;
  locations: Array<{ id: string; parent_id: string | null; level: string; name: string; slug: string }>;
  currencies: Array<{ code: string }>;
}

export type CellValue = string | number | boolean | Date | null | undefined;

export interface ImportRow {
  row_number: number;
  category: ListingCategory;
  title: string;
  description: string;
  property_type_id: string | null;
  price_amount: number | null;
  currency: string | null;
  price_period: string;
  price_negotiable: boolean;
  price_display: "show" | "on_request";
  country_id: string | null;
  region_id: string | null;
  city_id: string | null;
  locality_id: string | null;
  postal_code: string | null;
  street_address: string | null;
  address_visibility: "exact" | "approximate" | "hidden";
  area_unit: string | null;
  area_value: number | null;
  built_up_area: number | null;
  carpet_area: number | null;
  plot_area: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  balconies: number | null;
  parking_spaces: number | null;
  floor_number: number | null;
  total_floors: number | null;
  year_built: number | null;
  furnishing: string | null;
  possession_status: string | null;
  available_from: string | null;
  virtual_tour_url: string | null;
  project_name: string | null;
  project_registration_number: string | null;
  amenity_ids: string[];
  image_urls: string[];
  videos: Array<{ provider: ParsedVideo["provider"]; video_id: string; instagram_kind: string | null }>;
}

export interface ImportRowError {
  row_number: number;
  title: string;
  messages: string[];
}

export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_IMAGES = 30;

const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s_\-/]+/g, " ").replace(/[()]/g, "");

function text(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

/** Excel stores dates as day counts from 1899-12-30. */
function dateValue(value: CellValue): string | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "invalid" : value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000);
    return date.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw)) ? raw : "invalid";
}

function lookup<T extends string>(raw: string, options: Record<string, T>): T | null | "invalid" {
  if (!raw) return null;
  return options[normalize(raw)] ?? "invalid";
}

const CATEGORY_VALUES: Record<string, ListingCategory> = {
  rental: "rental", rent: "rental", "for rent": "rental", lease: "rental",
  resale: "resale", sale: "resale", "for sale": "resale", "re sale": "resale",
  "new project": "new_project", new: "new_project", "new property": "new_project", builder: "new_project",
  "new launch": "new_project", "new_project": "new_project",
};
const PERIOD_VALUES: Record<string, string> = {
  total: "total", "one time": "total", "per month": "per_month", monthly: "per_month", month: "per_month",
  "per year": "per_year", yearly: "per_year", annual: "per_year", year: "per_year",
  "per week": "per_week", weekly: "per_week", "per day": "per_day", daily: "per_day",
};
const UNIT_VALUES: Record<string, string> = {
  "sq m": "sq_m", sqm: "sq_m", m2: "sq_m", "m²": "sq_m", "square metres": "sq_m", "square meters": "sq_m",
  "sq ft": "sq_ft", sqft: "sq_ft", ft2: "sq_ft", "square feet": "sq_ft",
  acre: "acre", acres: "acre", hectare: "hectare", hectares: "hectare", ha: "hectare",
};
const FURNISHING_VALUES: Record<string, string> = {
  unfurnished: "unfurnished", "semi furnished": "semi_furnished", semi: "semi_furnished", furnished: "furnished",
  "fully furnished": "furnished",
};
const POSSESSION_VALUES: Record<string, string> = {
  ready: "ready", "ready to move": "ready", "ready to move in": "ready",
  "under construction": "under_construction", "available from date": "available_from_date",
  "available from": "available_from_date",
};
const VISIBILITY_VALUES: Record<string, "exact" | "approximate" | "hidden"> = {
  approximate: "approximate", exact: "exact", hidden: "hidden",
};

function bool(raw: string): boolean | null | "invalid" {
  if (!raw) return null;
  const value = normalize(raw);
  if (["yes", "y", "true", "1"].includes(value)) return true;
  if (["no", "n", "false", "0"].includes(value)) return false;
  return "invalid";
}

function number(raw: string, { integer = false, min = 0, max = 1e12 } = {}): number | null | "invalid" {
  if (!raw) return null;
  // Allow thousands separators and a leading currency symbol, but require digits.
  const cleaned = raw.replace(/[,\s]/g, "").replace(/^[^\d.-]{1,3}(?=[\d.-])/, "");
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return "invalid";
  const value = Number(cleaned);
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min || value > max) return "invalid";
  return value;
}

/** Maps header cells to column headers (case/spacing-insensitive). Returns unknown headers too. */
export function mapHeaders(headers: string[]): { indexByHeader: Map<string, number>; unknown: string[]; missingRequired: string[] } {
  const known = new Map(IMPORT_COLUMNS.map((column) => [normalize(column.header), column.header]));
  const indexByHeader = new Map<string, number>();
  const unknown: string[] = [];
  headers.forEach((header, index) => {
    const match = known.get(normalize(header ?? ""));
    if (match) indexByHeader.set(match, index);
    else if ((header ?? "").trim()) unknown.push(header.trim());
  });
  const missingRequired = IMPORT_COLUMNS.filter((column) => column.required && !indexByHeader.has(column.header)).map(
    (column) => column.header,
  );
  return { indexByHeader, unknown, missingRequired };
}

/**
 * Validates and resolves spreadsheet rows. `records` are objects keyed by template header.
 * `firstRowNumber` is the spreadsheet row number of records[0] (2 when row 1 holds headers).
 */
export function prepareImportRows(
  records: Array<Record<string, CellValue>>,
  taxonomy: ImportTaxonomy,
  firstRowNumber = 2,
): { rows: ImportRow[]; errors: ImportRowError[] } {
  const typeByName = new Map<string, string>();
  for (const type of taxonomy.propertyTypes) {
    typeByName.set(normalize(type.name), type.id);
    typeByName.set(normalize(type.slug), type.id);
  }
  const amenityByName = new Map<string, string>();
  for (const amenity of taxonomy.amenities) {
    amenityByName.set(normalize(amenity.name), amenity.id);
    amenityByName.set(normalize(amenity.slug), amenity.id);
  }
  const currencies = new Set(taxonomy.currencies.map((currency) => currency.code));
  const findPlace = (name: string, level: string, parents: Array<string | null>) =>
    taxonomy.locations.find(
      (location) =>
        location.level === level &&
        (normalize(location.name) === normalize(name) || normalize(location.slug) === normalize(name)) &&
        parents.includes(location.parent_id),
    );

  const rows: ImportRow[] = [];
  const errors: ImportRowError[] = [];

  records.forEach((record, index) => {
    const rowNumber = firstRowNumber + index;
    const get = (header: string) => text(record[header]);
    if (IMPORT_COLUMNS.every((column) => !get(column.header))) return; // blank line
    const messages: string[] = [];
    const fail = (message: string) => messages.push(message);

    const category = lookup(get("Category"), CATEGORY_VALUES);
    if (!category) fail("Category is required (Rental, Resale or New project)");
    else if (category === "invalid") fail(`Category "${get("Category")}" is not Rental, Resale or New project`);

    const title = get("Title");
    if (title.length < 3 || title.length > 140) fail("Title must be 3–140 characters");
    const description = get("Description");
    if (description.length > 10000) fail("Description is longer than 10,000 characters");

    let propertyTypeId: string | null = null;
    if (get("Property type")) {
      propertyTypeId = typeByName.get(normalize(get("Property type"))) ?? null;
      if (!propertyTypeId) fail(`Property type "${get("Property type")}" is not in the admin list`);
    }

    const priceOnRequest = bool(get("Price on request"));
    if (priceOnRequest === "invalid") fail("Price on request must be Yes or No");
    const price = number(get("Price"), { max: 999_999_999_999 });
    if (price === "invalid") fail(`Price "${get("Price")}" is not a number`);
    const currency = get("Currency").toUpperCase() || null;
    if (currency && !currencies.has(currency)) fail(`Currency "${currency}" is not enabled`);
    if (typeof price === "number" && !currency) fail("Currency is required when a price is given");
    const period = lookup(get("Price period"), PERIOD_VALUES);
    if (period === "invalid") fail(`Price period "${get("Price period")}" is not recognised`);
    const negotiable = bool(get("Price negotiable"));
    if (negotiable === "invalid") fail("Price negotiable must be Yes or No");

    let countryId: string | null = null;
    let regionId: string | null = null;
    let cityId: string | null = null;
    let localityId: string | null = null;
    if (get("Country")) {
      countryId = findPlace(get("Country"), "country", [null])?.id ?? null;
      if (!countryId) fail(`Country "${get("Country")}" is not in the admin list`);
    }
    if (get("Region")) {
      regionId = countryId ? (findPlace(get("Region"), "region", [countryId])?.id ?? null) : null;
      if (!regionId) fail(`Region "${get("Region")}" was not found in that country`);
    }
    if (get("City")) {
      const regionsOfCountry = taxonomy.locations.filter((l) => l.level === "region" && l.parent_id === countryId).map((l) => l.id);
      const parents = regionId ? [regionId] : [countryId, ...regionsOfCountry];
      cityId = countryId ? (findPlace(get("City"), "city", parents)?.id ?? null) : null;
      if (!cityId) fail(`City "${get("City")}" was not found${countryId ? " in that country/region" : " (set Country first)"}`);
    }
    if (get("Locality")) {
      localityId = cityId ? (findPlace(get("Locality"), "locality", [cityId])?.id ?? null) : null;
      if (!localityId) fail(`Locality "${get("Locality")}" was not found in that city`);
    }

    const visibility = lookup(get("Show location"), VISIBILITY_VALUES);
    if (visibility === "invalid") fail("Show location must be Approximate, Exact or Hidden");

    const areaFields = { "Area": 0, "Built-up area": 0, "Carpet area": 0, "Plot area": 0 } as Record<string, number | null>;
    for (const header of Object.keys(areaFields)) {
      const value = number(get(header), { max: 9_999_999_999 });
      if (value === "invalid" || value === 0) fail(`${header} "${get(header)}" must be a positive number`);
      areaFields[header] = typeof value === "number" && value > 0 ? value : null;
    }
    const unit = lookup(get("Area unit"), UNIT_VALUES);
    if (unit === "invalid") fail(`Area unit "${get("Area unit")}" is not sq m, sq ft, acre or hectare`);
    if (Object.values(areaFields).some((value) => value !== null) && !unit) fail("Area unit is required when an area is given");

    const ints: Record<string, [number, number]> = {
      Bedrooms: [0, 50], Bathrooms: [0, 50], Balconies: [0, 50], Parking: [0, 100],
      Floor: [-5, 300], "Total floors": [0, 300], "Year built": [1600, 2100],
    };
    const intValues: Record<string, number | null> = {};
    for (const [header, [min, max]] of Object.entries(ints)) {
      const value = number(get(header), { integer: true, min, max });
      if (value === "invalid") fail(`${header} "${get(header)}" must be a whole number between ${min} and ${max}`);
      intValues[header] = typeof value === "number" ? value : null;
    }
    if (intValues.Floor !== null && intValues["Total floors"] !== null && intValues.Floor! > intValues["Total floors"]!) {
      fail("Floor cannot be above Total floors");
    }

    const furnishing = lookup(get("Furnishing"), FURNISHING_VALUES);
    if (furnishing === "invalid") fail(`Furnishing "${get("Furnishing")}" is not recognised`);
    const possession = lookup(get("Availability"), POSSESSION_VALUES);
    if (possession === "invalid") fail(`Availability "${get("Availability")}" is not recognised`);
    const availableFrom = dateValue(record["Available from"]);
    if (availableFrom === "invalid") fail("Available from must be a date (YYYY-MM-DD)");

    const amenityIds: string[] = [];
    for (const name of get("Amenities").split(",").map((part) => part.trim()).filter(Boolean)) {
      const id = amenityByName.get(normalize(name));
      if (id) amenityIds.push(id);
      else fail(`Amenity "${name}" is not in the admin list`);
    }

    const imageUrls = splitLinks(get("Image URLs"));
    if (imageUrls.length > MAX_IMPORT_IMAGES) fail(`At most ${MAX_IMPORT_IMAGES} images per listing`);
    for (const url of imageUrls) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
      } catch {
        fail(`Image link "${url.slice(0, 80)}" is not a web address`);
      }
    }

    const videos: ImportRow["videos"] = [];
    for (const url of splitLinks(get("Video URLs"))) {
      const video = parseVideoUrl(url);
      if (video) videos.push({ provider: video.provider, video_id: video.videoId, instagram_kind: video.instagramKind });
      else fail(`Video link "${url.slice(0, 80)}" is not a YouTube or Instagram video`);
    }
    if (videos.length > 10) fail("At most 10 videos per listing");

    const tour = get("Virtual tour URL");
    if (tour && !/^https:\/\//.test(tour)) fail("Virtual tour URL must start with https://");

    const projectName = get("Project name");
    if (category === "new_project" && !projectName) fail("Project name is required for New project");

    if (messages.length) {
      errors.push({ row_number: rowNumber, title, messages });
      return;
    }

    rows.push({
      row_number: rowNumber,
      category: category as ListingCategory,
      title,
      description,
      property_type_id: propertyTypeId,
      price_amount: typeof price === "number" ? price : null,
      currency,
      price_period: (period as string | null) ?? (category === "rental" ? "per_month" : "total"),
      price_negotiable: negotiable === true,
      price_display: priceOnRequest === true ? "on_request" : "show",
      country_id: countryId,
      region_id: regionId,
      city_id: cityId,
      locality_id: localityId,
      postal_code: get("Postal code") || null,
      street_address: get("Street address") || null,
      address_visibility: (visibility as "exact" | "approximate" | "hidden" | null) ?? "approximate",
      area_unit: (unit as string | null) ?? null,
      area_value: areaFields.Area ?? null,
      built_up_area: areaFields["Built-up area"] ?? null,
      carpet_area: areaFields["Carpet area"] ?? null,
      plot_area: areaFields["Plot area"] ?? null,
      bedrooms: intValues.Bedrooms ?? null,
      bathrooms: intValues.Bathrooms ?? null,
      balconies: intValues.Balconies ?? null,
      parking_spaces: intValues.Parking ?? null,
      floor_number: intValues.Floor ?? null,
      total_floors: intValues["Total floors"] ?? null,
      year_built: intValues["Year built"] ?? null,
      furnishing: (furnishing as string | null) ?? null,
      possession_status: (possession as string | null) ?? null,
      available_from: availableFrom,
      virtual_tour_url: tour || null,
      project_name: projectName || null,
      project_registration_number: get("Project registration number") || null,
      amenity_ids: [...new Set(amenityIds)],
      image_urls: imageUrls,
      videos,
    });
  });

  return { rows, errors };
}
