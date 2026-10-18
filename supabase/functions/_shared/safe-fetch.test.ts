import { describe, expect, it, vi } from "vitest";
import { checkUrl, isPrivateAddress, safeFetch, UnsafeUrlError } from "./safe-fetch";

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "999.1.1.1"])(
    "%s is private",
    (address) => expect(isPrivateAddress(address)).toBe(true),
  );
  it.each(["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700::1111"])("%s is public", (address) =>
    expect(isPrivateAddress(address)).toBe(false),
  );
});

describe("checkUrl", () => {
  const strict = {};
  it.each([
    ["http://images.example.com/a.jpg", "Only https"],
    ["https://localhost/a.jpg", "local or internal"],
    ["https://db.internal/a.jpg", "local or internal"],
    ["https://metadata/a.jpg", "local or internal"],
    ["https://127.0.0.1/a.jpg", "private network"],
    ["https://169.254.169.254/latest/meta-data", "private network"],
    ["https://user:pass@images.example.com/a.jpg", "credentials"],
    ["file:///etc/passwd", "Only https"],
  ])("blocks %s", (url, message) => {
    expect(() => checkUrl(url, strict)).toThrow(message);
  });

  it("allows public https links", () => {
    expect(checkUrl("https://images.example.com/a.jpg", strict).hostname).toBe("images.example.com");
  });

  it("allows configured development hosts", () => {
    expect(checkUrl("http://host.docker.internal:3000/a.jpg", { allowHttp: true, allowedPrivateHosts: ["host.docker.internal"] }).port).toBe("3000");
  });
});

describe("safeFetch", () => {
  const publicDns = async () => ["93.184.216.34"];

  it("downloads within the size limit", async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }));
    const result = await safeFetch("https://images.example.com/a.jpg", { maxBytes: 10, resolve: publicDns, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect([...result.bytes]).toEqual([1, 2, 3]);
  });

  it("refuses hosts that resolve to private addresses", async () => {
    await expect(
      safeFetch("https://evil.example.com/a.jpg", { maxBytes: 10, resolve: async () => ["10.0.0.5"], fetchImpl: vi.fn() as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("re-checks every redirect target", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://127.0.0.1/secret" } }));
    await expect(
      safeFetch("https://images.example.com/a.jpg", { maxBytes: 10, resolve: publicDns, fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow("private network");
  });

  it("stops oversized downloads", async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array(50)));
    await expect(
      safeFetch("https://images.example.com/a.jpg", { maxBytes: 10, resolve: publicDns, fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow("larger than the allowed size");
  });
});
