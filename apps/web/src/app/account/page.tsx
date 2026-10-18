import { Suspense } from "react";
import { BecomeOwnerButton } from "@/components/account-forms";
import { Loading } from "@/components/loading";
import { Alert, ButtonLink, Card, PageHeader } from "@/components/ui";
import { canList, isStaff, requireViewer } from "@/lib/auth";
import { getSiteSettings } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

const NOTICES: Record<string, string> = {
  "password-updated": "Your password has been changed.",
};

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <Suspense fallback={<Loading />}>
      {searchParams.then((params) => (
        <Overview
          notice={typeof params.notice === "string" ? NOTICES[params.notice] : undefined}
          denied={params.denied === "admin"}
        />
      ))}
    </Suspense>
  );
}

async function Overview({ notice, denied }: { notice?: string; denied: boolean }) {
  const viewer = await requireViewer("/account");
  const supabase = await createUserClient();
  const settings = await getSiteSettings();
  const [listings, favorites, enquiries] = await Promise.all([
    supabase.from("listings").select("status").eq("owner_id", viewer.id),
    supabase.from("favorites").select("listing_id", { count: "exact", head: true }).eq("user_id", viewer.id),
    supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("sender_user_id", viewer.id),
  ]);
  const byStatus = (status: string) => (listings.data ?? []).filter((row) => row.status === status).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Hello, ${viewer.displayName}`} description={viewer.email} />
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {denied ? <Alert tone="warning">That area is for moderators and administrators.</Alert> : null}
      {viewer.status === "deletion_requested" ? (
        <Alert tone="warning" title="Account deletion requested">
          We are processing your request. Contact us if you changed your mind.
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-text-muted">Saved homes</p>
          <p className="text-2xl font-semibold">{favorites.count ?? 0}</p>
          <ButtonLink href="/account/favorites" variant="ghost" className="mt-2 px-0">
            View saved
          </ButtonLink>
        </Card>
        <Card>
          <p className="text-sm text-text-muted">Enquiries sent</p>
          <p className="text-2xl font-semibold">{enquiries.count ?? 0}</p>
          <ButtonLink href="/account/enquiries" variant="ghost" className="mt-2 px-0">
            View enquiries
          </ButtonLink>
        </Card>
        <Card>
          <p className="text-sm text-text-muted">My listings</p>
          <p className="text-2xl font-semibold">{listings.data?.length ?? 0}</p>
          <p className="text-sm text-text-muted">
            {byStatus("published")} live · {byStatus("pending_review")} in review ·{" "}
            {byStatus("draft") + byStatus("rejected")} to finish
          </p>
        </Card>
      </div>
      {canList(viewer) ? (
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/account/listings/new">List a property</ButtonLink>
          {isStaff(viewer) ? (
            <ButtonLink href="/admin" variant="secondary">
              Open admin
            </ButtonLink>
          ) : null}
        </div>
      ) : (
        <Card>
          <h2 className="text-lg font-semibold">Want to list a property?</h2>
          {!viewer.emailVerified ? (
            <p className="mt-1 text-sm text-text-muted">Confirm your email address first.</p>
          ) : settings.self_service_owner ? (
            <>
              <p className="mt-1 text-sm text-text-muted">
                Turn on listing to create property listings. Each listing is reviewed before it goes live.
              </p>
              <div className="mt-3">
                <BecomeOwnerButton />
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-text-muted">
              Listing accounts are created by invitation. Contact us to get started.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
