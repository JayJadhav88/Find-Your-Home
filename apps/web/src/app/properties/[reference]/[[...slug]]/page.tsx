import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { toggleFavorite } from "@/app/actions/favorites";
import { EnquiryForm } from "@/components/enquiry-form";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { absoluteUrl } from "@/lib/env";
import {
  displayArea,
  displayPrice,
  FURNISHING_LABEL,
  listingPath,
  POSSESSION_LABEL,
  publicImageUrl,
  PURPOSE_LABEL,
} from "@/lib/listing-format";
import { getListingReferenceById, getPublicListing, getSiteSettings, getTaxonomy, locationLabel } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Props = PageProps<"/properties/[reference]/[[...slug]]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { reference } = await params;
  const listing = UUID.test(reference) ? null : await getPublicListing(reference.toUpperCase());
  if (!listing) return { title: "Property not found", robots: { index: false } };

  const settings = await getSiteSettings();
  const cover = listing.media.find((item) => item.is_cover && item.public_key) ?? listing.media.find((item) => item.public_key);
  const description =
    listing.seo_description ??
    `${PURPOSE_LABEL[listing.purpose]} · ${displayPrice(listing, settings.default_locale)}. ${listing.description.slice(0, 120)}`;
  return {
    title: listing.seo_title ?? listing.title,
    description,
    alternates: { canonical: listingPath(listing) },
    openGraph: {
      title: listing.seo_title ?? listing.title,
      description,
      url: listingPath(listing),
      images: cover?.public_key ? [{ url: publicImageUrl(cover.public_key), alt: cover.alt_text ?? "" }] : undefined,
    },
  };
}

export default function ListingPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-12 text-text-muted">Loading property…</div>}>
      {params.then(({ reference, slug }) => (
        <ListingDetail reference={reference} slug={slug?.[0]} />
      ))}
    </Suspense>
  );
}

