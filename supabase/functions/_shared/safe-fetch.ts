// Downloads files from user-supplied links (spreadsheet image URLs) without letting the
// worker be pointed at internal services (SSRF). Pure checks are exported for unit tests.

export class UnsafeUrlError extends Error {}

export interface SafeFetchOptions {
  maxBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Local development only: allow http:// links. */
  allowHttp?: boolean;
  /** Local development only: hostnames allowed even though they resolve to private addresses. */
  allowedPrivateHosts?: string[];
  /** DNS lookup; defaults to Deno.resolveDns when available. */
  resolve?: (hostname: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
}

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "").toLowerCase();
  if (ip.includes(":")) {
    if (ip === "::" || ip === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(ip) || ip.startsWith("64:ff9b:") || ip.startsWith("2001:db8");
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Validates scheme and host before any network access. */
export function checkUrl(raw: string, options: Pick<SafeFetchOptions, "allowHttp" | "allowedPrivateHosts">): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Not a valid link");
  }
  if (url.protocol !== "https:" && !(options.allowHttp && url.protocol === "http:")) {
    throw new UnsafeUrlError("Only https:// links are allowed");
  }
  if (url.username || url.password) throw new UnsafeUrlError("Links with credentials are not allowed");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (options.allowedPrivateHosts?.includes(host)) return url;
  if (host === "localhost" || /\.(localhost|local|internal|lan|home|corp)$/.test(host) || !host.includes(".")) {
    throw new UnsafeUrlError("Links to local or internal hosts are not allowed");
  }
  if ((IPV4.test(host) || host.startsWith("[")) && isPrivateAddress(host)) {
    throw new UnsafeUrlError("Links to private network addresses are not allowed");
  }
  return url;
}

async function defaultResolve(hostname: string): Promise<string[]> {
  // deno-lint-ignore no-explicit-any
  const deno = (globalThis as any).Deno;
  if (!deno?.resolveDns) return [];
  const results = await Promise.allSettled([deno.resolveDns(hostname, "A"), deno.resolveDns(hostname, "AAAA")]);
  return results.flatMap((result) => (result.status === "fulfilled" ? (result.value as string[]) : []));
}

export async function safeFetch(raw: string, options: SafeFetchOptions): Promise<{ bytes: Uint8Array; contentType: string | null; finalUrl: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const resolve = options.resolve ?? defaultResolve;
  let current = raw;

  for (let redirect = 0; redirect <= (options.maxRedirects ?? 3); redirect++) {
    const url = checkUrl(current, options);
    const host = url.hostname.toLowerCase();
    if (!options.allowedPrivateHosts?.includes(host) && !IPV4.test(host)) {
      const addresses = await resolve(host);
      if (addresses.some(isPrivateAddress)) throw new UnsafeUrlError("Link resolves to a private network address");
    }

    const response = await fetchImpl(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
      headers: { Accept: "image/jpeg,image/png,image/webp,*/*;q=0.1" },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error(`Redirect without a location (HTTP ${response.status})`);
      current = new URL(location, url).toString();
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Download failed (HTTP ${response.status})`);
    }

    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > options.maxBytes) {
      await response.body?.cancel();
      throw new Error("File is larger than the allowed size");
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty response");
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > options.maxBytes) {
        await reader.cancel();
        throw new Error("File is larger than the allowed size");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return { bytes, contentType: response.headers.get("content-type"), finalUrl: url.toString() };
  }
  throw new UnsafeUrlError("Too many redirects");
}
