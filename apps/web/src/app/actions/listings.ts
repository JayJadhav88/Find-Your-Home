"use server";

import { fieldErrors, listingFormSchema, listingFormToRow, listingFormVideos, type ListingFormValues } from "@fyh/shared";
import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canList, getViewer, hasRole } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";
import { formValues, friendlyDbError, type FormState } from "./types";

// Ownership is never taken from the form: RLS and triggers set and check it in the database.

function parseListingForm(formData: FormData) {
  return listingFormSchema.safeParse({
    ...Object.fromEntries([...formData.entries()].filter(([key]) => key !== "amenityIds")),
    amenityIds: formData.getAll("amenityIds"),
  });
}

async function invalidateListing(reference: string | null | undefined) {
  updateTag("listings");
  if (reference) updateTag(`listing:${reference}`);
}

export async function createListing(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/account/listings/new");
  if (!canList(viewer)) return { error: "Turn on listing for your account first." };

  const parsed = parseListingForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: formValues(formData), error: "Please check the highlighted fields." };
  if (parsed.data.category === "new_project" && !hasRole(viewer, "builder", "administrator")) {
    return { fieldErrors: { category: "Only verified builders can list new projects" }, values: formValues(formData) };
  }

  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("listings")
    // owner_id and slug are overwritten by a database trigger; they are sent only to satisfy the types.
    .insert({ ...listingFormToRow(parsed.data), owner_id: viewer.id, slug: "draft" })
    .select("id")
    .single();
  if (error || !data) return { error: friendlyDbError(error), values: formValues(formData) };

  await saveExtras(data.id, parsed.data);
  redirect(`/account/listings/${data.id}?notice=created`);
}

export async function updateListing(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/account/listings");
  const listingId = z.uuid().safeParse(formData.get("listingId"));
  if (!listingId.success) return { error: "Unknown listing." };

  const parsed = parseListingForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: formValues(formData), error: "Please check the highlighted fields." };

  const supabase = await createUserClient();
  // Amenities and address first: a material change below can move the listing back to
  // review, after which it is no longer editable.
  if (parsed.data.category === "new_project" && !hasRole(viewer, "builder", "administrator")) {
    return { fieldErrors: { category: "Only verified builders can list new projects" }, values: formValues(formData) };
  }
  const extrasError = await saveExtras(listingId.data, parsed.data);
  if (extrasError) return { error: extrasError, values: formValues(formData) };

  const { data, error } = await supabase
    .from("listings")
    .update(listingFormToRow(parsed.data))
    .eq("id", listingId.data)
    .select("reference_code, status")
    .maybeSingle();
  if (error) return { error: friendlyDbError(error), values: formValues(formData) };
  if (!data) return { error: "This listing can't be edited right now (for example while it is awaiting review).", values: formValues(formData) };

  await invalidateListing(data.reference_code);
  refresh();
  return {
    ok: true,
    message:
      data.status === "pending_review"
        ? "Saved. Because important details changed, the listing is back in review before it goes live again."
        : "Saved.",
  };
}

async function saveExtras(listingId: string, values: ListingFormValues): Promise<string | null> {
  const { amenityIds, streetAddress } = values;
  const supabase = await createUserClient();
  const { data: current } = await supabase.from("listing_amenities").select("amenity_id").eq("listing_id", listingId);
  const existing = new Set((current ?? []).map((row) => row.amenity_id));
  const wanted = new Set(amenityIds);
  const toAdd = [...wanted].filter((id) => !existing.has(id));
  const toRemove = [...existing].filter((id) => !wanted.has(id));

  if (toRemove.length) {
    const { error } = await supabase.from("listing_amenities").delete().eq("listing_id", listingId).in("amenity_id", toRemove);
    if (error) return friendlyDbError(error);
  }
  if (toAdd.length) {
    const { error } = await supabase.from("listing_amenities").insert(toAdd.map((amenity_id) => ({ listing_id: listingId, amenity_id })));
    if (error) return friendlyDbError(error);
  }
  const { error } = await supabase
    .from("listing_private_details")
    .upsert({ listing_id: listingId, street_address: streetAddress ?? null }, { onConflict: "listing_id" });
  if (error) return friendlyDbError(error);

  // Videos: replace the list with what the form now contains.
  const videos = listingFormVideos(values);
  const removed = await supabase.from("listing_videos").delete().eq("listing_id", listingId);
  if (removed.error) return friendlyDbError(removed.error);
  if (videos.length) {
    const added = await supabase.from("listing_videos").insert(videos.map((video) => ({ ...video, listing_id: listingId })));
    if (added.error) return friendlyDbError(added.error);
  }
  return null;
}

const workflowInput = z.object({
  listingId: z.uuid(),
  action: z.enum(["submit", "withdraw", "sold", "rented", "archived", "restore"]),
});

export async function listingWorkflow(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/account/listings");
  const parsed = workflowInput.safeParse({ listingId: formData.get("listingId"), action: formData.get("action") });
  if (!parsed.success) return { error: "Unknown action." };

  const supabase = await createUserClient();
  const { listingId, action } = parsed.data;
  const { data: listing } = await supabase.from("listings").select("reference_code").eq("id", listingId).maybeSingle();

  const { error } =
    action === "submit"
      ? await supabase.rpc("submit_listing", { p_listing_id: listingId })
      : action === "withdraw"
        ? await supabase.rpc("withdraw_listing", { p_listing_id: listingId })
        : action === "restore"
          ? await supabase.rpc("restore_listing", { p_listing_id: listingId })
          : await supabase.rpc("set_listing_outcome", { p_listing_id: listingId, p_outcome: action });

  if (error) return { error: friendlyDbError(error) };
  await invalidateListing(listing?.reference_code);
  refresh();
  const messages = {
    submit: "Submitted. A moderator will review it; you'll get an email with the decision.",
    withdraw: "Withdrawn. The listing is a draft again.",
    sold: "Marked as sold and removed from search.",
    rented: "Marked as rented and removed from search.",
    archived: "Archived and removed from search.",
    restore: "Restored as a draft. Submit it again when it's ready.",
  } as const;
  return { ok: true, message: messages[action] };
}

/** Called by the photo manager after it uploads, reorders or removes media in the browser. */
export async function mediaChanged(listingId: string): Promise<void> {
  const viewer = await getViewer();
  if (!viewer || !z.uuid().safeParse(listingId).success) return;
  const supabase = await createUserClient();
  const { data } = await supabase.from("listings").select("reference_code").eq("id", listingId).maybeSingle();
  await invalidateListing(data?.reference_code);
  refresh();
}
