import { describe, expect, it, vi } from "vitest";
import {
  base64UrlDecode,
  base64UrlEncode,
  encryptPayload,
  generateVapidKeys,
  hkdf,
  isAllowedPushEndpoint,
  sendWebPush,
  vapidAuthorization,
  type WebPushSubscription,
} from "./web-push";

const encoder = new TextEncoder();

/** A browser's side: key pair + auth secret, and the decryption a browser performs. */
async function fakeBrowser() {
  const keys = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const subscription: WebPushSubscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
    p256dh: base64UrlEncode(publicKey),
    auth: base64UrlEncode(auth),
  };

  async function decrypt(body: Uint8Array<ArrayBuffer>): Promise<string> {
    const salt = body.slice(0, 16);
    const recordSize = new DataView(body.buffer, body.byteOffset).getUint32(16);
    const idLength = body[20]!;
    const senderPublic = body.slice(21, 21 + idLength);
    const ciphertext = body.slice(21 + idLength);
    expect(recordSize).toBe(4096);

    const senderKey = await crypto.subtle.importKey("raw", senderPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: senderKey }, keys.privateKey, 256));
    const info = new Uint8Array([...encoder.encode("WebPush: info\0"), ...publicKey, ...senderPublic]);
    const ikm = await hkdf(auth, shared, info, 32);
    const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
    const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);
    const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext));
    expect(plain[plain.length - 1]).toBe(2); // last-record delimiter
    return new TextDecoder().decode(plain.slice(0, -1));
  }

  return { subscription, decrypt };
}

describe("web push encryption", () => {
  it("produces a message the browser can decrypt", async () => {
    const browser = await fakeBrowser();
    const payload = JSON.stringify({ title: "Your listing is live", body: "Sunny flat", url: "/account/listings/1" });
    const body = await encryptPayload(browser.subscription, payload);
    expect(await browser.decrypt(body)).toBe(payload);
  });

  it("uses a fresh key and salt for every message", async () => {
    const browser = await fakeBrowser();
    const first = await encryptPayload(browser.subscription, "hello");
    const second = await encryptPayload(browser.subscription, "hello");
    expect(base64UrlEncode(first)).not.toBe(base64UrlEncode(second));
  });

  it("rejects oversized payloads and broken subscriptions", async () => {
    const browser = await fakeBrowser();
    await expect(encryptPayload(browser.subscription, "x".repeat(5000))).rejects.toThrow(/too large/);
    await expect(encryptPayload({ ...browser.subscription, auth: "abc" }, "hi")).rejects.toThrow(/auth/);
  });
});

describe("VAPID", () => {
  it("signs a token the push service can verify", async () => {
    const keys = await generateVapidKeys("mailto:ops@example.test");
    const header = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", keys, Date.UTC(2026, 9, 18));
    const match = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
    expect(match).not.toBeNull();
    const [, head, claims, signature, publicKey] = match!;
    expect(publicKey).toBe(keys.publicKey);
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(claims!)))).toMatchObject({
      aud: "https://fcm.googleapis.com",
      sub: "mailto:ops@example.test",
    });

    const verifyKey = await crypto.subtle.importKey("raw", base64UrlDecode(keys.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      verifyKey,
      base64UrlDecode(signature!),
      encoder.encode(`${head}.${claims}`),
    );
    expect(valid).toBe(true);
  });
});

describe("sendWebPush", () => {
  it("only talks to known push services", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/x")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://db5p.notify.windows.com/w/?token=x")).toBe(true);
    expect(isAllowedPushEndpoint("https://evil.example/fcm.googleapis.com")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.example/x")).toBe(false);
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
  });

  it("reports expired subscriptions so they can be removed", async () => {
    const browser = await fakeBrowser();
    const keys = await generateVapidKeys("mailto:ops@example.test");
    const fetchImpl = vi.fn(async () => new Response("gone", { status: 410 }));
    const result = await sendWebPush(browser.subscription, "hi", keys, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toMatchObject({ ok: false, gone: true, retryable: false });
  });

  it("sends encrypted content with VAPID headers", async () => {
    const browser = await fakeBrowser();
    const keys = await generateVapidKeys("mailto:ops@example.test");
    let seen: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      seen = init;
      return new Response(null, { status: 201 });
    });
    const result = await sendWebPush(browser.subscription, "hello", keys, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual({ ok: true });
    const headers = seen!.headers as Record<string, string>;
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers.Authorization).toMatch(/^vapid t=/);
    expect(await browser.decrypt(seen!.body as Uint8Array<ArrayBuffer>)).toBe("hello");
  });

  it("retries on rate limits and server errors only", async () => {
    const browser = await fakeBrowser();
    const keys = await generateVapidKeys("mailto:ops@example.test");
    const respond = (status: number) => vi.fn(async () => new Response("", { status })) as unknown as typeof fetch;
    expect(await sendWebPush(browser.subscription, "x", keys, { fetchImpl: respond(429) })).toMatchObject({ retryable: true });
    expect(await sendWebPush(browser.subscription, "x", keys, { fetchImpl: respond(503) })).toMatchObject({ retryable: true });
    expect(await sendWebPush(browser.subscription, "x", keys, { fetchImpl: respond(400) })).toMatchObject({ retryable: false, gone: false });
  });
});
