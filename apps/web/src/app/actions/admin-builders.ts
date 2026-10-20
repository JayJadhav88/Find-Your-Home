"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { getViewer, isStaff } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";
import { formValues, friendlyDbError, type FormState } from "./types";

// Builder directory (moderators and administrators). The database enforces the same rule.

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };

async function staffClient() {
  const viewer = await getViewer();
  return isStaff(viewer) ? createUserClient() : null;
}

const httpsOrEmpty = z.union([z.url({ protocol: /^https$/, error: "Use a full https:// address." }), z.literal("")]);

const builderInput = z.object({
  id: z.union([z.uuid(), z.literal("")]),
  name: z.string().trim().min(1, "Enter the builder's name.").max(120),
  description: z.string().trim().max(4000),
  website: httpsOrEmpty,
  logoUrl: httpsOrEmpty,
  contactEmail: z.union([z.email("Enter a valid email address."), z.literal("")]),
  contactPhone: z.string().trim().max(32),
  isActive: z.boolean(),
});

export async function saveBuilder(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await staffClient();
  if (!supabase) return NOT_ALLOWED;
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const parsed = builderInput.safeParse({
    id: text("id"),
    name: text("name"),
    description: text("description"),
    website: text("website"),
    logoUrl: text("logoUrl"),
    contactEmail: text("contactEmail"),
    contactPhone: text("contactPhone"),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, values: formValues(formData) };
  }
  const values = parsed.data;
  const row = {
    name: values.name,
    description: values.description || null,
    website: values.website || null,
    logo_url: values.logoUrl || null,
    contact_email: values.contactEmail || null,
    contact_phone: values.contactPhone || null,
    is_active: values.isActive,
  };
  const { error } = values.id
    ? await supabase.from("builders").update(row).eq("id", values.id)
    : await supabase.from("builders").insert({ ...row, slug: "" }); // the database sets the slug from the name
  if (error) {
    return {
      error: error.code === "23505" ? "A builder with this name already exists. Edit that one, or merge duplicates below." : friendlyDbError(error),
      values: formValues(formData),
    };
  }
  updateTag("builders");
  updateTag("listings");
  refresh();
  return { ok: true, message: values.id ? "Builder saved." : "Builder added." };
}

export async function mergeBuilders(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await staffClient();
  if (!supabase) return NOT_ALLOWED;
  const parsed = z.object({ from: z.uuid(), into: z.uuid() }).safeParse({ from: formData.get("from"), into: formData.get("into") });
  if (!parsed.success) return { error: "Choose the duplicate and the builder to keep." };
  const { data, error } = await supabase.rpc("admin_merge_builders", { p_from: parsed.data.from, p_into: parsed.data.into });
  if (error) return { error: friendlyDbError(error) };
  updateTag("builders");
  updateTag("listings");
  refresh();
  return { ok: true, message: `Merged. ${data ?? 0} project(s) moved.` };
}

/** Review page: which builder a project belongs to, and whether its registration number was checked. */
export async function setListingProject(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await staffClient();
  if (!supabase) return NOT_ALLOWED;
  const parsed = z
    .object({ listingId: z.uuid(), builderId: z.union([z.uuid(), z.literal("")]), verified: z.boolean() })
    .safeParse({ listingId: formData.get("listingId"), builderId: formData.get("builderId") ?? "", verified: formData.get("verified") === "on" });
  if (!parsed.success) return { error: "Invalid request." };
  const { data: listing } = await supabase.from("listings").select("reference_code").eq("id", parsed.data.listingId).maybeSingle();
  const { error } = await supabase.rpc("admin_set_listing_project", {
    p_listing_id: parsed.data.listingId,
    // No builder = not filed under any; the generated type doesn't mark it nullable.
    p_builder_id: parsed.data.builderId || (null as unknown as string),
    p_registration_verified: parsed.data.verified,
  });
  if (error) return { error: friendlyDbError(error) };
  updateTag("listings");
  if (listing?.reference_code) updateTag(`listing:${listing.reference_code}`);
  refresh();
  return { ok: true, message: "Project details saved." };
}
