import { describe, expect, it } from "vitest";
import { formatArea, formatDateTime, formatPrice } from "./format";

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
