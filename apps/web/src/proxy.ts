import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// Refreshes the Supabase session cookie once per navigation and does an optimistic
// redirect for signed-out visitors on private areas. Real authorization happens in pages,
// Server Actions and the database (RLS) — never rely on this alone.

const PRIVATE_PREFIXES = ["/account", "/admin"];

// Where a visitor came from (campaign links, QR codes, referral codes). First touch wins for
// 30 days; the enquiry and contact forms attach it to the lead. Not personal data.
const ATTRIBUTION_COOKIE = "fyh_src";
const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "ref"] as const;

function attributionFrom(request: NextRequest): string | null {
  if (request.cookies.has(ATTRIBUTION_COOKIE)) return null;
  const found: Record<string, string> = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = request.nextUrl.searchParams.get(key)?.trim();
    if (value) found[key] = value.replace(/[^\w .:/@+-]/g, "").slice(0, 100);
  }
  return Object.keys(found).length ? JSON.stringify(found) : null;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const { pathname, search } = request.nextUrl;

  if (!data?.claims && PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const attribution = attributionFrom(request);
  if (attribution) {
    response.cookies.set(ATTRIBUTION_COOKIE, attribution, { maxAge: 60 * 60 * 24 * 30, sameSite: "lax", path: "/" });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|webp|svg|ico)$).*)"],
};