async function ListingDetail({ reference, slug }: { reference: string; slug?: string }) {
  // Links in emails use the listing id; send them to the canonical URL.
  if (UUID.test(reference)) {
    const found = await getListingReferenceById(reference);
    if (!found) notFound();
    permanentRedirect(listingPath(found));
  }

  const listing = await getPublicListing(reference.toUpperCase());
  if (!listing) notFound();
  if (slug !== listing.slug || reference !== listing.reference_code) permanentRedirect(listingPath(listing));

  const [settings, taxonomy] = await Promise.all([getSiteSettings(), getTaxonomy()]);
  const locale = settings.default_locale;
  const photos = listing.media
    .filter((item) => item.kind === "image" && item.public_key)
    .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order);
  const place = locationLabel(taxonomy, listing.locality_id ?? listing.city_id ?? listing.region_id ?? listing.country_id);
  const city = taxonomy.locations.find((location) => location.id === listing.city_id);
  const amenities = listing.amenities.map((row) => row.amenity).filter((amenity) => amenity !== null);

  const facts: Array<[string, string | null]> = [
    ["Property type", listing.property_type?.name ?? null],
    ["Bedrooms", listing.bedrooms != null ? String(listing.bedrooms) : null],
    ["Bathrooms", listing.bathrooms != null ? String(listing.bathrooms) : null],
    ["Area", displayArea(listing.area_value, listing.area_unit, locale)],
    ["Built-up area", displayArea(listing.built_up_area, listing.area_unit, locale)],
    ["Carpet area", displayArea(listing.carpet_area, listing.area_unit, locale)],
    ["Plot area", displayArea(listing.plot_area, listing.area_unit, locale)],
    ["Balconies", listing.balconies != null ? String(listing.balconies) : null],
    ["Parking spaces", listing.parking_spaces != null ? String(listing.parking_spaces) : null],
    ["Floor", listing.floor_number != null ? `${listing.floor_number}${listing.total_floors != null ? ` of ${listing.total_floors}` : ""}` : null],
    ["Year built", listing.year_built != null ? String(listing.year_built) : null],
    ["Furnishing", listing.furnishing ? FURNISHING_LABEL[listing.furnishing] : null],
    ["Availability", listing.possession_status ? POSSESSION_LABEL[listing.possession_status] : null],
    ["Available from", listing.available_from],
    ["Reference", listing.reference_code],
  ];

  const mapLink =
    listing.address_visibility !== "hidden" && listing.public_lat != null && listing.public_lng != null
      ? `https://www.openstreetmap.org/?mlat=${listing.public_lat}&mlon=${listing.public_lng}#map=15/${listing.public_lat}/${listing.public_lng}`
      : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: listing.title,
    url: absoluteUrl(listingPath(listing)),
    datePosted: listing.first_published_at,
    image: photos.map((photo) => publicImageUrl(photo.public_key!)),
    ...(listing.price_display === "show" && listing.price_amount != null && listing.currency
      ? {
          offers: {
            "@type": "Offer",
            price: Number(listing.price_amount),
            priceCurrency: listing.currency,
            businessFunction: listing.purpose === "rent" ? "http://purl.org/goodrelations/v1#LeaseOut" : "http://purl.org/goodrelations/v1#Sell",
          },
        }
      : {}),
  };

  return (
    <article className="mx-auto max-w-6xl px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="text-sm text-text-muted">
        <ol className="flex flex-wrap gap-1">
          <li>
            <Link href="/" className="hover:underline">Home</Link> ›
          </li>
          <li>
            <Link href={`/search?purpose=${listing.purpose}`} className="hover:underline">
              {PURPOSE_LABEL[listing.purpose]}
            </Link>{" "}
            ›
          </li>
          {city ? (
            <li>
              <Link href={`/search?purpose=${listing.purpose}&location=${city.id}`} className="hover:underline">
                {city.name}
              </Link>{" "}
              ›
            </li>
          ) : null}
          <li aria-current="page" className="text-text">{listing.reference_code}</li>
        </ol>
      </nav>

      <header className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge>{PURPOSE_LABEL[listing.purpose]}</Badge>
            {listing.is_featured ? <Badge tone="sold">Featured</Badge> : null}
          </div>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{listing.title}</h1>
          {place ? <p className="text-text-muted">{place}</p> : null}
        </div>
        <div className="sm:text-right">
          <p className="text-2xl font-semibold">{displayPrice(listing, locale)}</p>
          {listing.price_negotiable ? <p className="text-sm text-text-muted">Negotiable</p> : null}
          <Suspense fallback={null}>
            <FavoriteButton listingId={listing.id} returnTo={listingPath(listing)} />
          </Suspense>
        </div>
      </header>

      <Gallery photos={photos.map((photo) => ({ src: publicImageUrl(photo.public_key!), alt: photo.alt_text ?? "" }))} title={listing.title} />

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-8">
          <section aria-labelledby="facts-heading">
            <h2 id="facts-heading" className="text-xl font-semibold">Key facts</h2>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {facts
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 border-b border-border py-2 text-sm">
                    <dt className="text-text-muted">{label}</dt>
                    <dd className="text-right font-medium">{value}</dd>
                  </div>
                ))}
            </dl>
          </section>

          {listing.description ? (
            <section aria-labelledby="description-heading">
              <h2 id="description-heading" className="text-xl font-semibold">About this property</h2>
              <p className="mt-3 whitespace-pre-line leading-relaxed">{listing.description}</p>
            </section>
          ) : null}

          {amenities.length ? (
            <section aria-labelledby="amenities-heading">
              <h2 id="amenities-heading" className="text-xl font-semibold">Amenities</h2>
              <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                {amenities.map((amenity) => (
                  <li key={amenity.id} className="rounded-lg bg-surface px-3 py-2">{amenity.name}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="location-heading">
            <h2 id="location-heading" className="text-xl font-semibold">Location</h2>
            <p className="mt-2">{place || "Location shared on request."}</p>
            {listing.address_visibility === "approximate" ? (
              <p className="text-sm text-text-muted">The exact address is shared by the lister after you get in touch.</p>
            ) : null}
            {mapLink ? (
              <a href={mapLink} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-brand underline">
                Open the area on OpenStreetMap (opens a new tab)
              </a>
            ) : null}
          </section>

          {listing.video_url || listing.virtual_tour_url ? (
            <section aria-labelledby="media-heading">
              <h2 id="media-heading" className="text-xl font-semibold">Video and tour</h2>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {listing.video_url ? (
                  <li><a href={listing.video_url} target="_blank" rel="noopener noreferrer nofollow" className="text-brand underline">Watch the video</a></li>
                ) : null}
                {listing.virtual_tour_url ? (
                  <li><a href={listing.virtual_tour_url} target="_blank" rel="noopener noreferrer nofollow" className="text-brand underline">Open the virtual tour</a></li>
                ) : null}
              </ul>
            </section>
          ) : null}
        </div>

        <aside aria-labelledby="contact-heading" className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <h2 id="contact-heading" className="text-lg font-semibold">Contact the lister</h2>
            {listing.contact ? (
              <div className="mt-2 text-sm">
                <p className="font-medium">{listing.contact.display_name}</p>
                {listing.contact.agency_name ? <p className="text-text-muted">{listing.contact.agency_name}</p> : null}
                <ul className="mt-2 flex flex-col gap-1">
                  {listing.contact.phone ? (
                    <li><a className="text-brand underline" href={`tel:${listing.contact.phone}`}>{listing.contact.phone}</a></li>
                  ) : null}
                  {listing.contact.whatsapp ? (
                    <li>
                      <a className="text-brand underline" href={`https://wa.me/${listing.contact.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                        WhatsApp
                      </a>
                    </li>
                  ) : null}
                  {listing.contact.email ? (
                    <li><a className="text-brand underline" href={`mailto:${listing.contact.email}`}>{listing.contact.email}</a></li>
                  ) : null}
                </ul>
              </div>
            ) : null}
            <div className="mt-4">
              {listing.contact_via_form ? (
                <Suspense fallback={<EnquiryForm listingId={listing.id} brandName={settings.brand_name} />}>
                  <EnquiryFormForViewer listingId={listing.id} brandName={settings.brand_name} />
                </Suspense>
              ) : (
                <p className="text-sm text-text-muted">This lister prefers to be contacted directly.</p>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </article>
  );
}

function Gallery({ photos, title }: { photos: Array<{ src: string; alt: string }>; title: string }) {
  if (!photos.length) {
    return (
      <div className="mt-6 flex aspect-[16/7] items-center justify-center rounded-xl bg-surface text-text-muted">
        No photos yet
      </div>
    );
  }
  const [first, ...rest] = photos;
  return (
    <section aria-label="Photos" className="mt-6 grid gap-2 sm:grid-cols-4 sm:grid-rows-2">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl sm:col-span-2 sm:row-span-2 sm:aspect-auto">
        <Image src={first!.src} alt={first!.alt || title} fill priority={false} fetchPriority="high" loading="eager" sizes="(min-width: 640px) 50vw, 100vw" className="object-cover" />
      </div>
      {rest.slice(0, 4).map((photo, index) => (
        <div key={photo.src} className="relative hidden aspect-[4/3] overflow-hidden rounded-xl sm:block">
          <Image src={photo.src} alt={photo.alt || `${title} — photo ${index + 2}`} fill sizes="25vw" className="object-cover" />
        </div>
      ))}
      {rest.length > 4 ? (
        <details className="sm:col-span-4">
          <summary className="cursor-pointer text-sm text-brand underline">Show all {photos.length} photos</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {rest.slice(4).map((photo, index) => (
              <div key={photo.src} className="relative aspect-[4/3] overflow-hidden rounded-xl">
                <Image src={photo.src} alt={photo.alt || `${title} — photo ${index + 6}`} fill sizes="33vw" className="object-cover" />
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

async function FavoriteButton({ listingId, returnTo }: { listingId: string; returnTo: string }) {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <ButtonLink href={`/sign-in?next=${encodeURIComponent(returnTo)}`} variant="secondary" className="mt-2">
        Sign in to save
      </ButtonLink>
    );
  }
  const supabase = await createUserClient();
  const { count } = await supabase
    .from("favorites")
    .select("listing_id", { count: "exact", head: true })
    .eq("user_id", viewer.id)
    .eq("listing_id", listingId);
  const saved = Boolean(count);
  return (
    <form action={toggleFavorite} className="mt-2">
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="save" value={saved ? "0" : "1"} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        aria-pressed={saved}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold hover:bg-surface-muted"
      >
        <span aria-hidden>{saved ? "♥" : "♡"}</span> {saved ? "Saved" : "Save"}
      </button>
    </form>
  );
}

async function EnquiryFormForViewer({ listingId, brandName }: { listingId: string; brandName: string }) {
  const viewer = await getViewer();
  return (
    <EnquiryForm listingId={listingId} brandName={brandName} defaultName={viewer?.displayName} defaultEmail={viewer?.email} />
  );
}
