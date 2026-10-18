import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/auth-shell";
import { safeNext } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const NOTICES: Record<string, string> = {
  "link-expired": "That link has expired or was already used. Sign in, or request a new link.",
};

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <AuthShell title="Sign in" description="Save homes, send enquiries and manage your listings.">
      <Suspense>
        {searchParams.then((params) => (
          <SignInForm
            next={safeNext(typeof params.next === "string" ? params.next : null)}
            notice={typeof params.error === "string" ? NOTICES[params.error] : undefined}
          />
        ))}
      </Suspense>
    </AuthShell>
  );
}
