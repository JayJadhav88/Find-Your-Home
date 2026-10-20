import { z } from "zod";

/**
 * Detects keys that must never be shipped to a browser or mobile bundle:
 * new-style Supabase secret keys and legacy JWTs carrying the service_role claim.
 */
export function looksLikeSecretKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3 || !parts[1]) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

const publishableKey = z
  .string()
  .min(20, "Supabase publishable (anon) key is missing or too short")
  .refine((key) => !looksLikeSecretKey(key), {
    message:
      "A Supabase SECRET / service-role key was supplied where a publishable (anon) key is expected. Never expose it to clients.",
  });

export const publicEnvSchema = z.object({
  supabaseUrl: z.url("Supabase URL must be a full URL, e.g. http://127.0.0.1:44321"),
  supabasePublishableKey: publishableKey,
  siteUrl: z.url("Site URL must be a full URL, e.g. http://localhost:3000"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Validates public (client-safe) configuration. Callers pass values explicitly
 * because Next.js and Expo only inline env vars that are referenced by name.
 */
export function parsePublicEnv(input: Record<keyof PublicEnv, string | undefined>): PublicEnv {
  const result = publicEnvSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid Find Your Home configuration:\n${details}\nSee .env.example for the required variables.`);
  }
  return result.data;
}
