import type { Metadata } from "next";
import { Suspense } from "react";
import { SignUpForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/auth-shell";
import { safeNext } from "@/lib/auth";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  return (
    <AuthShell title="Create an account" description="Free for buyers, renters and property owners.">
      <Suspense>
        {searchParams.then((params) => (
          <SignUpForm next={safeNext(typeof params.next === "string" ? params.next : null)} />
        ))}
      </Suspense>
    </AuthShell>
  );
}
