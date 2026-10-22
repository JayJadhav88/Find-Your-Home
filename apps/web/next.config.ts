import type { NextConfig } from "next";

// Listing photos are served from the Supabase "listing-public" bucket.
const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:44321");
const isLocalSupabase = ["127.0.0.1", "localhost"].includes(supabaseUrl.hostname);

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Room for HTML pages written in Admin → Pages (up to 500,000 characters).
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  transpilePackages: ["@fyh/shared"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: supabaseUrl.protocol.replace(":", "") as "http" | "https",
        hostname: supabaseUrl.hostname,
        port: supabaseUrl.port,
        pathname: "/storage/v1/object/public/listing-public/**",
      },
    ],
    // Only allowed when the configured Supabase itself is on this machine (local stack,
    // including `next start` previews). A deployed site points at a public Supabase URL.
    dangerouslyAllowLocalIP: isLocalSupabase,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // The team's HTML pages may be shown inside the site's own pages (never other sites).
        // Their sandbox and policy are set by the route itself (src/app/pages/[slug]/raw).
        source: "/pages/:slug/raw",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        // Browser notification service worker: always fresh, same-origin scripts only.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
