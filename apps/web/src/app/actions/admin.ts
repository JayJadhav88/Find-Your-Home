"use server";

import { APP_ROLES } from "@fyh/shared";
import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { getViewer, isAdmin, isStaff } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";
import { friendlyDbError, type FormState } from "./types";

// Every action re-checks the role here for a clear message; RLS and the workflow
// functions enforce it again in the database.

async function staffClient() {
  const viewer = await getViewer();
  if (!isStaff(viewer)) return null;
  return { viewer: viewer!, supabase: await createUserClient() };
}

async function adminClient() {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) return null;
  return { viewer: viewer!, supabase: await createUserClient() };
}

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };
const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};
const checked = (formData: FormData, key: string) => formData.get(key) === "on";

function done(message: string, tags: string[] = []): FormState {
  for (const tag of tags) updateTag(tag);
  refresh();
  return { ok: true, message };
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------
export async function moderateListing(_previous: FormState, formData: FormData): Promise<FormState> {
  const ctx = await staffClient();
  if (!ctx) return NOT_ALLOWED;
  const input = z
    .object({
      listingId: z.uuid(),
      decision: z.enum(["approve", "reject", "suspend", "reinstate"]),
      reason: z.string().max(2000),
    })
    .safeParse({ listingId: formData.get("listingId"), decision: formData.get("decision"), reason: text(formData, "reason") });
  if (!input.success) return { error: "Invalid request." };
  if ((input.data.decision === "reject" || input.data.decision === "suspend") && !input.data.reason) {
    return { fieldErrors: { reason: "Explain what needs to change" } };
  }

  const { data: listing } = await ctx.supabase.from("listings").select("reference_code").eq("id", input.data.listingId).maybeSingle();
  const { error } = await ctx.supabase.rpc("moderate_listing", {
    p_listing_id: input.data.listingId,
    p_decision: input.data.decision,
    p_reason: input.data.reason || undefined,
    p_reason_visible_to_owner: !checked(formData, "internalOnly"),
  });
  if (error) return { error: friendlyDbError(error) };
  const labels = { approve: "Approved — the listing is live.", reject: "Rejected. The owner has been notified.", suspend: "Suspended.", reinstate: "Reinstated." };
  return done(labels[input.data.decision], ["listings", `listing:${listing?.reference_code}`]);
}

export async function setListingFeatured(_previous: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return NOT_ALLOWED;
  const listingId = z.uuid().safeParse(formData.get("listingId"));
  if (!listingId.success) return { error: "Invalid request." };
  const until = text(formData, "until");
  const featured = formData.get("featured") === "1";
  const { data: listing } = await ctx.supabase.from("listings").select("reference_code").eq("id", listingId.data).maybeSingle();
  const { error } = await ctx.supabase.rpc("set_listing_featured", {
    p_listing_id: listingId.data,
    p_featured: featured,
    p_until: featured && until ? new Date(`${until}T23:59:59Z`).toISOString() : undefined,
  });
  if (error) return { error: friendlyDbError(error) };
  return done(featured ? "Listing featured." : "Listing no longer featured.", ["listings", `listing:${listing?.reference_code}`]);
}

export async function assignAgent(_previous: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return NOT_ALLOWED;
  const listingId = z.uuid().safeParse(formData.get("listingId"));
  const agentId = text(formData, "agentId");
  if (!listingId.success || (agentId && !z.uuid().safeParse(agentId).success)) return { error: "Invalid request." };
  const { error } = await ctx.supabase.rpc("assign_listing_agent", {
    p_listing_id: listingId.data,
    // NULL removes the agent; generated RPC types don't model nullable arguments.
    p_agent_id: (agentId || null) as string,
  });
  if (error) return { error: friendlyDbError(error) };
  return done(agentId ? "Agent assigned." : "Agent removed.", ["listings"]);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export async function setUserRole(_previous: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return NOT_ALLOWED;
  const input = z
    .object({ userId: z.uuid(), role: z.enum(APP_ROLES), grant: z.enum(["1", "0"]) })
    .safeParse({ userId: formData.get("userId"), role: formData.get("role"), grant: formData.get("grant") });
  if (!input.success) return { error: "Invalid request." };
  const { error } = await ctx.supabase.rpc("admin_set_role", {
    p_user_id: input.data.userId,
    p_role: input.data.role,
    p_granted: input.data.grant === "1",
  });
  if (error) return { error: friendlyDbError(error) };
  return done(input.data.grant === "1" ? `Granted ${input.data.role}.` : `Removed ${input.data.role}.`);
}

export async function setUserStatus(_previous: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return NOT_ALLOWED;
  const input = z
    .object({ userId: z.uuid(), status: z.enum(["active", "suspended"]), reason: z.string().max(500) })
    .safeParse({ userId: formData.get("userId"), status: formData.get("status"), reason: text(formData, "reason") });
  if (!input.success) return { error: "Invalid request." };
  const { error } = await ctx.supabase.rpc("admin_set_account_status", {
    p_user_id: input.data.userId,
    p_status: input.data.status,
    p_reason: input.data.reason || undefined,
  });
  if (error) return { error: friendlyDbError(error) };
  return done(input.data.status === "suspended" ? "Account suspended and signed out." : "Account reactivated.");
}

// ---------------------------------------------------------------------------
// Settings, currencies, content
// ---------------------------------------------------------------------------
export async function updateSettings(_previous: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return NOT_ALLOWED;
  const optional = (key: string) => text(formData, key) || null;
  const number = (key: string) => Number(text(formData, key));
  const { error } = await ctx.supabase
    .from("site_settings")
    .update({
      brand_name: text(formData, "brandName"),
      contact_email: optional("contactEmail"),
      contact_phone: optional("contactPhone"),
      contact_whatsapp: optional("contactWhatsapp"),
      default_locale: text(formData, "defaultLocale"),
      default_timezone: text(formData, "defaultTimezone"),
      default_currency: optional("defaultCurrency"),
      default_area_unit: text(formData, "defaultAreaUnit") as "sq_m" | "sq_ft" | "acre" | "hectare",
      self_service_owner: checked(formData, "selfServiceOwner"),
      owner_leads_enabled: checked(formData, "ownerLeadsEnabled"),
      material_change_policy: checked(formData, "materialReview") ? "unpublish_until_review" : "none",
      new_listing_days: number("newListingDays"),
      max_images_per_listing: number("maxImages"),
      max_image_bytes: Math.round(number("maxImageMb") * 1048576),
      comparison_max: number("comparisonMax"),
      enquiry_limit_per_hour: number("enquiryLimit"),
      submission_limit_per_day: number("submissionLimit"),
      seo_default_title: optional("seoTitle"),
      seo_default_description: optional("seoDescription"),
    })
    .eq("id", true);
  if (error) return { error: friendlyDbError(error) };
  return done("Settings saved.", ["settings"]);
}

export async function setCurrencyEnabled(_previous: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return NOT_ALLOWED;
  const code = text(formData, "code");
  if (!/^[A-Z]{3}$/.test(code)) return { error: "Invalid currency." };
  const { error } = await ctx.supabase.from("currencies").update({ is_enabled: formData.get("enabled") === "1" }).eq("code", code);
  if (error) return { error: friendlyDbError(error) };
  return done(`${code} updated.`, ["taxonomy", "settings"]);
}

export async function saveContentPage(_previous: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return NOT_ALLOWED;
  const slug = text(formData, "slug");
  const { error } = await ctx.supabase
    .from("content_pages")
    .update({
      title: text(formData, "title"),
      body_markdown: text(formData, "body"),
      is_published: checked(formData, "published"),
      updated_by: ctx.viewer.id,
    })
    .eq("slug", slug);
  if (error) return { error: friendlyDbError(error) };
  return done("Page saved.", ["content"]);
}

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------
const slugify = (value: string) =>
  value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export async function saveTaxonomyItem(_previous: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return NOT_ALLOWED;
  const table = z.enum(["property_types", "amenities", "locations"]).safeParse(formData.get("table"));
  if (!table.success) return { error: "Invalid request." };
  const id = text(formData, "id");
  const name = text(formData, "name");
  if (!name) return { fieldErrors: { name: "Enter a name" } };
  const slug = slugify(text(formData, "slug") || name);
  if (!slug) return { fieldErrors: { name: "Use letters or numbers in the name" } };
  const isActive = id ? checked(formData, "isActive") : true;

  let result;
  if (table.data === "locations") {
    const level = z.enum(["country", "region", "city", "locality"]).safeParse(formData.get("level"));
    const parentId = text(formData, "parentId") || null;
    const countryCode = text(formData, "countryCode").toUpperCase();
    if (!level.success) return { fieldErrors: { level: "Choose a level" } };
    const row = { name, slug, level: level.data, parent_id: parentId, country_code: countryCode, is_active: isActive };
    result = id
      ? await ctx.supabase.from("locations").update({ name, is_active: isActive }).eq("id", id)
      : await ctx.supabase.from("locations").insert(row);
  } else if (table.data === "amenities") {
    const row = { name, slug, category: text(formData, "category") || null, is_active: isActive };
    result = id
      ? await ctx.supabase.from("amenities").update({ name, category: row.category, is_active: isActive }).eq("id", id)
      : await ctx.supabase.from("amenities").insert(row);
  } else {
    const row = { name, slug, is_residential: id ? checked(formData, "isResidential") : formData.get("isResidential") !== "0", is_active: isActive };
    result = id
      ? await ctx.supabase.from("property_types").update({ name, is_residential: row.is_residential, is_active: isActive }).eq("id", id)
      : await ctx.supabase.from("property_types").insert(row);
  }
  if (result.error) return { error: friendlyDbError(result.error) };
  return done(id ? "Saved." : "Added.", ["taxonomy"]);
}

// ---------------------------------------------------------------------------
// Privacy requests
// ---------------------------------------------------------------------------
export async function updateDataRequest(_previous: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return NOT_ALLOWED;
  const input = z
    .object({ id: z.uuid(), status: z.enum(["pending", "in_progress", "completed", "rejected"]) })
    .safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!input.success) return { error: "Invalid request." };
  const { error } = await ctx.supabase.rpc("admin_update_data_request", {
    p_id: input.data.id,
    p_status: input.data.status,
    p_notes: text(formData, "notes") || undefined,
  });
  if (error) return { error: friendlyDbError(error) };
  return done("Request updated.");
}
