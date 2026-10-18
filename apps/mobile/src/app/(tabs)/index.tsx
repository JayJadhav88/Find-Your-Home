import {
  getSettings,
  getTaxonomy,
  searchListings,
  tokens,
  type ListingCategory,
  type SearchFilters,
  type SearchResultItem,
} from "@fyh/shared";
import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ListingCard } from "@/components/listing-card";
import { Button, EmptyState, ErrorState, Field, Loading, Segmented } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useResource } from "@/lib/use-resource";

const { colors, spacing, fontSize } = tokens;

const CATEGORIES: Array<{ value: ListingCategory | ""; label: string }> = [
  { value: "", label: "All" },
  { value: "rental", label: "Rent" },
  { value: "resale", label: "Resale" },
  { value: "new_project", label: "New projects" },
];
const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
] as const;
const BEDS = [
  { value: "", label: "Any" },
  { value: "1", label: "1+" },
  { value: "2", label: "2+" },
  { value: "3", label: "3+" },
  { value: "4", label: "4+" },
] as const;

export default function ExploreScreen() {
  const reference = useResource(async () => {
    const [settings, taxonomy] = await Promise.all([getSettings(supabase), getTaxonomy(supabase)]);
    return { settings, taxonomy };
  }, []);

  const [category, setCategory] = useState<ListingCategory | "">("");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [cityId, setCityId] = useState("");
  const [beds, setBeds] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState<"newest" | "price_asc" | "price_desc">("newest");
  const [showFilters, setShowFilters] = useState(false);

  const [items, setItems] = useState<SearchResultItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currency = reference.data?.settings.default_currency ?? reference.data?.taxonomy.currencies[0]?.code ?? null;
  const locale = reference.data?.settings.default_locale ?? "en";

  const filters = useCallback(
    (nextCursor?: string): SearchFilters => ({
      q: submittedQuery || undefined,
      category: category || undefined,
      purpose: undefined,
      type: undefined,
      location: cityId || undefined,
      currency: undefined,
      minPrice: undefined,
      maxPrice: maxPrice && Number(maxPrice) > 0 ? Number(maxPrice) : undefined,
      beds: beds ? Number(beds) : undefined,
      baths: undefined,
      minArea: undefined,
      maxArea: undefined,
      unit: undefined,
      amenities: undefined,
      furnishing: undefined,
      featured: false,
      recent: undefined,
      sort,
      cursor: nextCursor,
    }),
    [submittedQuery, category, cityId, maxPrice, beds, sort],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await searchListings(supabase, filters(), { currency });
      setItems(page.items);
      setCursor(page.nextCursor);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }, [filters, currency]);

  // Run the search whenever the filters change (state is set only when results arrive).
  useEffect(() => {
    if (reference.loading) return;
    let active = true;
    searchListings(supabase, filters(), { currency })
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setError(null);
      })
      .catch((failure: unknown) => active && setError(failure instanceof Error ? failure.message : "Search failed."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [filters, currency, reference.loading]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await searchListings(supabase, filters(cursor), { currency });
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      // Keep what is shown; the user can scroll again to retry.
    } finally {
      setLoadingMore(false);
    }
  }

  if (reference.loading && !reference.data) return <Loading label="Loading homes…" />;
  if (reference.error) return <ErrorState message={reference.error} onRetry={reference.reload} />;

  const cities = (reference.data?.taxonomy.locations ?? []).filter((location) => location.level === "city");

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={loading && items.length > 0} onRefresh={load} tintColor={colors.brand} />}
      onEndReachedThreshold={0.5}
      onEndReached={loadMore}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.heading}>Find a home</Text>
          <Segmented label="Category" value={category} options={CATEGORIES} onChange={(value) => setCategory(value as ListingCategory | "")} />
          <Field
            label="Search"
            placeholder="Keyword, e.g. garden or balcony"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onSubmitEditing={() => setSubmittedQuery(query.trim())}
          />
          <View style={styles.row}>
            <Button label={showFilters ? "Hide filters" : "Filters"} variant="secondary" onPress={() => setShowFilters((value) => !value)} style={{ flex: 1 }} />
            <Button label="Search" onPress={() => setSubmittedQuery(query.trim())} style={{ flex: 1 }} />
          </View>
          {showFilters ? (
            <View style={styles.filters}>
              {cities.length ? (
                <Segmented
                  label="City"
                  value={cityId}
                  options={[{ value: "", label: "Any" }, ...cities.map((city) => ({ value: city.id, label: city.name }))]}
                  onChange={setCityId}
                />
              ) : null}
              <Segmented label="Bedrooms" value={beds} options={[...BEDS]} onChange={setBeds} />
              <Field
                label={`Maximum price${currency ? ` (${currency})` : ""}`}
                keyboardType="numeric"
                value={maxPrice}
                onChangeText={(value) => setMaxPrice(value.replace(/[^\d]/g, ""))}
                placeholder="Any"
              />
              <Segmented label="Sort by" value={sort} options={[...SORTS]} onChange={(value) => setSort((value || "newest") as typeof sort)} />
            </View>
          ) : null}
          {error ? <ErrorState message={error} onRetry={load} /> : null}
          {!error && !loading ? (
            <Text style={styles.count} accessibilityLiveRegion="polite">
              {items.length ? `${items.length}${cursor ? "+" : ""} home${items.length === 1 && !cursor ? "" : "s"}` : ""}
            </Text>
          ) : null}
        </View>
      }
      renderItem={({ item }) => <ListingCard listing={item} locale={locale} />}
      ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      ListEmptyComponent={
        loading ? (
          <Loading label="Finding homes…" />
        ) : error ? undefined : (
          <EmptyState title="No homes match" message="Try another category, city or a higher price." />
        )
      }
      ListFooterComponent={loadingMore ? <Loading label="Loading more…" /> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, paddingBottom: spacing.xxl },
  header: { gap: spacing.md, marginBottom: spacing.md },
  heading: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.text },
  row: { flexDirection: "row", gap: spacing.sm },
  filters: { gap: spacing.md, backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  count: { fontSize: fontSize.sm, color: colors.textMuted },
});
