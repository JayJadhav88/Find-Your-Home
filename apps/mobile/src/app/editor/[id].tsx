import {
  createListing,
  fieldErrors,
  formatReviewTime,
  getListingHistory,
  getOwnListing,
  getSettings,
  getTaxonomy,
  listingFormSchema,
  listingWorkflow,
  removePhoto,
  setCoverPhoto,
  setListingAvailability,
  tokens,
  updateListing,
  videoWatchUrl,
  viewerIsBuilder,
} from "@fyh/shared";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Badge, Button, Card, ErrorState, Field, Loading, Notice, Segmented, text } from "@/components/ui";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/format";
import { pickPhotos, uploadPhoto, type PhotoSource } from "@/lib/photos";
import { useSession } from "@/lib/session";
import { setUpPush } from "@/lib/push";
import { supabase } from "@/lib/supabase";
import { useResource } from "@/lib/use-resource";

const { colors, spacing, radius, fontSize } = tokens;

type Values = Record<string, string | boolean | string[]>;

const HELP: Record<string, string> = {
  draft: "Only you can see this draft. Add photos and details, then submit it for review.",
  pending_review: "A moderator is reviewing this listing. Withdraw it if you need to make changes.",
  published: "This listing is live. Changing the price, location, size, rooms or photos sends it back to review.",
  rejected: "This listing needs changes before it can go live. Update it and submit it again.",
  suspended: "A moderator has taken this listing offline.",
  archived: "Archived and hidden from search.",
  sold: "Marked as sold and hidden from search.",
  rented: "Marked as rented and hidden from search.",
};

