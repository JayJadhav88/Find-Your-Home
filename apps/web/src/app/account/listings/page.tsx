import Link from "next/link";
import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { Badge, ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { canList, requireViewer } from "@/lib/auth";
import { STATUS_LABEL } from "@/lib/listing-format";
import { createUserClient } from "@/lib/supabase";

export default function MyListingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <MyListings />
    </Suspense>
  );
}

async function MyListings() {
  const viewer = await requireViewer("/account/listings");
  const supabase = await createUserClient();
  const { data } = await supabase
    .from("listings")
    .select("id, title, reference_code, status, updated_at, purpose")
    .or(`owner_id.eq.${viewer.id},agent_id.eq.${viewer.id}`)
    .order("updated_at", { ascending: false });
  const listings = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My listings"
        actions={canList(viewer) ? <ButtonLink href="/account/listings/new">New listing</ButtonLink> : null}
      />
      {listings.length === 0 ? (
        <EmptyState
          title="No listings yet"
          action={<ButtonLink href={canList(viewer) ? "/account/listings/new" : "/account"}>List a property</ButtonLink>}
        >
          Listings are reviewed by our team before they appear in search.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {listings.map((listing) => (
            <li key={listing.id}>
              <Link
                href={`/account/listings/${listing.id}`}
                className="flex flex-col gap-1 p-4 hover:bg-surface-muted sm:flex-row sm:items-center sm:justify-between"
              >
                <span>
                  <span className="font-medium">{listing.title}</span>
                  <span className="block text-sm text-text-muted">
                    {listing.reference_code} · updated {listing.updated_at.slice(0, 10)}
                  </span>
                </span>
                <Badge tone={listing.status}>{STATUS_LABEL[listing.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
