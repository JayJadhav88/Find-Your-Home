import { ListingCard, ListingGrid } from "@/components/listing-card";
import { Button, EmptyState, Select, TextInput } from "@/components/ui";
import { getHomeListings, getSiteSettings, getTaxonomy } from "@/lib/public-data";

export default async function HomePage() {
  const [settings, taxonomy, { featured, recent }] = await Promise.all([
    getSiteSettings(),
    getTaxonomy(),
    getHomeListings(),
  ]);
  const cities = taxonomy.locations.filter((location) => location.level === "city");

  return (
    <>
      <section className="bg-brand text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <h1 className="max-w-2xl text-3xl font-semibold leading-tight sm:text-5xl">Find a home that fits your life.</h1>
          <p className="mt-3 max-w-xl text-lg text-white/85">
            Browse homes for sale and rent, save the ones you like, and contact the lister directly.
          </p>
          <form action="/search" className="mt-8 grid gap-3 rounded-xl bg-surface p-4 text-text sm:grid-cols-[1fr_auto_auto_auto]">
            <label className="sr-only" htmlFor="home-q">
              Keyword
            </label>
            <TextInput id="home-q" name="q" placeholder="Keyword, e.g. garden or balcony" />
            <label className="sr-only" htmlFor="home-purpose">
              Buy or rent
            </label>
            <Select id="home-purpose" name="purpose" defaultValue="">
              <option value="">Buy or rent</option>
              <option value="sale">Buy</option>
              <option value="rent">Rent</option>
            </Select>
            <label className="sr-only" htmlFor="home-location">
              City
            </label>
            <Select id="home-location" name="location" defaultValue="">
              <option value="">Any city</option>
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </Select>
            <Button type="submit">Search</Button>
          </form>
        </div>
      </section>

      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-12">
        {featured.length ? (
          <section aria-labelledby="featured-heading">
            <h2 id="featured-heading" className="mb-4 text-2xl font-semibold">
              Featured homes
            </h2>
            <ListingGrid>
              {featured.map((listing) => (
                <ListingCard key={listing.id} listing={listing} locale={settings.default_locale} />
              ))}
            </ListingGrid>
          </section>
        ) : null}

        <section aria-labelledby="recent-heading">
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 id="recent-heading" className="text-2xl font-semibold">
              Recently listed
            </h2>
            <a href="/search" className="text-sm font-medium text-brand underline">
              See all homes
            </a>
          </div>
          {recent.length ? (
            <ListingGrid>
              {recent.map((listing) => (
                <ListingCard key={listing.id} listing={listing} locale={settings.default_locale} />
              ))}
            </ListingGrid>
          ) : (
            <EmptyState title="No homes listed yet">Check back soon, or list your own property.</EmptyState>
          )}
        </section>
      </div>
    </>
  );
}
