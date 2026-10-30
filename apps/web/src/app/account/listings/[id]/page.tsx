import { formatDateTime, formatReviewTime, videoWatchUrl } from "@fyh/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { setAvailability } from "@/app/actions/listings";
import { WorkflowButtons } from "@/components/account-forms";
import { ActionForm } from "@/components/action-form";
import { BrochureUpload } from "@/components/brochure-upload";
import { ListingForm, type ListingFormInitial } from "@/components/listing-form";
import { Loading } from "@/components/loading";
import { PhotoManager } from "@/components/photo-manager";
import { Alert, Badge, Card, PageHeader, Select } from "@/components/ui";
import { hasRole, isAdmin, requireViewer } from "@/lib/auth";
import { listingPath, STATUS_LABEL } from "@/lib/listing-format";
import { getSiteSettings, getTaxonomy } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

export default function EditListingPage({ params, searchParams }: PageProps<"/account/listings/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      {Promise.all([params, searchParams]).then(([{ id }, query]) => (
        <EditListing id={id} created={query.notice === "created"} />
      ))}
    </Suspense>
  );
}

const STATUS_HELP: Record<string, string> = {
  draft: "Only you can see this draft. Add photos and details, then submit it for review.",
  pending_review: "A moderator is reviewing this listing. You'll get an email when it's decided. Withdraw it if you need to make changes.",
  published: "This listing is live. Changing the price, location, size, rooms or photos sends it back to review.",
  rejected: "This listing needs changes before it can go live. Update it and submit it again.",
  suspended: "A moderator has taken this listing offline. Contact us if you have questions.",
  archived: "This listing is archived and hidden from search.",
  sold: "Marked as sold and hidden from search.",
  rented: "Marked as rented and hidden from search.",
};

