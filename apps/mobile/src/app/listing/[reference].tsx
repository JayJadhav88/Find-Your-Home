import { getPublicListing, getSettings, isFavorite, publicImageUrl, recordListingView, setFavorite, tokens } from "@fyh/shared";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { EnquiryForm } from "@/components/enquiry-form";
import { LeadActions, leadQuestions } from "@/components/lead-actions";
import { ReportListing } from "@/components/report-listing";
import { Badge, Button, Card, ErrorState, Loading, Notice, text } from "@/components/ui";
import { VideoPlayer } from "@/components/video-player";
import { CATEGORY_BADGE, displayArea, displayPrice } from "@/lib/format";
import { useSession } from "@/lib/session";
import { env, supabase } from "@/lib/supabase";
import { useResource } from "@/lib/use-resource";
import { OffersRow } from "@/components/site-banners";

const { colors, spacing, fontSize, radius } = tokens;

const FURNISHING = { unfurnished: "Unfurnished", semi_furnished: "Semi-furnished", furnished: "Furnished" } as const;
const POSSESSION = { upcoming: "Upcoming launch", ready: "Ready to move in", under_construction: "Under construction", available_from_date: "Available from a date" } as const;

export default function ListingScreen() {
  const params = useLocalSearchParams<"/listing/[reference]">();
  const reference = Array.isArray(params.reference) ? (params.reference[0] ?? "") : (params.reference ?? "");
  const router = useRouter();
  const { viewer } = useSession();
  const { width } = useWindowDimensions();
  const { data, error, loading, reload } = useResource(async () => {
    const [listing, settings] = await Promise.all([getPublicListing(supabase, reference), getSettings(supabase)]);
    return { listing, settings };
  }, [reference]);

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const listing = data?.listing;
  useEffect(() => {
    if (viewer && listing) void isFavorite(supabase, viewer.id, listing.id).then(setSaved);
  }, [viewer, listing]);
  // One view per visitor per day for the owner's insights.
  const listingId = listing?.id;
  useEffect(() => {
    if (listingId) void recordListingView(supabase, listingId);
  }, [listingId]);

  if (loading && !data) return <Loading label="Loading property…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!listing || !data) {
    return <ErrorState message="This property is no longer listed." onRetry={() => router.back()} />;
  }

  const locale = data.settings.default_locale;
  const photos = listing.media
    .filter((item) => item.kind === "image" && item.public_key)
    .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order);
  const videos = [...listing.videos].sort((a, b) => a.sort_order - b.sort_order);
  const place = [listing.locality?.name, listing.city?.name].filter(Boolean).join(", ");
  const webUrl = `${env.siteUrl}/properties/${listing.reference_code}/${listing.slug}`;

  const facts: Array<[string, string | null]> = [
    ["Property type", listing.property_type?.name ?? null],
    ["Bedrooms", listing.bedrooms != null ? String(listing.bedrooms) : null],
    ["Bathrooms", listing.bathrooms != null ? String(listing.bathrooms) : null],
    ["Area", displayArea(listing.area_value, listing.area_unit, locale)],
    ["Built-up area", displayArea(listing.built_up_area, listing.area_unit, locale)],
    ["Carpet area", displayArea(listing.carpet_area, listing.area_unit, locale)],
    ["Parking", listing.parking_spaces != null ? String(listing.parking_spaces) : null],
    ["Floor", listing.floor_number != null ? `${listing.floor_number}${listing.total_floors != null ? ` of ${listing.total_floors}` : ""}` : null],
    ["Furnishing", listing.furnishing ? FURNISHING[listing.furnishing] : null],
    ["Availability", listing.possession_status ? POSSESSION[listing.possession_status] : null],
    ["Reference", listing.reference_code],
  ];

  async function toggleSaved() {
    if (!viewer) {
      router.push("/sign-in");
      return;
    }
    setSaving(true);
    try {
      await setFavorite(supabase, viewer.id, listing!.id, !saved);
      setSaved(!saved);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: spacing.xxl }}>
      <Stack.Screen options={{ title: listing.reference_code }} />
      {photos.length ? (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} accessibilityLabel={`${photos.length} photos`}>
          {photos.map((photo, index) => (
            <Image
              key={photo.id}
              source={{ uri: publicImageUrl(env.supabaseUrl, photo.public_key!) }}
              alt={photo.alt_text || `${listing.title} — photo ${index + 1}`}
              contentFit="cover"
              style={{ width, height: width * 0.72 }}
            />
          ))}
        </ScrollView>
      ) : (
        <View style={[styles.noPhoto, { height: width * 0.5 }]}>
          <Text style={text.muted}>No photos yet</Text>
        </View>
      )}

      <View style={styles.content}>
        <View style={styles.badges}>
          <Badge label={CATEGORY_BADGE[listing.category]} />
          {listing.is_featured ? <Badge label="Featured" tone="success" /> : null}
          {photos.length > 1 ? <Badge label={`${photos.length} photos — swipe`} tone="muted" /> : null}
        </View>
        <Text style={text.h1} accessibilityRole="header">
          {listing.title}
        </Text>
        {listing.project_name ? <Text style={styles.project}>{listing.project_name}</Text> : null}
        {place ? <Text style={text.muted}>{place}</Text> : null}
        <Text style={styles.price}>{displayPrice(listing, locale)}</Text>
        {listing.availability === "under_negotiation" ? <Notice tone="warning">Under negotiation: an offer is being discussed. You can still enquire.</Notice> : null}
        {listing.availability === "unavailable" ? <Notice tone="warning">This home is not available at the moment.</Notice> : null}
        {listing.price_negotiable ? <Text style={text.muted}>Negotiable</Text> : null}

        <View style={styles.actions}>
          <Button
            label={saved ? "♥ Saved" : viewer ? "♡ Save" : "Sign in to save"}
            variant="secondary"
            loading={saving}
            onPress={toggleSaved}
            accessibilityState={{ selected: saved }}
            style={{ flex: 1 }}
          />
          <Button label="Share" variant="secondary" onPress={() => Share.share({ message: `${listing.title} — ${webUrl}`, url: webUrl })} style={{ flex: 1 }} />
        </View>

        {listing.category === "new_project" ? (
          <Card style={{ gap: spacing.xs }}>
            <Text style={text.h2}>New project</Text>
            {listing.project_name ? <Fact label="Project" value={listing.project_name} /> : null}
            {listing.builder ? (
              <Pressable accessibilityRole="link" onPress={() => WebBrowser.openBrowserAsync(`${env.siteUrl}/builders/${listing.builder!.slug}`)}>
                <Fact label="Builder" value={`${listing.builder.name} ›`} />
              </Pressable>
            ) : null}
            {listing.configurations.length ? <Fact label="Configurations" value={listing.configurations.join(", ")} /> : null}
            {listing.possession_status ? (
              <Fact label="Construction" value={`${POSSESSION[listing.possession_status]}${listing.available_from ? ` (${listing.available_from})` : ""}`} />
            ) : null}
            {listing.launch_date ? <Fact label="Launch date" value={listing.launch_date} /> : null}
            {listing.project_registration_number ? (
              <Fact
                label="Registration (e.g. RERA)"
                value={`${listing.project_registration_number}${listing.registration_verified ? " · checked by our team" : " · not yet checked by us"}`}
              />
            ) : null}
            <Text style={text.muted}>Details come from the builder and can change. Confirm prices and approvals before deciding.</Text>
            {listing.builder?.website ? (
              <Pressable accessibilityRole="link" onPress={() => WebBrowser.openBrowserAsync(listing.builder!.website!)}>
                <Text style={text.link}>Builder website</Text>
              </Pressable>
            ) : null}
          </Card>
        ) : null}

        <Card style={{ gap: spacing.xs }}>
          <Text style={text.h2}>Key facts</Text>
          {facts.filter(([, value]) => value).map(([label, value]) => (
            <Fact key={label} label={label} value={value!} />
          ))}
        </Card>

        {listing.description ? (
          <View style={{ gap: spacing.xs }}>
            <Text style={text.h2}>About this property</Text>
            <Text style={text.body}>{listing.description}</Text>
          </View>
        ) : null}

        {listing.amenities.length ? (
          <View style={{ gap: spacing.xs }}>
            <Text style={text.h2}>Amenities</Text>
            <View style={styles.chips}>
              {listing.amenities.map((row) =>
                row.amenity ? (
                  <View key={row.amenity.id} style={styles.chip}>
                    <Text style={styles.chipText}>{row.amenity.name}</Text>
                  </View>
                ) : null,
              )}
            </View>
          </View>
        ) : null}

        {videos.length ? (
          <View style={{ gap: spacing.md }}>
            <Text style={text.h2}>Videos</Text>
            {videos.map((video, index) => (
              <VideoPlayer key={`${video.provider}-${video.video_id}`} video={video} label={`${listing.title} — video ${index + 1}`} />
            ))}
          </View>
        ) : null}

        {listing.address_visibility !== "hidden" && listing.public_lat != null && listing.public_lng != null ? (
          <Pressable
            accessibilityRole="link"
            onPress={() =>
              WebBrowser.openBrowserAsync(
                `https://www.openstreetmap.org/?mlat=${listing.public_lat}&mlon=${listing.public_lng}#map=15/${listing.public_lat}/${listing.public_lng}`,
              )
            }
          >
            <Text style={text.link}>Open the area on a map</Text>
          </Pressable>
        ) : null}

        <Card style={{ gap: spacing.md }}>
          <Text style={text.h2}>Contact the lister</Text>
          {listing.contact ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={text.body}>
                {listing.contact.display_name}
                {listing.contact.agency_name ? ` · ${listing.contact.agency_name}` : ""}
              </Text>
              <View style={styles.actions}>
                {listing.contact.phone ? (
                  <Button label="Call" variant="secondary" onPress={() => Linking.openURL(`tel:${listing.contact!.phone}`)} style={{ flex: 1 }} />
                ) : null}
                {listing.contact.whatsapp ? (
                  <Button
                    label="WhatsApp"
                    variant="secondary"
                    onPress={() => Linking.openURL(`https://wa.me/${listing.contact!.whatsapp!.replace(/\D/g, "")}`)}
                    style={{ flex: 1 }}
                  />
                ) : null}
                {listing.contact.email ? (
                  <Button label="Email" variant="secondary" onPress={() => Linking.openURL(`mailto:${listing.contact!.email}`)} style={{ flex: 1 }} />
                ) : null}
              </View>
              {!listing.contact.phone && !listing.contact.whatsapp && !listing.contact.email ? (
                <LeadActions
                  listingId={listing.id}
                  hasPhone={Boolean(listing.contact.has_phone)}
                  hasWhatsapp={Boolean(listing.contact.has_whatsapp)}
                  hasEmail={Boolean(listing.contact.has_email)}
                  hasBrochure={Boolean(listing.contact.has_brochure)}
                  questions={leadQuestions(data.settings.lead_questions)}
                  brandName={data.settings.brand_name}
                />
              ) : null}
            </View>
          ) : null}
          {listing.contact_via_form ? (
            <EnquiryForm listingId={listing.id} brandName={data.settings.brand_name} defaultName={viewer?.displayName} defaultEmail={viewer?.email} />
          ) : (
            <Notice>This lister prefers to be contacted directly.</Notice>
          )}
        </Card>
        <ReportListing listingId={listing.id} />
        <OffersRow />
      </View>
    </ScrollView>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={text.muted}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  noPhoto: { backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.md, gap: spacing.lg },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  project: { fontSize: fontSize.md, fontWeight: "600", color: colors.brand },
  price: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.text },
  actions: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  fact: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  factValue: { fontSize: fontSize.md, fontWeight: "600", color: colors.text, flexShrink: 1, textAlign: "right" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  chipText: { fontSize: fontSize.sm, color: colors.text },
});
