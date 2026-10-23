import { timingSafeEqual } from "node:crypto";

/** Constant-time check of a secret sent by the Supabase functions (e.g. REVALIDATE_SECRET). */
export function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
