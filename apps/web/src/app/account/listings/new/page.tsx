import { Suspense } from "react";
import { BecomeOwnerButton } from "@/components/account-forms";
import { ListingForm } from "@/components/listing-form";
import { Loading } from "@/components/loading";
import { Alert, Card, PageHeader } from "@/components/ui";
import { canList, requireViewer } from "@/lib/auth";
import { getSiteSettings, getTaxonomy } from "@/lib/public-data";

export default function NewListingPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewListing />
    </Suspense>
  );
}

async function NewListing() {
  const viewer = await requireViewer("/account/listings/new");
  const [settings, taxonomy] = await Promise.all([getSiteSettings(), getTaxonomy()]);

  if (!canList(viewer)) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="List a property" />
        <Card>
          {!viewer.emailVerified ? (
            <Alert tone="warning">Confirm your email address before listing a property.</Alert>
          ) : settings.self_service_owner ? (
            <>
              <p className="mb-3">Turn on listing for your account to continue.</p>
              <BecomeOwnerButton />
            </>
          ) : (
            <p>Listing accounts are created by invitation. Please contact us.</p>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="List a property"
        description="Save a draft first, then add photos and submit it for review. Nothing is public until a moderator approves it."
      />
      <ListingForm
        taxonomy={taxonomy}
        defaultCurrency={settings.default_currency}
        defaultAreaUnit={settings.default_area_unit}
        initial={{ contactViaForm: true }}
      />
    </div>
  );
}