async function EditListing({ id, created }: { id: string; created: boolean }) {
  const viewer = await requireViewer(`/account/listings/${id}`);
  const supabase = await createUserClient();
  const { data: listing } = await supabase
    .from("listings")
    .select("*, private:listing_private_details(street_address), amenities:listing_amenities(amenity_id), media:listing_media(id, upload_key, alt_text, is_cover, sort_order, kind), videos:listing_videos(provider, video_id, instagram_kind, sort_order)")
    .eq("id", id)
    .maybeSingle();
  const own = listing && (listing.owner_id === viewer.id || listing.agent_id === viewer.id);
  // Super admins edit any property (the database allows it in every state, without re-review).
  const asAdmin = Boolean(listing && !own && isAdmin(viewer));
  if (!listing || (!own && !asAdmin)) notFound();

  const [settings, taxonomy, history] = await Promise.all([
    getSiteSettings(),
    getTaxonomy(),
    supabase.rpc("get_listing_history", { p_listing_id: id }),
  ]);
  const editable = asAdmin || ["draft", "rejected", "published"].includes(listing.status);
  const lastDecision = (history.data ?? []).find((event) => event.to_status === "rejected" || event.to_status === "suspended");
  const fmt = { locale: settings.default_locale, timeZone: settings.default_timezone };

  const initial: ListingFormInitial = {
    title: listing.title,
    description: listing.description,
    category: listing.category,
    projectName: listing.project_name ?? undefined,
    projectRegistrationNumber: listing.project_registration_number ?? undefined,
    priceMax: listing.price_max?.toString(),
    launchDate: listing.launch_date ?? undefined,
    configurations: listing.configurations.join(", "),
    videoUrls: [...listing.videos]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((video) => videoWatchUrl(video))
      .join("\n"),
    propertyTypeId: listing.property_type_id ?? undefined,
    priceAmount: listing.price_amount?.toString(),
    currency: listing.currency ?? undefined,
    pricePeriod: listing.price_period,
    priceNegotiable: listing.price_negotiable,
    priceDisplay: listing.price_display,
    countryId: listing.country_id ?? undefined,
    regionId: listing.region_id ?? undefined,
    cityId: listing.city_id ?? undefined,
    localityId: listing.locality_id ?? undefined,
    postalCode: listing.postal_code ?? undefined,
    landmark: listing.landmark ?? undefined,
    addressVisibility: listing.address_visibility,
    streetAddress: listing.private?.street_address ?? undefined,
    areaUnit: listing.area_unit ?? undefined,
    areaValue: listing.area_value?.toString(),
    builtUpArea: listing.built_up_area?.toString(),
    carpetArea: listing.carpet_area?.toString(),
    plotArea: listing.plot_area?.toString(),
    bedrooms: listing.bedrooms?.toString(),
    bathrooms: listing.bathrooms?.toString(),
    balconies: listing.balconies?.toString(),
    parkingSpaces: listing.parking_spaces?.toString(),
    floorNumber: listing.floor_number?.toString(),
    totalFloors: listing.total_floors?.toString(),
    yearBuilt: listing.year_built?.toString(),
    furnishing: listing.furnishing ?? undefined,
    possessionStatus: listing.possession_status ?? undefined,
    availableFrom: listing.available_from ?? undefined,
    virtualTourUrl: listing.virtual_tour_url ?? undefined,
    contactViaForm: listing.contact_via_form,
    showPhone: listing.show_phone,
    showWhatsapp: listing.show_whatsapp,
    showEmail: listing.show_email,
    amenityIds: listing.amenities.map((row) => row.amenity_id),
  };

  const actions: Array<{ action: string; label: string; variant?: "primary" | "secondary" | "danger"; confirm?: string }> = [];
  if (listing.status === "draft" || listing.status === "rejected") actions.push({ action: "submit", label: "Submit for review", variant: "primary" });
  if (listing.status === "pending_review") actions.push({ action: "withdraw", label: "Withdraw to edit" });
  if (listing.status === "published") {
    actions.push({ action: listing.purpose === "sale" ? "sold" : "rented", label: listing.purpose === "sale" ? "Mark as sold" : "Mark as rented", confirm: "This removes the listing from search. Continue?" });
  }
  if (!["archived", "suspended"].includes(listing.status)) {
    actions.push({ action: "archived", label: "Archive", variant: "danger", confirm: "Archive this listing? It will be hidden from search." });
  }
  if (["archived", "sold", "rented"].includes(listing.status)) actions.push({ action: "restore", label: "Restore as draft" });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={listing.title}
        description={`Reference ${listing.reference_code}`}
        actions={
          listing.status === "published" ? (
            <Link href={listingPath(listing)} className="text-sm text-brand underline">
              View live listing
            </Link>
          ) : null
        }
      />
      {created ? <Alert tone="success">Draft saved. Add photos below, then submit it for review.</Alert> : null}
      {asAdmin ? (
        <Alert tone="warning" title="Editing as a super admin">
          This property belongs to someone else. Your changes go live straight away, without review, and are recorded in the audit log.{" "}
          <Link className="underline" href={`/admin/listings/${listing.id}`}>Back to the review page</Link>
        </Alert>
      ) : null}
      <Card className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-muted">Status</span>
          <Badge tone={listing.status}>{STATUS_LABEL[listing.status]}</Badge>
        </div>
        <p className="text-sm">
          {listing.status === "pending_review"
            ? `A moderator is reviewing this listing. Listings are usually reviewed within ${formatReviewTime(settings.review_hours_target)}; we'll notify you here and by email. Withdraw it if you need to make changes.`
            : STATUS_HELP[listing.status]}
        </p>
        {lastDecision?.reason && (listing.status === "rejected" || listing.status === "suspended") ? (
          <Alert tone="warning" title="Note from our moderators">{lastDecision.reason}</Alert>
        ) : null}
        {asAdmin ? null : <WorkflowButtons listingId={listing.id} actions={actions} />}
        {listing.status === "published" ? (
          <ActionForm action={setAvailability} submitLabel="Update availability" variant="secondary" inline>
            <input type="hidden" name="listingId" value={listing.id} />
            <label className="flex flex-col gap-1 text-sm font-medium">
              Availability
              <Select bare name="availability" defaultValue={listing.availability}>
                <option value="available">Available</option>
                <option value="under_negotiation">Under negotiation</option>
                <option value="unavailable">Not available (hide from search)</option>
              </Select>
            </label>
          </ActionForm>
        ) : null}
      </Card>

      {editable ? (
        <Card>
          <BrochureUpload listingId={listing.id} current={listing.brochure_key} />
        </Card>
      ) : null}

      <PhotoManager
        listingId={listing.id}
        initial={listing.media.filter((item) => item.kind === "image")}
        editable={editable}
        isLive={listing.status === "published"}
        maxImages={settings.max_images_per_listing}
        maxBytes={settings.max_image_bytes}
        allowedTypes={settings.allowed_image_types}
      />

      {editable ? (
        <ListingForm
          taxonomy={taxonomy}
          listingId={listing.id}
          initial={initial}
          defaultCurrency={settings.default_currency}
          defaultAreaUnit={settings.default_area_unit}
          canListNewProjects={hasRole(viewer, "builder", "administrator")}
        />
      ) : (
        <Alert tone="info">Details can’t be edited in this state.</Alert>
      )}

      {history.data?.length ? (
        <Card>
          <h2 className="text-lg font-semibold">History</h2>
          <ol className="mt-3 flex flex-col gap-2 text-sm">
            {history.data.map((event) => (
              <li key={`${event.created_at}-${event.to_status}`}>
                <span className="text-text-muted">{formatDateTime(event.created_at, fmt)}</span> —{" "}
                {STATUS_LABEL[event.to_status]}
                {event.reason ? <span className="text-text-muted"> ({event.reason})</span> : null}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </div>
  );
}
