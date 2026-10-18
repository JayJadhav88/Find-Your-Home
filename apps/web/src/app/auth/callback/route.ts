import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { safeNext } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";

// Landing point for links in Supabase Auth emails (sign-up confirmation, password reset) and
// for Google sign-in. Supports the PKCE `code` flow and the `token_hash` flow.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const supabase = await createUserClient();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  // Google sends ?error=… when the person cancels or the provider is not set up.
  const failure = url.searchParams.has("error") ? "/sign-in?error=google" : "/sign-in?error=link-expired";
  const target = new URL(ok ? next : failure, url.origin);
  return NextResponse.redirect(target);
}
