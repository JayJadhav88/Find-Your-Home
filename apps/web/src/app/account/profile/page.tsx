import { Suspense } from "react";
import { DataExportButton, DeleteAccountForm, ProfileForm } from "@/components/account-forms";
import { Loading } from "@/components/loading";
import { Card, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";

export default function ProfilePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Profile />
    </Suspense>
  );
}

async function Profile() {
  const viewer = await requireViewer("/account/profile");
  const supabase = await createUserClient();
  const [{ data: profile }, { data: requests }] = await Promise.all([
    supabase.from("profiles").select("display_name, phone, marketing_opt_in").eq("id", viewer.id).single(),
    supabase
      .from("data_requests")
      .select("kind, status, requested_at")
      .eq("user_id", viewer.id)
      .order("requested_at", { ascending: false }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Profile & privacy" />
      <Card>
        <h2 className="mb-4 text-lg font-semibold">Profile</h2>
        <ProfileForm
          displayName={profile?.display_name ?? ""}
          phone={profile?.phone ?? ""}
          marketingOptIn={profile?.marketing_opt_in ?? false}
        />
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Your data</h2>
        <p className="mt-1 text-sm text-text-muted">Request a copy of the personal data we hold about you.</p>
        <div className="mt-3">
          <DataExportButton />
        </div>
        {requests?.length ? (
          <ul className="mt-4 text-sm text-text-muted">
            {requests.map((request) => (
              <li key={`${request.kind}-${request.requested_at}`}>
                {request.kind === "export" ? "Data copy" : "Deletion"} requested {request.requested_at.slice(0, 10)} —{" "}
                {request.status.replace("_", " ")}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
      <Card className="border-danger/40">
        <h2 className="text-lg font-semibold">Delete account</h2>
        <p className="mt-1 text-sm text-text-muted">
          Your listings are taken offline and your personal data is removed, except records we must keep by law.
        </p>
        <div className="mt-3">
          <DeleteAccountForm />
        </div>
      </Card>
    </div>
  );
}
