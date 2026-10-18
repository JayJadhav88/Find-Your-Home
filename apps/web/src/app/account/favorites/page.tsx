import { Suspense } from "react";
import { toggleFavorite } from "@/app/actions/favorites";
import { ListingCard, ListingGrid } from "@/components/listing-card";
import { Loading } from "@/components/loading";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { getSiteSettings } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

export default function FavoritesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Favorites />
    </Suspense>
  );
}

async function Favorites() {
  const viewer = await requireViewer("/account/favorites");
  const supabase = await createUserClient();
  const settings = await getSiteSettings();
  const { data: rows } = await supabase
    .from("favorites")
    .select(
      `listing_id, created_at,
       listing:listings(id, reference_code, slug, title, purpose, status, price_amount, currency, price_period,
         price_display, price_negotiable, bedrooms, bathrooms, area_value, area_unit, is_featured, first_published_at,
         property_type:property_types(name),
         city:locations!listings_city_id_fkey(name),
         locality:locations!listings_locality_id_fkey(name),
         media:listing_media(public_key, alt_text, is_cover, sort_order))`,
    )
    .eq("user_id", viewer.id)
    .order("created_at", { ascending: false });

  const saved = (rows ?? []).flatMap((row) => (row.listing ? [row.listing] : []));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Saved homes" />
      {saved.length === 0 ? (
        <EmptyState title="No saved homes yet" action={<ButtonLink href="/search">Browse homes</ButtonLink>}>
          Select “Save” on any property to keep it here.
        </EmptyState>
      ) : (
        <ListingGrid>
          {saved.map((listing) => {
            if (listing.status !== "published") {
              return (
                <article key={listing.id} className="flex flex-col gap-2 rounded-xl border border-dashed border-border bg-surface p-4 text-sm">
                  <p className="font-medium">{listing.title}</p>
                  <p className="text-text-muted">This home is no longer available.</p>
                  <form action={toggleFavorite}>
                    <input type="hidden" name="listingId" value={listing.id} />
                    <input type="hidden" name="save" value="0" />
                    <input type="hidden" name="returnTo" value="/account/favorites" />
                    <button className="text-brand underline" type="submit">
                      Remove from saved
                    </button>
                  </form>
                </article>
              );
            }
            const cover = listing.media
              .filter((item) => item.public_key)
              .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order)[0];
            return (
              <ListingCard
                key={listing.id}
                locale={settings.default_locale}
                listing={{
                  ...listing,
                  city_name: listing.city?.name ?? null,
                  locality_name: listing.locality?.name ?? null,
                  cover_key: cover?.public_key ?? null,
                  cover_alt: cover?.alt_text ?? null,
                }}
              />
            );
          })}
        </ListingGrid>
      )}
    </div>
  );
}
