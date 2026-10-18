import "server-only";
import type { Database } from "@fyh/shared";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { env } from "./env";

/**
 * Per-request client acting as the signed-in user (RLS applies). Reads cookies, so it
 * must only be used inside a <Suspense> boundary, a Server Action or a Route Handler.
 */
export async function createUserClient() {
  // Per-user data is always request-time. supabase-js reads the clock while loading the
  // session, which Next.js forbids during (runtime) prerendering of the shell.
  await connection();
  const cookieStore = await cookies();
  return createServerClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. proxy.ts refreshes
          // the session on every navigation, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * Cookie-less client for PUBLIC data (anon role). Safe inside "use cache" functions because
 * it never touches request data.
 */
export function createPublicClient() {
  return createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
