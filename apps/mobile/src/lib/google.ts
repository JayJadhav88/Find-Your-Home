// Google sign-in for the app: Supabase Auth opens Google in a secure browser sheet and
// returns to the app's own link (findyourhome://auth/callback, or exp://… in Expo Go).
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";

export const googleSignInEnabled = process.env.EXPO_PUBLIC_GOOGLE_SIGN_IN === "true";

export type GoogleResult = { ok: true } | { ok: false; cancelled: boolean; message: string };

/** Reads tokens or a code from the redirect (query or #fragment). */
export function authParamsFromUrl(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const [beforeHash, hash = ""] = url.split("#");
  const query = beforeHash?.split("?")[1] ?? "";
  for (const part of [query, hash]) {
    for (const [key, value] of new URLSearchParams(part)) params[key] = value;
  }
  return params;
}

export async function signInWithGoogle(): Promise<GoogleResult> {
  const redirectTo = Linking.createURL("auth/callback");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) return { ok: false, cancelled: false, message: "Google sign-in isn't available right now." };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return { ok: false, cancelled: true, message: "" };

  const params = authParamsFromUrl(result.url);
  if (params.error) return { ok: false, cancelled: false, message: params.error_description || "Google sign-in didn't finish." };
  const session = params.code
    ? await supabase.auth.exchangeCodeForSession(params.code)
    : params.access_token && params.refresh_token
      ? await supabase.auth.setSession({ access_token: params.access_token, refresh_token: params.refresh_token })
      : null;
  if (!session || session.error) return { ok: false, cancelled: false, message: "Google sign-in didn't finish. Please try again." };
  return { ok: true };
}
