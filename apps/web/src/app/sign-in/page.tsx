import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/auth-shell";
import { GoogleSignInButton } from "@/components/google-button";
import { safeNext } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const NOTICES: Record<string, string> = {
  "link-expired": "That link has expired or was already used. Sign in, or request a new link.",
  google: "Google sign-in didn't finish. Try again, or sign in with your email.",
};

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <AuthShell title="Sign in" description="Save homes, send enquiries and manage your listings.">
      <Suspense>
        {searchParams.then((params) => {
          const next = safeNext(typeof params.next === "string" ? params.next : null);
          return (
            <div className="flex flex-col gap-4">
              <GoogleSignInButton next={next} />
              <SignInForm next={next} notice={typeof params.error === "string" ? NOTICES[params.error] : undefined} />
            </div>
          );
        })}
      </Suspense>
    </AuthShell>
  );
}
