import { CATEGORY_BADGE, displayPrice, roomsLine } from "../format";

describe("display helpers", () => {
  it("formats prices with the listing currency and period", () => {
    expect(displayPrice({ price_amount: 1200, currency: "USD", price_period: "per_month", price_display: "show" }, "en-US")).toBe("$1,200 / month");
    expect(displayPrice({ price_amount: 1200, currency: "USD", price_period: "total", price_display: "on_request" }, "en-US")).toBe("Price on request");
  });

  it("summarises rooms and area", () => {
    expect(roomsLine({ bedrooms: 0, bathrooms: 1, area_value: 34, area_unit: "sq_m" }, "en-GB")).toBe("Studio · 1 bath · 34 m²");
  });

  it("labels all three categories", () => {
    expect(CATEGORY_BADGE).toEqual({ rental: "For rent", resale: "Resale", new_project: "New project" });
  });
});
