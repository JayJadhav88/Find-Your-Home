import type { Metadata } from "next";
import { Suspense } from "react";
import { SignUpForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/auth-shell";
import { GoogleSignInButton } from "@/components/google-button";
import { PhoneSignIn } from "@/components/phone-sign-in";
import { safeNext } from "@/lib/auth";
import { getIntegrationFlags } from "@/lib/public-data";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  return (
    <AuthShell title="Create an account" description="Free for buyers, renters and property owners.">
      <Suspense>
        {Promise.all([searchParams, getIntegrationFlags()]).then(([params, flags]) => {
          const next = safeNext(typeof params.next === "string" ? params.next : null);
          return (
            <div className="flex flex-col gap-4">
              <GoogleSignInButton next={next} />
              {flags.otp_sign_in ? <PhoneSignIn next={next} /> : null}
              <SignUpForm next={next} />
            </div>
          );
        })}
      </Suspense>
    </AuthShell>
  );
}
