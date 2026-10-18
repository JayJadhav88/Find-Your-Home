// Data access shared by the mobile app (and available to the web). Every call goes through
// the caller's Supabase client, so Row Level Security and the workflow functions decide what
// is allowed; nothing here grants extra rights.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import type { ListingStatus } from "./domain";
import { notificationPreferencesSchema, type NotificationPreferencesInput } from "./notifications";
import { listingFormToRow, listingFormVideos, searchFiltersToRpcArgs, type ListingFormValues, type SearchFilters } from "./schemas";

export type Client = SupabaseClient<Database>;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Turns database errors into short, user-facing messages. */
export function friendlyError(error: { code?: string; message?: string; details?: string | null } | null): string {
  if (!error) return "Something went wrong. Please try again.";
  switch (error.code) {
    case "42501":
      return error.message && !/row-level security|permission denied/.test(error.message)
        ? error.message
        : "You don't have permission to do that.";
    case "PT409":
      return error.message ?? "That action isn't possible right now.";
    case "PT429":
      return "Too many requests. Please wait a little and try again.";
    case "22023":
      return error.details ? `${error.message}: ${error.details}` : (error.message ?? "Some details are invalid.");
    case "23514":
      return error.message?.includes("violates check constraint") ? "Some details are outside the allowed range." : (error.message ?? "Invalid details.");
    default:
      return "Something went wrong. Please try again.";
  }
}

type DbError = { code?: string; message?: string; details?: string | null };
type DbResult = { data: unknown; error: DbError | null };

/** For queries that always return data when they succeed (lists, single(), RPCs). */
function check<R extends DbResult>(result: R): NonNullable<R["data"]> {
  if (result.error) throw new ApiError(friendlyError(result.error), result.error.code);
  return result.data as NonNullable<R["data"]>;
}

/** For maybeSingle(): no row is a normal outcome. */
function checkMaybe<R extends DbResult>(result: R): NonNullable<R["data"]> | null {
  if (result.error) throw new ApiError(friendlyError(result.error), result.error.code);
  return (result.data ?? null) as NonNullable<R["data"]> | null;
}

