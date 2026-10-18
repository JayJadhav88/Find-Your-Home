import { formatDateTime } from "@fyh/shared";
import Link from "next/link";
import { Suspense } from "react";
import { renewListing } from "@/app/actions/extras";
import { ActionForm } from "@/components/action-form";
import { Loading } from "@/components/loading";
import { Badge, ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { canList, requireViewer } from "@/lib/auth";
import { STATUS_LABEL } from "@/lib/listing-format";
import { getSiteSettings } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

/** Renewing is offered in the last two weeks before a listing expires. */
function expiresWithinTwoWeeks(expiresAt: string | null): boolean {
  return Boolean(expiresAt) && Date.parse(expiresAt!) < Date.now() + 14 * 86_400_000;
}

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
  const [{ data }, { data: stats }, settings] = await Promise.all([
    supabase
      .from("listings")
      .select("id, title, reference_code, status, updated_at, purpose, expired_at")
      .or(`owner_id.eq.${viewer.id},agent_id.eq.${viewer.id}`)
      .order("updated_at", { ascending: false }),
    supabase.rpc("my_listing_stats"),
    getSiteSettings(),
  ]);
  const listings = data ?? [];
  const statsFor = new Map((stats ?? []).map((row) => [row.listing_id, row]));
  const fmt = { locale: settings.default_locale, timeZone: settings.default_timezone };

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
          {listings.map((listing) => {
            const stat = statsFor.get(listing.id);
            const expiresSoon = expiresWithinTwoWeeks(stat?.expires_at ?? null);
            const canRenew = expiresSoon || (listing.status === "archived" && listing.expired_at);
            return (
              <li key={listing.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <Link href={`/account/listings/${listing.id}`} className="min-w-0 hover:underline">
                  <span className="font-medium">{listing.title}</span>
                  <span className="block text-sm text-text-muted">
                    {listing.reference_code} · updated {listing.updated_at.slice(0, 10)}
                  </span>
                  {stat ? (
                    <span className="block text-sm text-text-muted">
                      {stat.views_30d} views and {stat.enquiries_30d} enquiries in 30 days · {stat.saves} saved
                      {stat.expires_at ? ` · live until ${formatDateTime(stat.expires_at, fmt)}` : ""}
                      {listing.status === "archived" && listing.expired_at ? " · expired" : ""}
                    </span>
                  ) : null}
                </Link>
                <span className="flex flex-wrap items-center gap-2">
                  {canRenew ? (
                    <ActionForm action={renewListing} submitLabel="Renew" submitAriaLabel={`Renew ${listing.title}`} variant="secondary" inline>
                      <input type="hidden" name="listingId" value={listing.id} />
                    </ActionForm>
                  ) : null}
                  <Badge tone={listing.status}>{listing.status === "archived" && listing.expired_at ? "Expired" : STATUS_LABEL[listing.status]}</Badge>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
