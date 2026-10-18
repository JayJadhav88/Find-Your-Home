import { formatDateTime } from "@fyh/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { assignAgent, moderateListing, setListingFeatured } from "@/app/actions/admin";
import { ActionForm } from "@/components/action-form";
import { Loading } from "@/components/loading";
import { Badge, Card, Checkbox, Field, PageHeader, Select, TextArea, TextInput } from "@/components/ui";
import { isAdmin, requireStaff } from "@/lib/auth";
import {
  AREA_UNIT_LABEL,
  displayPrice,
  FURNISHING_LABEL,
  listingPath,
  POSSESSION_LABEL,
  STATUS_LABEL,
} from "@/lib/listing-format";
import { getSiteSettings, getTaxonomy, locationLabel } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

export default function AdminListingPage({ params }: PageProps<"/admin/listings/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      {params.then(({ id }) => (
        <Review id={id} />
      ))}
    </Suspense>
  );
}

async function Review({ id }: { id: string }) {
  const viewer = await requireStaff(`/admin/listings/${id}`);
  const supabase = await createUserClient();
  const { data: listing } = await supabase
    .from("listings")
    .select(
      `*, owner:profiles!listings_owner_id_fkey(id, display_name, status),
       agent:profiles!listings_agent_id_fkey(id, display_name),
       property_type:property_types(name),
       private:listing_private_details(street_address, owner_notes),
       media:listing_media(id, upload_key, public_key, alt_text, is_cover, sort_order, kind, mime_type, bytes),
       amenities:listing_amenities(amenity:amenities(name))`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!listing) notFound();

  const [settings, taxonomy, { data: events }, agents] = await Promise.all([
    getSiteSettings(),
    getTaxonomy(),
    supabase.from("listing_status_events").select("*, actor:profiles(display_name)").eq("listing_id", id).order("created_at", { ascending: false }),
    isAdmin(viewer)
      ? supabase.from("user_roles").select("user_id, profile:profiles!user_roles_user_id_fkey(display_name)").eq("role", "agent")
      : Promise.resolve({ data: [] as Array<{ user_id: string; profile: { display_name: string } | null }> }),
  ]);

  const images = listing.media.filter((item) => item.kind === "image").sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order);
  const { data: signed } = images.length
    ? await supabase.storage.from("listing-uploads").createSignedUrls(images.map((item) => item.upload_key), 600)
    : { data: [] };
  const fmt = { locale: settings.default_locale, timeZone: settings.default_timezone };
  const unit = listing.area_unit ? AREA_UNIT_LABEL[listing.area_unit] : "";

  const facts: Array<[string, string | number | null | undefined]> = [
    ["Purpose", listing.purpose],
    ["Type", listing.property_type?.name],
    ["Price", displayPrice(listing, settings.default_locale)],
    ["Negotiable", listing.price_negotiable ? "Yes" : "No"],
    ["Location", locationLabel(taxonomy, listing.locality_id ?? listing.city_id ?? listing.country_id)],
    ["Street address (private)", listing.private?.street_address],
    ["Postal code", listing.postal_code],
    ["Address shown", listing.address_visibility],
    ["Area", listing.area_value ? `${listing.area_value} ${unit}` : null],
    ["Built-up / carpet / plot", [listing.built_up_area, listing.carpet_area, listing.plot_area].map((value) => value ?? "—").join(" / ")],
    ["Bedrooms / bathrooms", `${listing.bedrooms ?? "—"} / ${listing.bathrooms ?? "—"}`],
    ["Balconies / parking", `${listing.balconies ?? "—"} / ${listing.parking_spaces ?? "—"}`],
    ["Floor", listing.floor_number != null ? `${listing.floor_number} of ${listing.total_floors ?? "?"}` : null],
    ["Year built", listing.year_built],
    ["Furnishing", listing.furnishing ? FURNISHING_LABEL[listing.furnishing] : null],
    ["Availability", listing.possession_status ? POSSESSION_LABEL[listing.possession_status] : null],
    ["Video", listing.video_url],
    ["Virtual tour", listing.virtual_tour_url],
    ["Contact", [listing.contact_via_form && "form", listing.show_phone && "phone", listing.show_whatsapp && "WhatsApp", listing.show_email && "email"].filter(Boolean).join(", ")],
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={listing.title}
        description={`${listing.reference_code} · owner ${listing.owner?.display_name ?? "unknown"}${listing.owner?.status === "suspended" ? " (suspended)" : ""}`}
        actions={
          listing.status === "published" ? (
            <Link className="text-sm text-brand underline" href={listingPath(listing)}>View live page</Link>
          ) : null
        }
      />
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Badge tone={listing.status}>{STATUS_LABEL[listing.status]}</Badge>
          {listing.is_featured ? <Badge tone="sold">Featured</Badge> : null}
        </div>
        {listing.status === "pending_review" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <ActionForm action={moderateListing} submitLabel="Approve and publish" confirm="Publish this listing?">
              <input type="hidden" name="listingId" value={listing.id} />
              <input type="hidden" name="decision" value="approve" />
            </ActionForm>
            <ActionForm action={moderateListing} submitLabel="Reject" variant="danger">
              <input type="hidden" name="listingId" value={listing.id} />
              <input type="hidden" name="decision" value="reject" />
              <Field label="Reason (shown to the owner)" name="reason" required>
                <TextArea name="reason" rows={3} />
              </Field>
              <Checkbox name="internalOnly" label="Keep the reason internal (owner sees only that changes are needed)" />
            </ActionForm>
          </div>
        ) : null}
        {listing.status === "published" ? (
          <ActionForm action={moderateListing} submitLabel="Suspend listing" variant="danger" confirm="Take this listing offline?">
            <input type="hidden" name="listingId" value={listing.id} />
            <input type="hidden" name="decision" value="suspend" />
            <Field label="Reason (shown to the owner)" name="reason" required>
              <TextArea name="reason" rows={2} />
            </Field>
          </ActionForm>
        ) : null}
        {listing.status === "suspended" ? (
          <ActionForm action={moderateListing} submitLabel="Reinstate listing">
            <input type="hidden" name="listingId" value={listing.id} />
            <input type="hidden" name="decision" value="reinstate" />
          </ActionForm>
        ) : null}
        {isAdmin(viewer) && listing.status === "published" ? (
          <ActionForm action={setListingFeatured} submitLabel={listing.is_featured ? "Stop featuring" : "Feature on the home page"} variant="secondary" inline>
            <input type="hidden" name="listingId" value={listing.id} />
            <input type="hidden" name="featured" value={listing.is_featured ? "0" : "1"} />
            {!listing.is_featured ? (
              <label className="flex flex-col gap-1 text-sm font-medium">
                Until (optional)
                <TextInput bare name="until" type="date" />
              </label>
            ) : null}
          </ActionForm>
        ) : null}
        {isAdmin(viewer) ? (
          <ActionForm action={assignAgent} submitLabel="Save agent" variant="secondary" inline>
            <input type="hidden" name="listingId" value={listing.id} />
            <label className="flex flex-col gap-1 text-sm font-medium">
              Assigned agent
              <Select bare name="agentId" defaultValue={listing.agent_id ?? ""}>
                <option value="">None</option>
                {(agents.data ?? []).map((agent) => (
                  <option key={agent.user_id} value={agent.user_id}>{agent.profile?.display_name ?? agent.user_id}</option>
                ))}
              </Select>
            </label>
          </ActionForm>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Photos ({images.length})</h2>
        {images.length ? (
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            {images.map((image, index) => (
              <li key={image.id} className="text-xs">
                {signed?.[index]?.signedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- private signed preview
                  <img src={signed[index]!.signedUrl} alt={image.alt_text ?? ""} className="aspect-[4/3] w-full rounded-md object-cover" />
                ) : null}
                <p className="mt-1">
                  {image.is_cover ? "Cover · " : ""}
                  {image.mime_type} · {image.bytes ? `${Math.round(image.bytes / 1024)} KB` : "?"} · {image.public_key ? "public copy ready" : "not public"}
                </p>
                <p className="text-text-muted">{image.alt_text || "No description"}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-danger">No photos. A cover photo is required before approval.</p>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Details</h2>
        <dl className="mt-3 grid gap-x-6 text-sm sm:grid-cols-2">
          {facts.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-border py-2">
              <dt className="text-text-muted">{label}</dt>
              <dd className="text-right">{value === null || value === undefined || value === "" ? "—" : String(value)}</dd>
            </div>
          ))}
        </dl>
        <h3 className="mt-4 font-semibold">Description</h3>
        <p className="mt-1 whitespace-pre-line text-sm">{listing.description || "—"}</p>
        <h3 className="mt-4 font-semibold">Amenities</h3>
        <p className="mt-1 text-sm">{listing.amenities.map((row) => row.amenity?.name).filter(Boolean).join(", ") || "—"}</p>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">History</h2>
        <ol className="mt-3 flex flex-col gap-2 text-sm">
          {(events ?? []).map((event) => (
            <li key={event.id}>
              <span className="text-text-muted">{formatDateTime(event.created_at, fmt)}</span> — {event.from_status ? `${STATUS_LABEL[event.from_status]} → ` : ""}
              {STATUS_LABEL[event.to_status]} by {event.actor?.display_name ?? "system"}
              {event.reason ? ` — “${event.reason}”${event.reason_visible_to_owner ? "" : " (internal)"}` : ""}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
