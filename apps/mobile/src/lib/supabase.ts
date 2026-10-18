import { parsePublicEnv, type Database } from "@fyh/shared";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { sessionStorage } from "./session-storage";

// EXPO_PUBLIC_ variables are inlined at build time and must be referenced by full name.
// Only the publishable key ships in the app; the validator refuses a secret key.
export const env = parsePublicEnv({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  siteUrl: process.env.EXPO_PUBLIC_SITE_URL,
});

export const supabase = createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
  auth: {
    storage: sessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === "web",
  },
});

// Refresh tokens only while the app is in the foreground.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