export function publicImageUrl(supabaseUrl: string, key: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/listing-public/${key}`;
}

// ---------------------------------------------------------------------------
// Public data
// ---------------------------------------------------------------------------
export async function getSettings(client: Client) {
  return check(await client.from("site_settings").select("*").single());
}

export async function getTaxonomy(client: Client) {
  const [types, amenities, locations, currencies] = await Promise.all([
    client.from("property_types").select("id, slug, name").eq("is_active", true).order("sort_order"),
    client.from("amenities").select("id, slug, name, category").eq("is_active", true).order("sort_order"),
    client.from("locations").select("id, parent_id, level, name, slug").eq("is_active", true).order("name"),
    client.from("currencies").select("code, name").eq("is_enabled", true).order("code"),
  ]);
  return {
    propertyTypes: check(types),
    amenities: check(amenities),
    locations: check(locations),
    currencies: check(currencies),
  };
}

export type SearchResultItem = Database["public"]["Functions"]["search_listings"]["Returns"][number];

export async function searchListings(
  client: Client,
  filters: SearchFilters,
  options: { currency?: string | null; pageSize?: number } = {},
): Promise<{ items: SearchResultItem[]; nextCursor: string | null }> {
  const pageSize = options.pageSize ?? 20;
  const rows = check(await client.rpc("search_listings", searchFiltersToRpcArgs(filters, { currency: options.currency, pageSize })));
  const items = rows.slice(0, pageSize);
  return { items, nextCursor: rows.length > pageSize ? (items.at(-1)?.cursor ?? null) : null };
}

const LISTING_DETAIL = `*, property_type:property_types(name),
  media:listing_media(id, kind, public_key, alt_text, sort_order, is_cover),
  amenities:listing_amenities(amenity:amenities(id, name)),
  videos:listing_videos(provider, video_id, instagram_kind, sort_order),
  city:locations!listings_city_id_fkey(name),
  locality:locations!listings_locality_id_fkey(name)`;

export async function getPublicListing(client: Client, reference: string) {
  const listing = checkMaybe(
    await client.from("listings").select(LISTING_DETAIL).eq("reference_code", reference.toUpperCase()).eq("status", "published").maybeSingle(),
  );
  if (!listing) return null;
  const [contact, builder] = await Promise.all([
    client.rpc("get_listing_contact", { p_listing_id: listing.id }).maybeSingle(),
    listing.category === "new_project"
      ? client.from("builder_profiles").select("company_name, registration_number, website").eq("user_id", listing.owner_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  return { ...listing, contact: contact.data ?? null, builder: builder.data ?? null };
}

export type PublicListing = NonNullable<Awaited<ReturnType<typeof getPublicListing>>>;

// ---------------------------------------------------------------------------
// Signed-in user
// ---------------------------------------------------------------------------
export async function getViewer(client: Client) {
  const { data } = await client.auth.getUser();
  if (!data.user) return null;
  const [profile, roles] = await Promise.all([
    client.from("profiles").select("display_name, phone, status, marketing_opt_in").eq("id", data.user.id).maybeSingle(),
    client.from("user_roles").select("role").eq("user_id", data.user.id),
  ]);
  if (!profile.data) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? "",
    emailVerified: Boolean(data.user.email_confirmed_at),
    displayName: profile.data.display_name,
    phone: profile.data.phone,
    status: profile.data.status,
    roles: (roles.data ?? []).map((row) => row.role),
  };
}

export type Viewer = NonNullable<Awaited<ReturnType<typeof getViewer>>>;

export const viewerCanList = (viewer: Viewer | null) =>
  Boolean(viewer && viewer.status === "active" && viewer.roles.some((role) => ["owner", "agent", "builder", "administrator"].includes(role)));
export const viewerIsBuilder = (viewer: Viewer | null) =>
  Boolean(viewer && viewer.status === "active" && viewer.roles.some((role) => role === "builder" || role === "administrator"));

export async function becomeOwner(client: Client) {
  check(await client.rpc("become_owner"));
}

export async function updateProfile(client: Client, userId: string, values: { displayName: string; phone?: string | null }) {
  check(await client.from("profiles").update({ display_name: values.displayName, phone: values.phone ?? null }).eq("id", userId));
}

// Favorites
export async function listFavorites(client: Client, userId: string) {
  return check(
    await client
      .from("favorites")
      .select(
        `listing_id, created_at, listing:listings(id, reference_code, slug, title, purpose, category, project_name, status,
         price_amount, currency, price_period, price_display, bedrooms, bathrooms, area_value, area_unit, is_featured,
         city:locations!listings_city_id_fkey(name), media:listing_media(public_key, alt_text, is_cover, sort_order))`,
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  );
}

export async function isFavorite(client: Client, userId: string, listingId: string) {
  const { count } = await client
    .from("favorites")
    .select("listing_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("listing_id", listingId);
  return Boolean(count);
}

export async function setFavorite(client: Client, userId: string, listingId: string, saved: boolean) {
  if (saved) check(await client.from("favorites").upsert({ user_id: userId, listing_id: listingId }, { ignoreDuplicates: true }));
  else check(await client.from("favorites").delete().eq("user_id", userId).eq("listing_id", listingId));
}

// Enquiries
export async function submitEnquiry(
  client: Client,
  input: {
    listingId: string;
    name: string;
    email: string;
    phone?: string;
    message: string;
    kind: "enquiry" | "visit_request";
    visitAtUtc?: string;
    timeZone?: string;
    consentVersion: string;
  },
) {
  return check(
    await client.rpc("submit_enquiry", {
      p_listing_id: input.listingId,
      p_name: input.name,
      p_email: input.email,
      p_message: input.message,
      p_phone: input.phone || undefined,
      p_kind: input.kind,
      p_requested_visit_at: input.kind === "visit_request" ? input.visitAtUtc : undefined,
      p_requested_timezone: input.kind === "visit_request" ? input.timeZone : undefined,
      p_consent_text_version: input.consentVersion,
    }),
  );
}

export async function listEnquiries(client: Client) {
  return check(
    await client
      .from("enquiries")
      .select("id, kind, status, visit_status, created_at, sender_user_id, assigned_to, listing:listings(title, reference_code)")
      .order("created_at", { ascending: false })
      .limit(200),
  );
}

export async function getEnquiry(client: Client, id: string) {
  return checkMaybe(await client.from("enquiries").select("*, listing:listings(title, reference_code, status)").eq("id", id).maybeSingle());
}

export async function enquiryAction(
  client: Client,
  id: string,
  action: "responded" | "closed" | "spam" | "confirm_visit" | "decline_visit" | "cancel_visit",
) {
  if (action === "confirm_visit" || action === "decline_visit") {
    check(await client.rpc("respond_to_visit", { p_enquiry_id: id, p_confirm: action === "confirm_visit" }));
  } else if (action === "cancel_visit") {
    check(await client.rpc("cancel_visit_request", { p_enquiry_id: id }));
  } else {
    check(await client.rpc("update_enquiry_status", { p_enquiry_id: id, p_status: action }));
  }
}

// ---------------------------------------------------------------------------
// Listers
// ---------------------------------------------------------------------------
export async function myListings(client: Client, userId: string) {
  return check(
    await client
      .from("listings")
      .select("id, title, reference_code, status, category, updated_at")
      .or(`owner_id.eq.${userId},agent_id.eq.${userId}`)
      .order("updated_at", { ascending: false }),
  );
}

export async function getOwnListing(client: Client, id: string) {
  return checkMaybe(
    await client
      .from("listings")
      .select(
        `*, private:listing_private_details(street_address), amenities:listing_amenities(amenity_id),
         media:listing_media(id, upload_key, alt_text, is_cover, sort_order, kind),
         videos:listing_videos(provider, video_id, instagram_kind, sort_order)`,
      )
      .eq("id", id)
      .maybeSingle(),
  );
}

export async function getListingHistory(client: Client, id: string) {
  return check(await client.rpc("get_listing_history", { p_listing_id: id }));
}

/** Amenities, private address and videos. Call before updating a live listing's main row. */
async function saveListingExtras(client: Client, listingId: string, values: ListingFormValues) {
  const current = check(await client.from("listing_amenities").select("amenity_id").eq("listing_id", listingId));
  const existing = new Set(current.map((row) => row.amenity_id));
  const wanted = new Set(values.amenityIds);
  const toRemove = [...existing].filter((id) => !wanted.has(id));
  const toAdd = [...wanted].filter((id) => !existing.has(id));
  if (toRemove.length) check(await client.from("listing_amenities").delete().eq("listing_id", listingId).in("amenity_id", toRemove));
  if (toAdd.length) check(await client.from("listing_amenities").insert(toAdd.map((amenity_id) => ({ listing_id: listingId, amenity_id }))));
  check(
    await client
      .from("listing_private_details")
      .upsert({ listing_id: listingId, street_address: values.streetAddress ?? null }, { onConflict: "listing_id" }),
  );
  check(await client.from("listing_videos").delete().eq("listing_id", listingId));
  const videos = listingFormVideos(values);
  if (videos.length) check(await client.from("listing_videos").insert(videos.map((video) => ({ ...video, listing_id: listingId }))));
}

export async function createListing(client: Client, userId: string, values: ListingFormValues): Promise<string> {
  // owner_id and slug are overwritten by database triggers.
  const created = check(
    await client.from("listings").insert({ ...listingFormToRow(values), owner_id: userId, slug: "draft" }).select("id").single(),
  );
  if (!created) throw new ApiError("The listing could not be created.");
  await saveListingExtras(client, created.id, values);
  return created.id;
}

export async function updateListing(client: Client, id: string, values: ListingFormValues): Promise<ListingStatus> {
  await saveListingExtras(client, id, values);
  const updated = checkMaybe(await client.from("listings").update(listingFormToRow(values)).eq("id", id).select("status").maybeSingle());
  if (!updated) throw new ApiError("This listing can't be edited right now (for example while it is awaiting review).");
  return updated.status;
}

export async function listingWorkflow(
  client: Client,
  id: string,
  action: "submit" | "withdraw" | "sold" | "rented" | "archived" | "restore",
) {
  if (action === "submit") check(await client.rpc("submit_listing", { p_listing_id: id }));
  else if (action === "withdraw") check(await client.rpc("withdraw_listing", { p_listing_id: id }));
  else if (action === "restore") check(await client.rpc("restore_listing", { p_listing_id: id }));
  else check(await client.rpc("set_listing_outcome", { p_listing_id: id, p_outcome: action }));
}

/** Registers an uploaded photo (the object must already be in the listing-uploads bucket). */
export async function registerPhoto(client: Client, listingId: string, uploadKey: string, isCover: boolean, sortOrder: number) {
  return check(
    await client
      .from("listing_media")
      .insert({ listing_id: listingId, upload_key: uploadKey, kind: "image", is_cover: isCover, sort_order: sortOrder })
      .select("id, upload_key, alt_text, is_cover, sort_order")
      .single(),
  );
}

export async function removePhoto(client: Client, media: { id: string; upload_key: string }) {
  check(await client.from("listing_media").delete().eq("id", media.id));
  await client.storage.from("listing-uploads").remove([media.upload_key]);
}

export async function setCoverPhoto(client: Client, listingId: string, mediaId: string) {
  check(await client.from("listing_media").update({ is_cover: false }).eq("listing_id", listingId).eq("is_cover", true));
  check(await client.from("listing_media").update({ is_cover: true }).eq("id", mediaId));
}

// Notifications
export async function listNotifications(client: Client, limit = 50) {
  return check(
    await client
      .from("notifications")
      .select("id, kind, data, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
  );
}

export type InboxItem = Awaited<ReturnType<typeof listNotifications>>[number];

export async function countUnreadNotifications(client: Client): Promise<number> {
  const result = await client.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  if (result.error) throw new ApiError(friendlyError(result.error), result.error.code);
  return result.count ?? 0;
}

/** Marks the given notifications (or all of them) as read. */
export async function markNotificationsRead(client: Client, ids?: number[]) {
  return check(await client.rpc("mark_notifications_read", ids ? { p_ids: ids } : {}));
}

export async function getNotificationPreferences(client: Client, userId: string) {
  return checkMaybe(await client.from("notification_preferences").select("*").eq("user_id", userId).maybeSingle());
}

export async function updateNotificationPreferences(client: Client, userId: string, input: NotificationPreferencesInput) {
  const values = notificationPreferencesSchema.parse(input);
  check(
    await client
      .from("notification_preferences")
      .update({
        email_enabled: values.emailEnabled,
        push_enabled: values.pushEnabled,
        whatsapp_enabled: values.whatsappEnabled,
        whatsapp_number: values.whatsappNumber || null,
        alerts_enabled: values.alertsEnabled,
        quiet_hours_enabled: values.quietHoursEnabled,
        timezone: values.timezone || null,
      })
      .eq("user_id", userId),
  );
}

export async function registerPushToken(client: Client, token: string, platform: "ios" | "android") {
  check(await client.rpc("register_push_token", { p_token: token, p_platform: platform }));
}

export async function unregisterPushToken(client: Client, token: string) {
  check(await client.rpc("unregister_push_token", { p_token: token }));
}
