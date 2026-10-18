"use server";

import { parseSearchParams, savedSearchFilters, searchFiltersToQuery } from "@fyh/shared";
import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { getSiteSettings } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";
import { friendlyDbError, type FormState } from "./types";

// ---------------------------------------------------------------------------
// Saved searches
// ---------------------------------------------------------------------------
export async function saveSearch(_previous: FormState, formData: FormData): Promise<FormState> {
  const query = typeof formData.get("query") === "string" ? String(formData.get("query")) : "";
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(`/search${query ? `?${query}` : ""}`)}`);

  const name = String(formData.get("name") ?? "").trim() || "My search";
  if (name.length > 80) return { fieldErrors: { name: "Keep the name under 80 characters." } };
  const filters = parseSearchParams(Object.fromEntries(new URLSearchParams(query)));
  const settings = await getSiteSettings();
  const cleanArgs = savedSearchFilters(filters, settings.default_currency);

  const supabase = await createUserClient();
  const { error } = await supabase
    .from("saved_searches")
    .insert({ name, filters: cleanArgs, query_string: searchFiltersToQuery({ ...filters, cursor: undefined }) });
  if (error) return { error: friendlyDbError(error) };
  return { ok: true, message: "Saved. We'll tell you when new homes match." };
}

export async function updateSavedSearch(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/account/saved-searches");
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Unknown search." };
  const supabase = await createUserClient();
  const action = formData.get("action");
  const { error } =
    action === "delete"
      ? await supabase.from("saved_searches").delete().eq("id", id.data)
      : await supabase.from("saved_searches").update({ alerts: action === "alerts-on" }).eq("id", id.data);
  if (error) return { error: friendlyDbError(error) };
  refresh();
  return { ok: true, message: action === "delete" ? "Deleted." : "Saved." };
}

// ---------------------------------------------------------------------------
// Reports and views
// ---------------------------------------------------------------------------
const REPORT_REASONS = ["fraud", "wrong_info", "unavailable", "duplicate", "offensive", "other"] as const;

export async function reportListing(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ listingId: z.uuid(), reason: z.enum(REPORT_REASONS), details: z.string().trim().max(1000) })
    .safeParse({ listingId: formData.get("listingId"), reason: formData.get("reason"), details: formData.get("details") ?? "" });
  if (!parsed.success) return { error: "Choose a reason." };
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("report_listing", {
    p_listing_id: parsed.data.listingId,
    p_reason: parsed.data.reason,
    p_details: parsed.data.details || undefined,
  });
  if (error) return { error: friendlyDbError(error) };
  return { ok: true, message: "Thank you. Our moderators will take a look." };
}

/** Counted once per visitor per day; `visitor` is a random id kept in the browser. */
export async function recordView(listingId: string, visitor: string): Promise<void> {
  if (!z.uuid().safeParse(listingId).success || !/^[A-Za-z0-9-]{8,64}$/.test(visitor)) return;
  const supabase = await createUserClient();
  await supabase.rpc("record_listing_view", { p_listing_id: listingId, p_visitor: visitor });
}

// ---------------------------------------------------------------------------
// Renewal
// ---------------------------------------------------------------------------
export async function renewListing(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/account/listings");
  const id = z.uuid().safeParse(formData.get("listingId"));
  if (!id.success) return { error: "Unknown listing." };
  const supabase = await createUserClient();
  const { data: listing } = await supabase.from("listings").select("reference_code, status").eq("id", id.data).maybeSingle();
  const { error } = await supabase.rpc("renew_listing", { p_listing_id: id.data });
  if (error) return { error: friendlyDbError(error) };
  if (listing?.reference_code) updateTag(`listing:${listing.reference_code}`);
  updateTag("listings");
  refresh();
  return { ok: true, message: listing?.status === "published" ? "Renewed. It stays live for another period." : "Renewed and live again." };
}
