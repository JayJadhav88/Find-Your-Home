import { publicImageUrl, tokens, type AreaUnit, type ListingCategory, type PriceDisplay, type PricePeriod } from "@fyh/shared";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CATEGORY_BADGE, displayPrice, roomsLine } from "@/lib/format";
import { env } from "@/lib/supabase";
import { Badge } from "./ui";

const { colors, spacing, radius, fontSize } = tokens;

/** Fields a card needs; search results and saved homes both fit (values may be empty). */
export interface CardListing {
  reference_code: string;
  title: string;
  category: ListingCategory;
  project_name: string | null;
  price_amount: number | null;
  currency: string | null;
  price_period: PricePeriod;
  price_display: PriceDisplay;
  bedrooms: number | null;
  bathrooms: number | null;
  area_value: number | null;
  area_unit: AreaUnit | null;
  is_featured: boolean;
  city_name: string | null;
  locality_name: string | null;
  cover_key: string | null;
  cover_alt: string | null;
  availability?: string | null;
  builder_name?: string | null;
  price_max?: number | null;
  distance_km?: number | null;
}

export function ListingCard({ listing, locale }: { listing: CardListing; locale: string }) {
  const place = [listing.locality_name, listing.city_name].filter(Boolean).join(", ");
  const facts = roomsLine(listing, locale);
  const price = displayPrice(listing, locale);
  return (
    <Link href={{ pathname: "/listing/[reference]", params: { reference: listing.reference_code } }} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${listing.title}, ${CATEGORY_BADGE[listing.category]}, ${price}${place ? `, ${place}` : ""}`}
        style={({ pressed }) => [styles.card, pressed ? { opacity: 0.9 } : null]}
      >
        <View style={styles.photo}>
          {listing.cover_key ? (
            <Image
              source={{ uri: publicImageUrl(env.supabaseUrl, listing.cover_key) }}
              alt={listing.cover_alt ?? ""}
              contentFit="cover"
              transition={150}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <Text style={styles.noPhoto}>No photo yet</Text>
          )}
          <View style={styles.badges}>
            <Badge label={CATEGORY_BADGE[listing.category]} />
            {listing.is_featured ? <Badge label="Featured" tone="success" /> : null}
            {listing.availability === "under_negotiation" ? <Badge label="Under negotiation" tone="warning" /> : null}
          </View>
        </View>
        <View style={styles.body}>
          <Text style={styles.price}>{price}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {listing.title}
          </Text>
          {listing.project_name ? (
            <Text style={styles.project}>
              {listing.project_name}
              {listing.builder_name ? <Text style={styles.muted}> by {listing.builder_name}</Text> : null}
            </Text>
          ) : null}
          {place || listing.distance_km != null ? (
            <Text style={styles.muted}>
              {place}
              {listing.distance_km != null
                ? `${place ? " · " : ""}${Number(listing.distance_km) < 1 ? "under 1" : Math.round(Number(listing.distance_km) * 10) / 10} km away`
                : ""}
            </Text>
          ) : null}
          {facts ? <Text style={styles.muted}>{facts}</Text> : null}
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  photo: { aspectRatio: 4 / 3, backgroundColor: colors.surfaceMuted, justifyContent: "center", alignItems: "center" },
  noPhoto: { color: colors.textMuted, fontSize: fontSize.sm },
  badges: { position: "absolute", top: spacing.sm, left: spacing.sm, flexDirection: "row", gap: spacing.xs },
  body: { padding: spacing.md, gap: 2 },
  price: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  title: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  project: { fontSize: fontSize.sm, fontWeight: "600", color: colors.brand },
  muted: { fontSize: fontSize.sm, color: colors.textMuted },
});
