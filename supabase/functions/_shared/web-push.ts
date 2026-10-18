// Web Push (browser notifications) with only WebCrypto and fetch, so it runs in the Deno
// Edge Runtime and in Vitest. Implements message encryption (RFC 8291, aes128gcm) and
// VAPID sender identification (RFC 8292).

export interface WebPushSubscription {
  endpoint: string;
  /** Browser's public key, base64url (65-byte uncompressed P-256 point). */
  p256dh: string;
  /** Browser's auth secret, base64url (16 bytes). */
  auth: string;
}

export interface VapidKeys {
  /** base64url, 65-byte uncompressed P-256 point. Also given to browsers when subscribing. */
  publicKey: string;
  /** base64url, 32-byte private scalar. Secret. */
  privateKey: string;
  /** "mailto:you@example.com" or an https URL, so push services can contact the sender. */
  subject: string;
}

export type WebPushResult =
  | { ok: true }
  | { ok: false; gone: boolean; retryable: boolean; error: string };

/** Push services only; anything else is refused before a request is made. */
const PUSH_HOST = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com)$/;

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && url.port === "" && PUSH_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------
const encoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

// ---------------------------------------------------------------------------
// VAPID
// ---------------------------------------------------------------------------
async function vapidPrivateKey(keys: VapidKeys): Promise<CryptoKey> {
  const point = base64UrlDecode(keys.publicKey);
  if (point.length !== 65 || point[0] !== 4) throw new Error("VAPID public key must be an uncompressed P-256 point");
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: keys.privateKey,
      x: base64UrlEncode(point.slice(1, 33)),
      y: base64UrlEncode(point.slice(33, 65)),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** Authorization header value for one push service origin. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, now = Date.now()): Promise<string> {
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(
    encoder.encode(
      JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await vapidPrivateKey(keys), encoder.encode(unsigned)),
  );
  return `vapid t=${unsigned}.${base64UrlEncode(signature)}, k=${keys.publicKey}`;
}

export async function generateVapidKeys(subject: string): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { publicKey: base64UrlEncode(publicKey), privateKey: jwk.d!, subject };
}

// ---------------------------------------------------------------------------
// Encryption (aes128gcm, single record)
// ---------------------------------------------------------------------------
const RECORD_SIZE = 4096;

export async function encryptPayload(
  subscription: WebPushSubscription,
  payload: string,
  // Injectable for tests.
  random: { salt?: Uint8Array<ArrayBuffer>; senderKeys?: CryptoKeyPair } = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const receiverPublic = base64UrlDecode(subscription.p256dh);
  const authSecret = base64UrlDecode(subscription.auth);
  if (receiverPublic.length !== 65) throw new Error("Invalid subscription key");
  if (authSecret.length !== 16) throw new Error("Invalid subscription auth secret");

  const sender =
    random.senderKeys ??
    ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const senderPublic = new Uint8Array(await crypto.subtle.exportKey("raw", sender.publicKey));
  const receiverKey = await crypto.subtle.importKey("raw", receiverPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: receiverKey }, sender.privateKey, 256));

  const ikm = await hkdf(authSecret, sharedSecret, concat(encoder.encode("WebPush: info\0"), receiverPublic, senderPublic), 32);
  const salt = random.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  const plaintext = concat(encoder.encode(payload), new Uint8Array([2]));
  if (plaintext.length + 16 + 86 > RECORD_SIZE) throw new Error("Push payload is too large");
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plaintext));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = senderPublic.length;
  return concat(header, senderPublic, ciphertext);
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------
export async function sendWebPush(
  subscription: WebPushSubscription,
  payload: string,
  keys: VapidKeys,
  options: { ttlSeconds?: number; urgency?: "low" | "normal" | "high"; fetchImpl?: typeof fetch } = {},
): Promise<WebPushResult> {
  if (!isAllowedPushEndpoint(subscription.endpoint)) {
    return { ok: false, gone: true, retryable: false, error: "Endpoint is not a known push service" };
  }
  let body: Uint8Array<ArrayBuffer>;
  try {
    body = await encryptPayload(subscription, payload);
  } catch (error) {
    return { ok: false, gone: true, retryable: false, error: `Bad subscription: ${(error as Error).message}` };
  }

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(subscription.endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: await vapidAuthorization(subscription.endpoint, keys),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(options.ttlSeconds ?? 86400),
        Urgency: options.urgency ?? "normal",
      },
      body,
    });
  } catch (error) {
    return { ok: false, gone: false, retryable: true, error: `Network error: ${(error as Error).message}` };
  }

  if (response.status >= 200 && response.status < 300) return { ok: true };
  const detail = (await response.text().catch(() => "")).slice(0, 300);
  const gone = response.status === 404 || response.status === 410;
  const retryable = response.status === 429 || response.status >= 500;
  return { ok: false, gone, retryable, error: `Push service ${response.status}${detail ? `: ${detail}` : ""}` };
}