export default function EditorScreen() {
  const params = useLocalSearchParams<"/editor/[id]">();
  const routeId = Array.isArray(params.id) ? (params.id[0] ?? "new") : (params.id ?? "new");
  const router = useRouter();
  const { viewer } = useSession();
  const [listingId, setListingId] = useState<string | null>(routeId === "new" ? null : routeId);

  const reference = useResource(async () => {
    const [settings, taxonomy] = await Promise.all([getSettings(supabase), getTaxonomy(supabase)]);
    return { settings, taxonomy };
  }, []);
  const reviewHours = reference.data?.settings.review_hours_target ?? 12;
  const existing = useResource(async () => {
    if (!listingId) return null;
    const [listing, history] = await Promise.all([getOwnListing(supabase, listingId), getListingHistory(supabase, listingId)]);
    return { listing, history };
  }, [listingId]);

  const [values, setValues] = useState<Values>({ category: "resale", contactViaForm: true, addressVisibility: "approximate", priceDisplay: "show" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "success" | "danger" | "warning"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const canNewProject = viewerIsBuilder(viewer);
  const listing = existing.data?.listing ?? null;

  // Fill the form from the server copy whenever it changes (React's "adjust state when a
  // prop changes" pattern, during render instead of in an effect).
  const sourceKey = listing ? `${listing.id}:${listing.updated_at}` : `new:${canNewProject}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  if (sourceKey !== loadedKey) {
    setLoadedKey(sourceKey);
    if (listing) setValues(valuesFromListing(listing));
    else if (!listingId && canNewProject) setValues((current) => ({ ...current, category: "new_project" }));
  }

  const taxonomy = reference.data?.taxonomy;
  const set = (key: string) => (value: string | boolean | string[]) => setValues((current) => ({ ...current, [key]: value }));
  const v = (key: string) => (typeof values[key] === "string" ? (values[key] as string) : "");

  const places = useMemo(() => {
    const all = taxonomy?.locations ?? [];
    const countries = all.filter((l) => l.level === "country");
    const regions = all.filter((l) => l.level === "region" && l.parent_id === v("countryId"));
    const cityParents = new Set(v("regionId") ? [v("regionId")] : [v("countryId"), ...regions.map((r) => r.id)]);
    const cities = all.filter((l) => l.level === "city" && l.parent_id !== null && cityParents.has(l.parent_id));
    const localities = all.filter((l) => l.level === "locality" && l.parent_id === v("cityId"));
    return { countries, regions, cities, localities };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxonomy, values.countryId, values.regionId, values.cityId]);

  if (reference.loading || (listingId && existing.loading && !existing.data)) return <Loading />;
  if (reference.error) return <ErrorState message={reference.error} onRetry={reference.reload} />;
  if (existing.error) return <ErrorState message={existing.error} onRetry={existing.reload} />;
  if (listingId && !listing) return <ErrorState message="This listing is not available." />;
  if (!viewer || !taxonomy || !reference.data) return <Loading />;

  const status = listing?.status ?? "draft";
  const editable = !listing || ["draft", "rejected", "published"].includes(status);
  const lastReason = existing.data?.history?.find((event) => event.to_status === "rejected" || event.to_status === "suspended")?.reason;
  const photos = [...(listing?.media ?? [])].filter((m) => m.kind === "image").sort((a, b) => a.sort_order - b.sort_order);

  async function save() {
    const parsed = listingFormSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setNotice({ tone: "danger", text: "Please check the highlighted fields." });
      return;
    }
    if (parsed.data.category === "new_project" && !canNewProject) {
      setErrors({ category: "Only verified builders can list new projects" });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      if (!listingId) {
        const id = await createListing(supabase, viewer!.id, parsed.data);
        setListingId(id);
        router.setParams({ id });
        setNotice({ tone: "success", text: "Draft saved. Add photos below, then submit it for review." });
      } else {
        const newStatus = await updateListing(supabase, listingId, parsed.data);
        await existing.reload();
        setNotice({
          tone: "success",
          text: newStatus === "pending_review" && status === "published" ? "Saved. Important details changed, so the listing is back in review." : "Saved.",
        });
      }
    } catch (failure) {
      setNotice({ tone: "danger", text: failure instanceof Error ? failure.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  }

  async function workflow(action: Parameters<typeof listingWorkflow>[2], success: string) {
    if (!listingId) return;
    setBusy(action);
    try {
      await listingWorkflow(supabase, listingId, action);
      await existing.reload();
      setNotice({ tone: "success", text: success });
      // Good moment to offer notifications: the owner is waiting for a decision.
      if (action === "submit") void setUpPush({ ask: true });
    } catch (failure) {
      setNotice({ tone: "danger", text: failure instanceof Error ? failure.message : "That didn't work." });
    } finally {
      setBusy(null);
    }
  }

  async function addPhotos(source: PhotoSource) {
    if (!listingId) return;
    const max = reference.data!.settings.max_images_per_listing;
    try {
      const picked = await pickPhotos(source, max - photos.length);
      if (!picked.length) return;
      setBusy("photos");
      let order = photos.length ? Math.max(...photos.map((p) => p.sort_order)) + 1 : 0;
      let hasCover = photos.some((p) => p.is_cover);
      for (const photo of picked.slice(0, max - photos.length)) {
        await uploadPhoto(listingId, photo, !hasCover, order++);
        hasCover = true;
      }
      await existing.reload();
      setNotice({ tone: "success", text: status === "published" ? "Photos added. Photo changes send a live listing back to review." : "Photos added." });
    } catch (failure) {
      setNotice({ tone: "danger", text: failure instanceof Error ? failure.message : "Could not add photos." });
    } finally {
      setBusy(null);
    }
  }

  const actions: Array<{ action: Parameters<typeof listingWorkflow>[2]; label: string; success: string; variant?: "primary" | "secondary" | "danger"; confirm?: string }> = [];
  if (status === "draft" || status === "rejected") actions.push({ action: "submit", label: "Submit for review", success: `Submitted. Listings are usually reviewed within ${formatReviewTime(reviewHours)}; we'll notify you.`, variant: "primary" });
  if (status === "pending_review") actions.push({ action: "withdraw", label: "Withdraw to edit", success: "Withdrawn. The listing is a draft again." });
  if (status === "published") {
    const sale = listing?.purpose === "sale";
    actions.push({ action: sale ? "sold" : "rented", label: sale ? "Mark as sold" : "Mark as rented", success: "Removed from search.", confirm: "This removes the listing from search." });
  }
  if (listing && !["archived", "suspended"].includes(status)) actions.push({ action: "archived", label: "Archive", success: "Archived.", variant: "danger", confirm: "Archive this listing? It will be hidden from search." });
  if (["archived", "sold", "rented"].includes(status)) actions.push({ action: "restore", label: "Restore as draft", success: "Restored as a draft." });

  const cats = [
    { value: "rental", label: "Rental" },
    { value: "resale", label: "Resale" },
    ...(canNewProject || v("category") === "new_project" ? [{ value: "new_project", label: "New project" }] : []),
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: listing ? listing.reference_code : "New listing" }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

        {listing ? (
          <Card style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text style={text.muted}>Status</Text>
              <Badge label={STATUS_LABEL[status] ?? status} tone={STATUS_TONE[status] ?? "muted"} />
            </View>
            <Text style={text.body}>
              {status === "pending_review"
                ? `A moderator is reviewing this listing. Listings are usually reviewed within ${formatReviewTime(reviewHours)}; we'll notify you. Withdraw it if you need to make changes.`
                : HELP[status]}
            </Text>
            {status === "published" && listing ? <AvailabilityControl listingId={listing.id} value={listing.availability} onChanged={existing.reload} onError={(message) => setNotice({ tone: "danger", text: message })} /> : null}
            {lastReason && (status === "rejected" || status === "suspended") ? <Notice tone="warning" title="Note from our moderators">{lastReason}</Notice> : null}
            {actions.map((item) => (
              <Button
                key={item.action}
                label={item.label}
                variant={item.variant ?? "secondary"}
                loading={busy === item.action}
                onPress={() =>
                  item.confirm
                    ? Alert.alert(item.label, item.confirm, [{ text: "Cancel", style: "cancel" }, { text: item.label, style: "destructive", onPress: () => workflow(item.action, item.success) }])
                    : workflow(item.action, item.success)
                }
              />
            ))}
          </Card>
        ) : (
          <Notice>Save a draft first, then add photos and submit it for review. Nothing is public until a moderator approves it.</Notice>
        )}

        {listingId ? (
          <Card style={{ gap: spacing.sm }}>
            <Text style={text.h2}>Photos ({photos.length}/{reference.data.settings.max_images_per_listing})</Text>
            {photos.length === 0 ? <Text style={text.muted}>Add at least one photo. The first one becomes the cover.</Text> : null}
            <PhotoGrid
              listingId={listingId}
              photos={photos}
              editable={editable}
              onChanged={existing.reload}
              onError={(message) => setNotice({ tone: "danger", text: message })}
            />
            {editable ? (
              <View style={styles.row}>
                <Button label="Choose photos" variant="secondary" loading={busy === "photos"} onPress={() => addPhotos("library")} style={{ flex: 1 }} />
                {Platform.OS !== "web" ? <Button label="Take photo" variant="secondary" onPress={() => addPhotos("camera")} style={{ flex: 1 }} /> : null}
              </View>
            ) : null}
          </Card>
        ) : null}

        {editable ? (
          <>
            <Card style={styles.section}>
              <Text style={text.h2}>Basics</Text>
              <Segmented label="Category" value={v("category")} options={cats} onChange={set("category")} />
              {errors.category ? <Text style={styles.error}>{errors.category}</Text> : null}
              {!canNewProject ? <Text style={text.muted}>New projects can only be listed by verified builders.</Text> : null}
              <Field label="Title" required value={v("title")} onChangeText={set("title")} error={errors.title} maxLength={140} />
              {v("category") === "new_project" ? (
                <>
                  <Field label="Project name" required value={v("projectName")} onChangeText={set("projectName")} error={errors.projectName} />
                  <Field label="Project registration number" value={v("projectRegistrationNumber")} onChangeText={set("projectRegistrationNumber")} hint="Optional. Our team checks it before showing it as checked." />
                  <Field label="Configurations" value={v("configurations")} onChangeText={set("configurations")} error={errors.configurations} hint="Comma-separated, e.g. 2 BHK, 3 BHK, 4 BHK penthouse." maxLength={400} />
                  <Field label="Launch date" value={v("launchDate")} onChangeText={set("launchDate")} error={errors.launchDate} hint="Optional, as YYYY-MM-DD." keyboardType="numbers-and-punctuation" maxLength={10} />
                </>
              ) : null}
              <Segmented
                label="Property type"
                value={v("propertyTypeId")}
                options={taxonomy.propertyTypes.map((type) => ({ value: type.id, label: type.name }))}
                onChange={set("propertyTypeId")}
              />
              <Field label="Description" multiline value={v("description")} onChangeText={set("description")} error={errors.description} hint="At least 30 characters before you can submit." />
            </Card>

            <Card style={styles.section}>
              <Text style={text.h2}>Price</Text>
              <Segmented label="Show price" value={v("priceDisplay")} options={[{ value: "show", label: "Show" }, { value: "on_request", label: "On request" }]} onChange={set("priceDisplay")} />
              <Field label={v("category") === "rental" ? "Rent" : "Price"} keyboardType="decimal-pad" value={v("priceAmount")} onChangeText={set("priceAmount")} error={errors.priceAmount} />
              <Segmented label="Currency" value={v("currency") || reference.data.settings.default_currency || ""} options={taxonomy.currencies.map((c) => ({ value: c.code, label: c.code }))} onChange={set("currency")} />
              {errors.currency ? <Text style={styles.error}>{errors.currency}</Text> : null}
              <Segmented
                label="Price applies"
                value={v("pricePeriod") || (v("category") === "rental" ? "per_month" : "total")}
                options={[
                  { value: "total", label: "Total" },
                  { value: "per_month", label: "Per month" },
                  { value: "per_year", label: "Per year" },
                ]}
                onChange={set("pricePeriod")}
              />
              {v("category") === "new_project" ? (
                <Field label="Price up to" keyboardType="decimal-pad" value={v("priceMax")} onChangeText={set("priceMax")} error={errors.priceMax} hint="Optional: top of the price range. The price above is the starting price." />
              ) : null}
              <ToggleRow label="Price is negotiable" value={values.priceNegotiable === true} onChange={set("priceNegotiable")} />
            </Card>

            <Card style={styles.section}>
              <Text style={text.h2}>Location</Text>
              <Segmented label="Country" value={v("countryId")} options={places.countries.map((p) => ({ value: p.id, label: p.name }))} onChange={(value) => setValues((c) => ({ ...c, countryId: value, regionId: "", cityId: "", localityId: "" }))} />
              {places.regions.length ? (
                <Segmented label="Region" value={v("regionId")} options={[{ value: "", label: "Any" }, ...places.regions.map((p) => ({ value: p.id, label: p.name }))]} onChange={(value) => setValues((c) => ({ ...c, regionId: value, cityId: "", localityId: "" }))} />
              ) : null}
              {places.cities.length ? (
                <Segmented label="City" value={v("cityId")} options={places.cities.map((p) => ({ value: p.id, label: p.name }))} onChange={(value) => setValues((c) => ({ ...c, cityId: value, localityId: "" }))} />
              ) : null}
              {places.localities.length ? (
                <Segmented label="Neighbourhood" value={v("localityId")} options={[{ value: "", label: "None" }, ...places.localities.map((p) => ({ value: p.id, label: p.name }))]} onChange={set("localityId")} />
              ) : null}
              <View style={styles.row}>
                <View style={{ flex: 1 }}><Field label="PIN code" keyboardType="number-pad" value={v("postalCode")} onChangeText={set("postalCode")} error={errors.postalCode} maxLength={20} /></View>
                <View style={{ flex: 2 }}><Field label="Nearby landmark" value={v("landmark")} onChangeText={set("landmark")} error={errors.landmark} hint="Optional, e.g. near City Mall. Shown to visitors." maxLength={120} /></View>
              </View>
              <Field label="Street address" value={v("streetAddress")} onChangeText={set("streetAddress")} hint="Private: never shown publicly." autoComplete="street-address" />
              <Segmented
                label="Location shown to visitors"
                value={v("addressVisibility")}
                options={[
                  { value: "approximate", label: "Area only" },
                  { value: "exact", label: "Map pin" },
                  { value: "hidden", label: "City only" },
                ]}
                onChange={set("addressVisibility")}
              />
            </Card>

            <Card style={styles.section}>
              <Text style={text.h2}>Size and rooms</Text>
              <Segmented label="Area unit" value={v("areaUnit") || reference.data.settings.default_area_unit} options={[{ value: "sq_m", label: "m²" }, { value: "sq_ft", label: "sq ft" }, { value: "acre", label: "acres" }]} onChange={set("areaUnit")} />
              {errors.areaUnit ? <Text style={styles.error}>{errors.areaUnit}</Text> : null}
              <View style={styles.row}>
                <View style={{ flex: 1 }}><Field label="Area" keyboardType="decimal-pad" value={v("areaValue")} onChangeText={set("areaValue")} error={errors.areaValue} /></View>
                <View style={{ flex: 1 }}><Field label="Bedrooms" keyboardType="number-pad" value={v("bedrooms")} onChangeText={set("bedrooms")} error={errors.bedrooms} /></View>
              </View>
              <View style={styles.row}>
                <View style={{ flex: 1 }}><Field label="Bathrooms" keyboardType="number-pad" value={v("bathrooms")} onChangeText={set("bathrooms")} error={errors.bathrooms} /></View>
                <View style={{ flex: 1 }}><Field label="Parking" keyboardType="number-pad" value={v("parkingSpaces")} onChangeText={set("parkingSpaces")} error={errors.parkingSpaces} /></View>
              </View>
              <Segmented label="Furnishing" value={v("furnishing")} options={[{ value: "", label: "—" }, { value: "unfurnished", label: "Unfurnished" }, { value: "semi_furnished", label: "Semi" }, { value: "furnished", label: "Furnished" }]} onChange={set("furnishing")} />
              <Segmented label="Availability" value={v("possessionStatus")} options={[{ value: "", label: "—" }, { value: "upcoming", label: "Upcoming" }, { value: "under_construction", label: "Under construction" }, { value: "ready", label: "Ready" }]} onChange={set("possessionStatus")} />
            </Card>

            {taxonomy.amenities.length ? (
              <Card style={styles.section}>
                <Text style={text.h2}>Amenities</Text>
                <View style={styles.chips}>
                  {taxonomy.amenities.map((amenity) => {
                    const selected = ((values.amenityIds as string[] | undefined) ?? []).includes(amenity.id);
                    return (
                      <Pressable
                        key={amenity.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        onPress={() =>
                          setValues((current) => {
                            const ids = new Set((current.amenityIds as string[] | undefined) ?? []);
                            if (ids.has(amenity.id)) ids.delete(amenity.id);
                            else ids.add(amenity.id);
                            return { ...current, amenityIds: [...ids] };
                          })
                        }
                        style={[styles.chip, selected ? styles.chipOn : null]}
                      >
                        <Text style={[styles.chipText, selected ? { color: colors.surface } : null]}>{amenity.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>
            ) : null}

            <Card style={styles.section}>
              <Text style={text.h2}>Videos</Text>
              <Field
                label="YouTube or Instagram links"
                multiline
                autoCapitalize="none"
                value={v("videoUrls")}
                onChangeText={set("videoUrls")}
                error={errors.videoUrls}
                hint="One link per line, up to 10."
              />
            </Card>

            <Card style={styles.section}>
              <Text style={text.h2}>How people contact you</Text>
              <ToggleRow label="Receive enquiries through the app and website" value={values.contactViaForm === true} onChange={set("contactViaForm")} />
              <ToggleRow label="Show my phone number" value={values.showPhone === true} onChange={set("showPhone")} />
              <ToggleRow label="Show a WhatsApp link" value={values.showWhatsapp === true} onChange={set("showWhatsapp")} />
              <ToggleRow label="Show my email address" value={values.showEmail === true} onChange={set("showEmail")} />
            </Card>

            <Button label={listingId ? "Save changes" : "Save draft and add photos"} loading={saving} onPress={save} />
          </>
        ) : (
          <Notice>Details can&apos;t be edited in this state.</Notice>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Form values (field names of listingFormSchema) from a listing loaded from the database. */
function valuesFromListing(listing: NonNullable<Awaited<ReturnType<typeof getOwnListing>>>): Values {
  const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));
  return {
    category: listing.category,
    title: listing.title,
    description: listing.description,
    projectName: str(listing.project_name),
    projectRegistrationNumber: str(listing.project_registration_number),
    propertyTypeId: str(listing.property_type_id),
    priceAmount: str(listing.price_amount),
    currency: str(listing.currency),
    pricePeriod: listing.price_period,
    priceDisplay: listing.price_display,
    priceNegotiable: listing.price_negotiable,
    countryId: str(listing.country_id),
    regionId: str(listing.region_id),
    cityId: str(listing.city_id),
    localityId: str(listing.locality_id),
    postalCode: str(listing.postal_code),
    landmark: str(listing.landmark),
    priceMax: str(listing.price_max),
    launchDate: str(listing.launch_date),
    configurations: (listing.configurations ?? []).join(", "),
    streetAddress: str(listing.private?.street_address),
    addressVisibility: listing.address_visibility,
    areaUnit: str(listing.area_unit),
    areaValue: str(listing.area_value),
    bedrooms: str(listing.bedrooms),
    bathrooms: str(listing.bathrooms),
    parkingSpaces: str(listing.parking_spaces),
    floorNumber: str(listing.floor_number),
    totalFloors: str(listing.total_floors),
    furnishing: str(listing.furnishing),
    possessionStatus: str(listing.possession_status),
    availableFrom: str(listing.available_from),
    contactViaForm: listing.contact_via_form,
    showPhone: listing.show_phone,
    showWhatsapp: listing.show_whatsapp,
    showEmail: listing.show_email,
    amenityIds: listing.amenities.map((row) => row.amenity_id),
    videoUrls: [...listing.videos].sort((a, b) => a.sort_order - b.sort_order).map(videoWatchUrl).join("\n"),
  };
}

type Availability = "available" | "under_negotiation" | "unavailable";

/** Live listings stay published while an offer is discussed or the home is briefly off the market. */
function AvailabilityControl({ listingId, value, onChanged, onError }: { listingId: string; value: string; onChanged: () => Promise<void>; onError: (message: string) => void }) {
  const [saving, setSaving] = useState(false);
  async function change(next: string) {
    if (next === value || saving) return;
    setSaving(true);
    try {
      await setListingAvailability(supabase, listingId, next as Availability);
      await onChanged();
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : "Could not update availability.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <View style={{ gap: spacing.xs }}>
      <Segmented
        label="Availability"
        value={value}
        options={[
          { value: "available", label: "Available" },
          { value: "under_negotiation", label: "Negotiating" },
          { value: "unavailable", label: "Unavailable" },
        ]}
        onChange={change}
      />
      <Text style={text.muted}>{value === "unavailable" ? "Hidden from search until you set it back to available." : "Visitors see this on the listing. No review needed."}</Text>
    </View>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={styles.toggle}>
      <Text style={[text.body, { flex: 1 }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.brand }} accessibilityElementsHidden />
    </Pressable>
  );
}

function PhotoGrid({
  listingId,
  photos,
  editable,
  onChanged,
  onError,
}: {
  listingId: string;
  photos: Array<{ id: string; upload_key: string; is_cover: boolean; alt_text: string | null }>;
  editable: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const missing = photos.filter((photo) => !urls[photo.id]);
    if (!missing.length) return;
    // Originals are private: show short-lived signed previews.
    void supabase.storage
      .from("listing-uploads")
      .createSignedUrls(missing.map((photo) => photo.upload_key), 600)
      .then(({ data }) => {
        setUrls((current) => {
          const next = { ...current };
          missing.forEach((photo, index) => {
            const url = data?.[index]?.signedUrl;
            if (url) next[photo.id] = url;
          });
          return next;
        });
      });
  }, [photos, urls]);

  return (
    <View style={styles.grid}>
      {photos.map((photo, index) => (
        <View key={photo.id} style={styles.photo}>
          {urls[photo.id] ? (
            <Image source={{ uri: urls[photo.id] }} alt={photo.alt_text ?? `Photo ${index + 1}`} contentFit="cover" style={StyleSheet.absoluteFill} />
          ) : null}
          {photo.is_cover ? (
            <View style={styles.cover}>
              <Badge label="Cover" />
            </View>
          ) : null}
          {editable ? (
            <View style={styles.photoActions}>
              {!photo.is_cover ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Make photo ${index + 1} the cover`} onPress={async () => {
                  try { await setCoverPhoto(supabase, listingId, photo.id); await onChanged(); } catch (e) { onError(e instanceof Error ? e.message : "Failed"); }
                }} style={styles.photoButton}>
                  <Text style={styles.photoButtonText}>Cover</Text>
                </Pressable>
              ) : null}
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove photo ${index + 1}`} onPress={() =>
                Alert.alert("Remove photo?", undefined, [
                  { text: "Cancel", style: "cancel" },
                  { text: "Remove", style: "destructive", onPress: async () => {
                    try { await removePhoto(supabase, photo); await onChanged(); } catch (e) { onError(e instanceof Error ? e.message : "Failed"); }
                  } },
                ])
              } style={styles.photoButton}>
                <Text style={styles.photoButtonText}>Remove</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  section: { gap: spacing.md },
  row: { flexDirection: "row", gap: spacing.sm },
  error: { color: colors.danger, fontSize: fontSize.sm },
  toggle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, justifyContent: "center", backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: fontSize.sm, color: colors.text, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  photo: { width: "47%", aspectRatio: 4 / 3, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceMuted },
  cover: { position: "absolute", top: 6, left: 6 },
  photoActions: { position: "absolute", bottom: 6, right: 6, flexDirection: "row", gap: 6 },
  photoButton: { backgroundColor: "rgba(28,27,25,0.75)", borderRadius: radius.sm, paddingHorizontal: 10, minHeight: 36, justifyContent: "center" },
  photoButtonText: { color: colors.surface, fontSize: fontSize.xs, fontWeight: "700" },
});
