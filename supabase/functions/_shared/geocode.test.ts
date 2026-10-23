import { describe, expect, it, vi } from "vitest";
import { countryFromLocale, geocode, placeQuery } from "./geocode";

const respond = (status: number, body: unknown) =>
  vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & {
    mock: { calls: Array<[string, RequestInit]> };
  };

describe("geocode", () => {
  it("asks OpenStreetMap with an identifying User-Agent and returns the first match", async () => {
    const fetchImpl = respond(200, [{ lat: "18.5590", lon: "73.7868", display_name: "Baner, Pune, Maharashtra, India" }]);
    const place = await geocode("Baner, Pune", { userAgent: "FindYourHome/1.0 (ops@example.test)", countryCode: "IN", fetchImpl });
    expect(place).toEqual({ lat: 18.559, lng: 73.7868, label: "Baner, Pune, Maharashtra, India" });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toContain("countrycodes=in");
    expect(url).toContain("q=Baner%2C+Pune");
    expect((init.headers as Record<string, string>)["User-Agent"]).toContain("FindYourHome");
  });

  it("returns nothing for no match or bad data", async () => {
    expect(await geocode("Nowhere", { userAgent: "x", fetchImpl: respond(200, []) })).toBeNull();
    expect(await geocode("Odd", { userAgent: "x", fetchImpl: respond(200, [{ lat: "999", lon: "1" }]) })).toBeNull();
    expect(await geocode("a", { userAgent: "x", fetchImpl: respond(200, []) })).toBeNull();
  });

  it("treats rate limiting as temporary so the job is retried later", async () => {
    await expect(geocode("Pune", { userAgent: "x", fetchImpl: respond(429, {}) })).rejects.toThrow(/busy/);
  });

  it("reports a refusal as an error, so it is not cached as 'no such place'", async () => {
    await expect(geocode("Pune", { userAgent: "x", fetchImpl: respond(403, {}) })).rejects.toThrow(/refused.*403/);
  });

  it("builds queries from the parts that are present", () => {
    expect(placeQuery(["Near City Mall", null, "Pune", "", "411045", "IN"])).toBe("Near City Mall, Pune, 411045, IN");
    expect(placeQuery(["Line\nbreak"])).toBe("Line break");
  });

  it("reads the country from a locale", () => {
    expect(countryFromLocale("en-IN")).toBe("in");
    expect(countryFromLocale("en")).toBeNull();
  });
});
