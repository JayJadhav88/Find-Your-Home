import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/auth-shell";
import { Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <AuthShell title="Choose a new password">
      <Suspense>
        {searchParams.then((params) =>
          params.required === "1" ? (
            <div className="mb-4">
              <Alert tone="warning" title="Choose your own password first">
                You signed in with a one-time password. Set a new password to continue; the one-time password stops working.
              </Alert>
            </div>
          ) : null,
        )}
      </Suspense>
      <ResetPasswordForm />
    </AuthShell>
  );
}
