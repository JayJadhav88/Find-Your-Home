import { describe, expect, it } from "vitest";
import { formatArea, formatDateTime, formatPrice, zonedLocalToUtc } from "./format";

describe("formatPrice", () => {
  it("uses the configured locale and currency", () => {
    expect(formatPrice(250000, "EUR", { locale: "de-DE" })).toBe("250.000 €");
    expect(formatPrice(250000, "USD", { locale: "en-US" })).toBe("$250,000");
  });

  it("supports compact notation", () => {
    expect(formatPrice(1_500_000, "USD", { locale: "en-US" }, { compact: true })).toBe("$1.5M");
  });
});

describe("formatArea", () => {
  it("labels the unit", () => {
    expect(formatArea(1200, "sq_ft", { locale: "en-US" })).toBe("1,200 sq ft");
    expect(formatArea(85.5, "sq_m", { locale: "en-GB" })).toBe("85.5 m²");
  });
});

describe("formatDateTime", () => {
  it("renders in the configured time zone", () => {
    const value = "2026-01-15T12:00:00Z";
    expect(formatDateTime(value, { locale: "en-GB", timeZone: "UTC" })).toContain("12:00");
    expect(formatDateTime(value, { locale: "en-GB", timeZone: "Asia/Tokyo" })).toContain("21:00");
  });
});


describe("zonedLocalToUtc", () => {
  it("converts wall-clock times in a time zone to UTC", () => {
    expect(zonedLocalToUtc("2026-10-20T14:30", "UTC")).toBe("2026-10-20T14:30:00.000Z");
    expect(zonedLocalToUtc("2026-10-20T14:30", "Asia/Kolkata")).toBe("2026-10-20T09:00:00.000Z");
    expect(zonedLocalToUtc("2026-01-15T09:00", "America/New_York")).toBe("2026-01-15T14:00:00.000Z");
    expect(zonedLocalToUtc("2026-07-15T09:00", "America/New_York")).toBe("2026-07-15T13:00:00.000Z");
  });

  it("rejects malformed input", () => {
    expect(() => zonedLocalToUtc("tomorrow", "UTC")).toThrow(RangeError);
  });
});
