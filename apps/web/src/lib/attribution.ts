// Reads where this visitor came from (set by proxy.ts from campaign, QR and referral links).
// Browser only.

export interface Attribution {
  source: "website" | "qr";
  utm: Record<string, string>;
}

export function readAttribution(): Attribution {
  let utm: Record<string, string> = {};
  try {
    const raw = document.cookie.split("; ").find((part) => part.startsWith("fyh_src="))?.slice("fyh_src=".length);
    if (raw) utm = JSON.parse(decodeURIComponent(raw)) as Record<string, string>;
  } catch {
    utm = {};
  }
  return { source: utm.utm_medium?.toLowerCase() === "qr" ? "qr" : "website", utm };
}
