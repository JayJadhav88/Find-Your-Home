import { parsePublicEnv } from "@fyh/shared";

// Next.js only inlines env vars referenced by their full name, so list them explicitly.
export const env = parsePublicEnv({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
});

export function absoluteUrl(path: string): string {
  return new URL(path, env.siteUrl).toString();
}
