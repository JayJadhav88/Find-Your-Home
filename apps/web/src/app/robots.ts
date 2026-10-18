import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/account", "/admin", "/auth", "/sign-in", "/sign-up", "/reset-password", "/forgot-password", "/search?"] }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
