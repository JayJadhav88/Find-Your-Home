// The module imports Supabase and Expo modules; only the URL parser is under test.
jest.mock("../supabase", () => ({ supabase: {} }));
jest.mock("expo-linking", () => ({ createURL: () => "findyourhome://auth/callback" }));
jest.mock("expo-web-browser", () => ({}));

// eslint-disable-next-line import/first -- must load after the mocks above
import { authParamsFromUrl } from "../google";

describe("authParamsFromUrl", () => {
  it("reads tokens from the fragment (implicit flow)", () => {
    expect(authParamsFromUrl("findyourhome://auth/callback#access_token=a&refresh_token=r&expires_in=3600")).toMatchObject({
      access_token: "a",
      refresh_token: "r",
    });
  });

  it("reads a code or an error from the query", () => {
    expect(authParamsFromUrl("exp://192.168.1.100:8081/--/auth/callback?code=xyz")).toEqual({ code: "xyz" });
    expect(authParamsFromUrl("findyourhome://auth/callback?error=access_denied&error_description=Cancelled")).toMatchObject({
      error: "access_denied",
      error_description: "Cancelled",
    });
  });
});
