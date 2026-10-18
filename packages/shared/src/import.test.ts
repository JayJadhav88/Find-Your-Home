import { describe, expect, it } from "vitest";
import { IMPORT_COLUMNS, mapHeaders, prepareImportRows, type ImportTaxonomy } from "./import";

const taxonomy: ImportTaxonomy = {
  propertyTypes: [{ id: "t-apt", name: "Apartment", slug: "apartment" }],
  amenities: [
    { id: "a-park", name: "Parking", slug: "parking" },
    { id: "a-lift", name: "Lift / Elevator", slug: "lift" },
  ],
  locations: [
    { id: "c-1", parent_id: null, level: "country", name: "Demo Country", slug: "demo-country" },
    { id: "r-1", parent_id: "c-1", level: "region", name: "Demo Region", slug: "demo-region" },
    { id: "ci-1", parent_id: "r-1", level: "city", name: "Sampleton", slug: "sampleton" },
    { id: "l-1", parent_id: "ci-1", level: "locality", name: "Old Town (demo)", slug: "old-town-demo" },
  ],
  currencies: [{ code: "USD" }],
};

const good = {
  Category: "Resale",
  Title: "Bright flat",
  "Property type": "apartment",
  Price: "2,50,000",
  Currency: "usd",
  Country: "demo country",
  City: "Sampleton",
  Locality: "Old Town (demo)",
  Area: 85,
  "Area unit": "sqft",
  Bedrooms: 2,
  Amenities: "Parking, lift / elevator",
  "Image URLs": "https://img.example.test/1.jpg\nhttps://img.example.test/2.jpg",
  "Video URLs": "https://youtu.be/dQw4w9WgXcQ, https://www.instagram.com/reel/C1a2B3c4D5e/",
  "Available from": new Date(Date.UTC(2027, 0, 15)),
};

describe("mapHeaders", () => {
  it("matches headers regardless of case and spacing and reports problems", () => {
    const result = mapHeaders(["category", " TITLE ", "Image urls", "Colour"]);
    expect(result.indexByHeader.get("Title")).toBe(1);
    expect(result.indexByHeader.get("Image URLs")).toBe(2);
    expect(result.unknown).toEqual(["Colour"]);
    expect(result.missingRequired).toEqual([]);
    expect(mapHeaders(["Title"]).missingRequired).toEqual(["Category"]);
  });

  it("has exactly one required category and title column", () => {
    expect(IMPORT_COLUMNS.filter((column) => column.required).map((column) => column.header)).toEqual(["Category", "Title"]);
  });
});

describe("prepareImportRows", () => {
  it("resolves names to ids and parses values", () => {
    const { rows, errors } = prepareImportRows([good], taxonomy);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      row_number: 2,
      category: "resale",
      property_type_id: "t-apt",
      price_amount: 250000,
      currency: "USD",
      price_period: "total",
      country_id: "c-1",
      city_id: "ci-1",
      locality_id: "l-1",
      area_unit: "sq_ft",
      area_value: 85,
      bedrooms: 2,
      amenity_ids: ["a-park", "a-lift"],
      image_urls: ["https://img.example.test/1.jpg", "https://img.example.test/2.jpg"],
      available_from: "2027-01-15",
    });
    expect(rows[0]!.videos).toEqual([
      { provider: "youtube", video_id: "dQw4w9WgXcQ", instagram_kind: null },
      { provider: "instagram", video_id: "C1a2B3c4D5e", instagram_kind: "reel" },
    ]);
  });

  it("defaults rentals to a monthly price and accepts Excel date serials", () => {
    const { rows } = prepareImportRows([{ ...good, Category: "rent", "Available from": 46402 }], taxonomy);
    expect(rows[0]!.category).toBe("rental");
    expect(rows[0]!.price_period).toBe("per_month");
    expect(rows[0]!.available_from).toBe("2027-01-15");
  });

  it("collects every problem in a row with the spreadsheet row number", () => {
    const { rows, errors } = prepareImportRows(
      [
        good,
        {
          Category: "Villa",
          Title: "x",
          Price: "lots",
          Currency: "EUR",
          City: "Nowhere",
          Area: "85",
          "Video URLs": "https://vimeo.com/1",
          "Image URLs": "ftp://files.example.test/a.jpg",
          Amenities: "Helipad",
        },
      ],
      taxonomy,
    );
    expect(rows).toHaveLength(1);
    expect(errors[0]!.row_number).toBe(3);
    expect(errors[0]!.messages).toEqual(
      expect.arrayContaining([
        'Category "Villa" is not Rental, Resale or New project',
        "Title must be 3–140 characters",
        'Price "lots" is not a number',
        'Currency "EUR" is not enabled',
        'City "Nowhere" was not found (set Country first)',
        "Area unit is required when an area is given",
        'Amenity "Helipad" is not in the admin list',
        'Image link "ftp://files.example.test/a.jpg" is not a web address',
        'Video link "https://vimeo.com/1" is not a YouTube or Instagram video',
      ]),
    );
  });

  it("requires a project name for new projects and skips blank lines", () => {
    const { rows, errors } = prepareImportRows([{ ...good, Category: "New project" }, {}], taxonomy);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.messages).toContain("Project name is required for New project");
  });
});
