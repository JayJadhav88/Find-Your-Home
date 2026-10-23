import { parseSearchParams, searchFiltersToQuery, searchFiltersToRpcArgs, type SearchFilters } from "@fyh/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ListingCard, ListingGrid } from "@/components/listing-card";
import { NearField } from "@/components/near-field";
import { SaveSearch } from "@/components/save-search";
import { Alert, Button, ButtonLink, EmptyState, Select, TextInput } from "@/components/ui";
import { AREA_UNIT_LABEL, FURNISHING_LABEL } from "@/lib/listing-format";
import { getBuilders, getSiteSettings, getTaxonomy, type Taxonomy } from "@/lib/public-data";
import { createPublicClient } from "@/lib/supabase";
import { daysAgoMs } from "@/lib/time";

const PAGE_SIZE = 24;

export const metadata: Metadata = {
  title: "Search homes",
  // Filter combinations are not indexed; curated landing pages are.
  robots: { index: false, follow: true },
};

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold sm:text-3xl">Search homes</h1>
      <Suspense fallback={<p className="mt-6 text-text-muted">Loading homes…</p>}>
        {searchParams.then((params) => (
          <SearchContent filters={parseSearchParams(params)} />
        ))}
      </Suspense>
    </div>
  );
}

async function SearchContent({ filters }: { filters: SearchFilters }) {
  // Results and "New" badges depend on the current time: always render per request.
  await connection();
  const [settings, taxonomy, builders] = await Promise.all([getSiteSettings(), getTaxonomy(), getBuilders()]);
  const currency = filters.currency ?? settings.default_currency ?? taxonomy.currencies[0]?.code ?? null;
  const { data, error } = await createPublicClient().rpc(
    "search_listings",
    searchFiltersToRpcArgs(filters, { currency, pageSize: PAGE_SIZE }),
  );

  const rows = data ?? [];
  const page = rows.slice(0, PAGE_SIZE);
  const nextCursor = rows.length > PAGE_SIZE ? page.at(-1)?.cursor : undefined;
  const newSince = daysAgoMs(settings.new_listing_days);

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[18rem_1fr]">
      <FilterForm filters={filters} taxonomy={taxonomy} currency={currency} builders={builders} radiusOptions={settings.radius_options} />
      <section aria-labelledby="results-heading" aria-live="polite">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="results-heading" className="text-lg font-semibold">
            {error ? "Search unavailable" : page.length ? `Showing ${page.length} home${page.length === 1 ? "" : "s"}` : "No matches"}
          </h2>
          <SortLinks filters={filters} />
        </div>
        <div className="mb-4">
          <SaveSearch query={searchFiltersToQuery({ ...filters, cursor: undefined })} />
        </div>
        {error ? (
          <Alert tone="danger" title="We couldn't run that search">
            {error.code === "22023" ? error.message : "Please try again in a moment."}
          </Alert>
        ) : page.length ? (
          <ListingGrid>
            {page.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                locale={settings.default_locale}
                isNew={Boolean(listing.first_published_at && Date.parse(listing.first_published_at) > newSince)}
              />
            ))}
          </ListingGrid>
        ) : (
          <EmptyState
            title="No homes match these filters"
            action={
              <ButtonLink href="/search" variant="secondary">
                Clear all filters
              </ButtonLink>
            }
          >
            Try a wider price range, fewer bedrooms or another area.
          </EmptyState>
        )}
        <nav aria-label="Pages" className="mt-6 flex flex-wrap justify-between gap-3">
          {filters.cursor ? (
            <ButtonLink variant="secondary" href={`/search?${searchFiltersToQuery({ ...filters, cursor: undefined })}`}>
              Back to first page
            </ButtonLink>
          ) : (
            <span />
          )}
          {nextCursor ? (
            <ButtonLink href={`/search?${searchFiltersToQuery({ ...filters, cursor: nextCursor })}`}>Next page</ButtonLink>
          ) : null}
        </nav>
      </section>
    </div>
  );
}

const SORTS = [
  ["newest", "Newest"],
  ["price_asc", "Price: low to high"],
  ["price_desc", "Price: high to low"],
  ["relevance", "Best match"],
  ["distance", "Nearest"],
] as const;

