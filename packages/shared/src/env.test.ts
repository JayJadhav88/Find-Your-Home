import { describe, expect, it } from "vitest";
import { looksLikeSecretKey, parsePublicEnv } from "./env";

function fakeJwt(payload: object): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`;
}

const valid = {
  supabaseUrl: "http://127.0.0.1:44321",
  supabasePublishableKey: "sb_publishable_0123456789abcdefghij",
  siteUrl: "http://localhost:3000",
};

describe("looksLikeSecretKey", () => {
  it("flags new-style secret keys", () => {
    expect(looksLikeSecretKey("sb_secret_abcdefghijklmnopqrstuvwxyz")).toBe(true);
  });

  it("flags legacy service_role JWTs", () => {
    expect(looksLikeSecretKey(fakeJwt({ role: "service_role" }))).toBe(true);
  });

  it("accepts publishable and anon keys", () => {
    expect(looksLikeSecretKey(valid.supabasePublishableKey)).toBe(false);
    expect(looksLikeSecretKey(fakeJwt({ role: "anon" }))).toBe(false);
  });
});

describe("parsePublicEnv", () => {
  it("returns validated config", () => {
    expect(parsePublicEnv(valid)).toEqual(valid);
  });

  it("rejects a missing URL with a readable message", () => {
    expect(() => parsePublicEnv({ ...valid, supabaseUrl: undefined })).toThrow(/supabaseUrl/);
  });

  it("refuses a secret key in client configuration", () => {
    expect(() =>
      parsePublicEnv({ ...valid, supabasePublishableKey: "sb_secret_abcdefghijklmnopqrstuvwxyz" }),
    ).toThrow(/SECRET/);
  });
});
