import { describe, expect, it } from "vitest";
import {
  enquirySchema,
  fieldErrors,
  listingFormSchema,
  listingFormToRow,
  parseSearchParams,
  searchFiltersToQuery,
  searchFiltersToRpcArgs,
  signUpSchema,
} from "./schemas";

const uuid = "c0000000-0000-4000-8000-000000000003";

describe("signUpSchema", () => {
  it("enforces the password policy used by Supabase Auth", () => {
    const result = signUpSchema.safeParse({ displayName: "Sam", email: "Sam@Example.test", password: "short1" });
    expect(result.success).toBe(false);
    expect(fieldErrors(result.error!).password).toBe("Use at least 10 characters");
    expect(signUpSchema.parse({ displayName: "Sam", email: "Sam@Example.test", password: "longenough1" }).email).toBe(
      "sam@example.test",
    );
  });
});

describe("enquirySchema", () => {
  const base = { listingId: uuid, name: "Ana", email: "ana@example.test", message: "Hello", consent: "on" };

  it("accepts a plain enquiry", () => {
    expect(enquirySchema.parse(base).kind).toBe("enquiry");
  });

  it("requires a time for visit requests and consent", () => {
    const result = enquirySchema.safeParse({ ...base, kind: "visit_request", consent: undefined });
    const errors = fieldErrors(result.error!);
    expect(errors.visitAt).toBeDefined();
    expect(errors.consent).toBeDefined();
  });
});

describe("listingFormSchema", () => {
  const form = {
    title: "Sunny flat",
    purpose: "sale",
    priceAmount: "250000",
    currency: "USD",
    areaValue: "85",
    areaUnit: "sq_m",
    bedrooms: "2",
    amenityIds: [uuid],
    contactViaForm: "on",
    description: "",
    floorNumber: "",
  };

  it("coerces form strings and drops blanks", () => {
    const values = listingFormSchema.parse(form);
    expect(values.priceAmount).toBe(250000);
    expect(values.bedrooms).toBe(2);
    expect(values.floorNumber).toBeUndefined();
    expect(values.contactViaForm).toBe(true);
    expect(values.showEmail).toBe(false);
  });

  it("maps to database columns", () => {
    const row = listingFormToRow(listingFormSchema.parse(form));
    expect(row).toMatchObject({ price_amount: 250000, currency: "USD", area_unit: "sq_m", floor_number: null });
    expect(row).not.toHaveProperty("status");
    expect(row).not.toHaveProperty("owner_id");
  });

  it("needs a unit for areas, a currency for prices and https links", () => {
    const result = listingFormSchema.safeParse({
      ...form,
      areaUnit: "",
      currency: "",
      videoUrl: "http://example.test/video",
    });
    const errors = fieldErrors(result.error!);
    expect(errors.areaUnit).toBeDefined();
    expect(errors.currency).toBeDefined();
    expect(errors.videoUrl).toBe("Use a full https:// link");
  });
});

describe("search params", () => {
  it("parses a shareable URL and ignores junk", () => {
    const filters = parseSearchParams({
      purpose: "rent",
      minPrice: "500",
      beds: "abc",
      type: `${uuid},not-a-uuid`,
      sort: "cheapest",
      featured: "1",
    });
    expect(filters.purpose).toBe("rent");
    expect(filters.minPrice).toBe(500);
    expect(filters.beds).toBeUndefined();
    expect(filters.type).toBeUndefined();
    expect(filters.sort).toBe("newest");
    expect(filters.featured).toBe(true);
  });

  it("round-trips through the query string", () => {
    const filters = parseSearchParams({ q: "garden", purpose: "sale", type: uuid, sort: "price_asc", maxPrice: "300000" });
    expect(parseSearchParams(Object.fromEntries(new URLSearchParams(searchFiltersToQuery(filters))))).toEqual(filters);
    expect(searchFiltersToQuery(parseSearchParams({}))).toBe("");
  });

  it("uses the default currency when filtering by price", () => {
    const args = searchFiltersToRpcArgs(parseSearchParams({ minPrice: "100" }), { currency: "EUR" });
    expect(args.p_currency).toBe("EUR");
    expect(searchFiltersToRpcArgs(parseSearchParams({}), { currency: "EUR" }).p_currency).toBeUndefined();
  });
});