function SortLinks({ filters }: { filters: SearchFilters }) {
  const available = SORTS.filter(([value]) => (value !== "relevance" || filters.q) && (value !== "distance" || filters.lat !== undefined));
  return (
    <nav aria-label="Sort" className="flex flex-wrap gap-1 text-sm">
      {available.map(([value, label]) => {
        const active = filters.sort === value;
        return (
          <Link
            key={value}
            href={`/search?${searchFiltersToQuery({ ...filters, sort: value, cursor: undefined })}`}
            aria-current={active ? "true" : undefined}
            className={active ? "rounded-lg bg-brand-soft px-3 py-2 font-semibold text-brand" : "rounded-lg px-3 py-2 hover:bg-surface"}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function FilterForm({
  filters,
  taxonomy,
  currency,
  builders,
  radiusOptions,
}: {
  filters: SearchFilters;
  taxonomy: Taxonomy;
  currency: string | null;
  builders: Array<{ id: string; name: string }>;
  radiusOptions: number[];
}) {
  const places = taxonomy.locations.filter((location) => location.level !== "country" || taxonomy.locations.length < 50);
  const field = "flex flex-col gap-1 text-sm font-medium";
  return (
    <form action="/search" className="flex flex-col gap-4 self-start rounded-xl border border-border bg-surface p-4" aria-label="Filters">
      <label className={field}>
        Keyword
        <TextInput bare name="q" defaultValue={filters.q} placeholder="e.g. garden" />
      </label>
      <label className={field}>
        Category
        <Select bare name="category" defaultValue={filters.category ?? ""}>
          <option value="">Any</option>
          <option value="rental">Rent</option>
          <option value="resale">Resale</option>
          <option value="new_project">New projects</option>
        </Select>
      </label>
      {filters.purpose ? <input type="hidden" name="purpose" value={filters.purpose} /> : null}
      <NearField radiusOptions={radiusOptions} initial={{ lat: filters.lat, lng: filters.lng, radius: filters.radius, near: filters.near }} />
      <label className={field}>
        PIN code
        <TextInput bare name="pin" defaultValue={filters.pin} inputMode="numeric" maxLength={10} placeholder="e.g. 411045" />
      </label>
      <label className={field}>
        Area
        <Select bare name="location" defaultValue={filters.location ?? ""}>
          <option value="">Anywhere</option>
          {places.map((place) => (
            <option key={place.id} value={place.id}>
              {place.level === "locality" ? `— ${place.name}` : place.name}
            </option>
          ))}
        </Select>
      </label>
      <label className={field}>
        Property type
        <Select bare name="type" defaultValue={filters.type?.[0] ?? ""}>
          <option value="">Any type</option>
          {taxonomy.propertyTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </Select>
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">Price{currency ? ` (${currency})` : ""}</legend>
        <div className="grid grid-cols-2 gap-2">
          <TextInput name="minPrice" inputMode="numeric" aria-label="Minimum price" placeholder="Min" defaultValue={filters.minPrice} />
          <TextInput name="maxPrice" inputMode="numeric" aria-label="Maximum price" placeholder="Max" defaultValue={filters.maxPrice} />
        </div>
        {taxonomy.currencies.length > 1 ? (
          <Select name="currency" aria-label="Currency" defaultValue={currency ?? ""} className="mt-2">
            {taxonomy.currencies.map((option) => (
              <option key={option.code} value={option.code}>
                {option.code}
              </option>
            ))}
          </Select>
        ) : null}
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        <label className={field}>
          Bedrooms
          <Select bare name="beds" defaultValue={filters.beds?.toString() ?? ""}>
            <option value="">Any</option>
            {[1, 2, 3, 4, 5].map((count) => (
              <option key={count} value={count}>
                {count}+
              </option>
            ))}
          </Select>
        </label>
        <label className={field}>
          Bathrooms
          <Select bare name="baths" defaultValue={filters.baths?.toString() ?? ""}>
            <option value="">Any</option>
            {[1, 2, 3, 4].map((count) => (
              <option key={count} value={count}>
                {count}+
              </option>
            ))}
          </Select>
        </label>
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">Size</legend>
        <div className="grid grid-cols-2 gap-2">
          <TextInput name="minArea" inputMode="numeric" aria-label="Minimum size" placeholder="Min" defaultValue={filters.minArea} />
          <TextInput name="maxArea" inputMode="numeric" aria-label="Maximum size" placeholder="Max" defaultValue={filters.maxArea} />
        </div>
        <Select name="unit" aria-label="Size unit" defaultValue={filters.unit ?? "sq_m"} className="mt-2">
          {Object.entries(AREA_UNIT_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </fieldset>
      {builders.length ? (
        <label className={field}>
          Builder
          <Select bare name="builder" defaultValue={filters.builder ?? ""}>
            <option value="">Any builder</option>
            {builders.map((builder) => (
              <option key={builder.id} value={builder.id}>{builder.name}</option>
            ))}
          </Select>
        </label>
      ) : null}
      <label className={field}>
        Construction
        <Select bare name="construction" defaultValue={filters.construction ?? ""}>
          <option value="">Any</option>
          <option value="upcoming">Upcoming launch</option>
          <option value="under_construction">Under construction</option>
          <option value="ready">Ready to move</option>
        </Select>
      </label>
      <label className={field}>
        Furnishing
        <Select bare name="furnishing" defaultValue={filters.furnishing ?? ""}>
          <option value="">Any</option>
          {Object.entries(FURNISHING_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </label>
      <label className={field}>
        Car parking
        <Select bare name="parking" defaultValue={filters.parking?.toString() ?? ""}>
          <option value="">Any</option>
          <option value="1">At least 1</option>
          <option value="2">At least 2</option>
          <option value="3">At least 3</option>
        </Select>
      </label>
      {taxonomy.amenities.length ? (
        <fieldset>
          <legend className="text-sm font-medium">Must have</legend>
          <div className="mt-1 flex max-h-48 flex-col overflow-y-auto">
            {taxonomy.amenities.map((amenity) => (
              <label key={amenity.id} className="flex min-h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="amenities"
                  value={amenity.id}
                  defaultChecked={filters.amenities?.includes(amenity.id)}
                  className="size-4 accent-[var(--fyh-brand)]"
                />
                {amenity.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <label className="flex min-h-9 items-center gap-2 text-sm">
        <input type="checkbox" name="featured" value="1" defaultChecked={filters.featured} className="size-4 accent-[var(--fyh-brand)]" />
        Featured only
      </label>
      <label className="flex min-h-9 items-center gap-2 text-sm">
        <input type="checkbox" name="photos" value="1" defaultChecked={filters.photos} className="size-4 accent-[var(--fyh-brand)]" />
        With photos only
      </label>
      <Select name="recent" aria-label="Listed within" defaultValue={filters.recent?.toString() ?? ""}>
        <option value="">Listed any time</option>
        <option value="1">Last 24 hours</option>
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
      </Select>
      {filters.sort !== "newest" ? <input type="hidden" name="sort" value={filters.sort} /> : null}
      <Button type="submit">Show homes</Button>
      <Link href="/search" className="text-center text-sm text-brand underline">
        Clear filters
      </Link>
    </form>
  );
}
