import { tokens } from "@fyh/shared";
import type { MetadataRoute } from "next";
import { getSiteSettings } from "@/lib/public-data";

// Lets people add the site to their home screen. On iPhone, browser notifications only work
// for sites opened from the Home Screen, which needs this manifest.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getSiteSettings();
  return {
    name: settings.brand_name,
    short_name: settings.brand_name.slice(0, 12),
    start_url: "/",
    display: "standalone",
    background_color: tokens.colors.surface,
    theme_color: tokens.colors.brand,
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
    ],
  };
}
