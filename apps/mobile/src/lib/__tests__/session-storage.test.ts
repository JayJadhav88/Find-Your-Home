// In-memory stand-ins for the device stores.
const mockSecure = new Map<string, string>();
const mockPlain = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  setItemAsync: async (key: string, value: string) => void mockSecure.set(key, value),
  getItemAsync: async (key: string) => mockSecure.get(key) ?? null,
  deleteItemAsync: async (key: string) => void mockSecure.delete(key),
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    setItem: async (key: string, value: string) => void mockPlain.set(key, value),
    getItem: async (key: string) => mockPlain.get(key) ?? null,
    removeItem: async (key: string) => void mockPlain.delete(key),
  },
}));
jest.mock("expo-crypto", () => ({ getRandomBytes: (size: number) => new Uint8Array(require("node:crypto").randomBytes(size)) }));

import { sessionStorage } from "../session-storage";

const SESSION = JSON.stringify({ access_token: "secret-access-token", refresh_token: "secret-refresh-token", user: { email: "a@example.test" } });

describe("encrypted session storage", () => {
  beforeEach(() => {
    mockSecure.clear();
    mockPlain.clear();
  });

  it("round-trips a session", async () => {
    await sessionStorage.setItem("sb-auth-token", SESSION);
    expect(await sessionStorage.getItem("sb-auth-token")).toBe(SESSION);
  });

  it("never stores the session as readable text", async () => {
    await sessionStorage.setItem("sb-auth-token", SESSION);
    const stored = mockPlain.get("sb-auth-token")!;
    expect(stored).not.toContain("secret-access-token");
    expect(stored).toMatch(/^[0-9a-f]+$/);
    // The key lives only in the secure store (with a sanitised key name).
    expect([...mockSecure.keys()]).toEqual(["sb-auth-token"]);
  });

  it("uses a fresh key each time it saves", async () => {
    await sessionStorage.setItem("sb-auth-token", SESSION);
    const first = mockPlain.get("sb-auth-token");
    await sessionStorage.setItem("sb-auth-token", SESSION);
    expect(mockPlain.get("sb-auth-token")).not.toBe(first);
  });

  it("returns nothing when the key is missing (e.g. after reinstall)", async () => {
    await sessionStorage.setItem("sb-auth-token", SESSION);
    mockSecure.clear();
    expect(await sessionStorage.getItem("sb-auth-token")).toBeNull();
  });

  it("removes both parts on sign-out", async () => {
    await sessionStorage.setItem("sb-auth-token", SESSION);
    await sessionStorage.removeItem("sb-auth-token");
    expect(mockPlain.size + mockSecure.size).toBe(0);
  });
});
