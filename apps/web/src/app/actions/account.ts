"use server";

import { fieldErrors, profileSchema } from "@fyh/shared";
import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";
import { formValues, friendlyDbError, type FormState } from "./types";

async function viewerOrSignIn(next: string) {
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return viewer;
}

export async function updateProfile(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await viewerOrSignIn("/account/profile");
  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    phone: formData.get("phone"),
    marketingOptIn: formData.get("marketingOptIn"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: formValues(formData) };

  const supabase = await createUserClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.displayName,
      phone: parsed.data.phone ?? null,
      marketing_opt_in: parsed.data.marketingOptIn,
    })
    .eq("id", viewer.id);
  if (error) return { error: friendlyDbError(error), values: formValues(formData) };
  refresh();
  return { ok: true, message: "Profile saved." };
}

export async function becomeOwner(): Promise<FormState> {
  await viewerOrSignIn("/account");
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("become_owner");
  if (error) return { error: friendlyDbError(error) };
  redirect("/account/listings/new");
}

export async function requestDataExport(): Promise<FormState> {
  await viewerOrSignIn("/account/profile");
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("request_data_export");
  if (error) return { error: friendlyDbError(error) };
  return { ok: true, message: "Request received. We'll email you a copy of your data." };
}

export async function requestAccountDeletion(_previous: FormState, formData: FormData): Promise<FormState> {
  await viewerOrSignIn("/account/profile");
  if (formData.get("confirm") !== "DELETE") return { fieldErrors: { confirm: 'Type DELETE to confirm' } };
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("request_account_deletion");
  if (error) return { error: friendlyDbError(error) };
  return { ok: true, message: "Deletion requested. We'll confirm by email once your account and data are removed." };
}

const builderInput = z.object({
  companyName: z.string().trim().min(1, "Enter the company name").max(120),
  registrationNumber: z.string().trim().max(60),
  website: z.union([z.literal(""), z.url({ protocol: /^https$/, error: "Use a full https:// link" }).max(300)]),
  description: z.string().trim().max(2000),
});

export async function updateBuilderProfile(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await viewerOrSignIn("/account/profile");
  if (!viewer.roles.includes("builder")) return { error: "Only verified builders have a company profile." };
  const parsed = builderInput.safeParse({
    companyName: formData.get("companyName"),
    registrationNumber: formData.get("registrationNumber") ?? "",
    website: (formData.get("website") as string | null)?.trim() ?? "",
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: formValues(formData) };

  const supabase = await createUserClient();
  const { error } = await supabase
    .from("builder_profiles")
    .update({
      company_name: parsed.data.companyName,
      registration_number: parsed.data.registrationNumber || null,
      website: parsed.data.website || null,
      description: parsed.data.description || null,
    })
    .eq("user_id", viewer.id);
  if (error) return { error: friendlyDbError(error), values: formValues(formData) };
  updateTag("listings");
  refresh();
  return { ok: true, message: "Company profile saved." };
}

const enquiryAction = z.object({
  enquiryId: z.uuid(),
  action: z.enum(["in_progress", "responded", "closed", "spam", "confirm_visit", "decline_visit", "cancel_visit"]),
});

export async function handleEnquiry(_previous: FormState, formData: FormData): Promise<FormState> {
  await viewerOrSignIn("/account/enquiries");
  const parsed = enquiryAction.safeParse({ enquiryId: formData.get("enquiryId"), action: formData.get("action") });
  if (!parsed.success) return { error: "Unknown action." };

  const supabase = await createUserClient();
  const { enquiryId, action } = parsed.data;
  const { error } =
    action === "confirm_visit" || action === "decline_visit"
      ? await supabase.rpc("respond_to_visit", { p_enquiry_id: enquiryId, p_confirm: action === "confirm_visit" })
      : action === "cancel_visit"
        ? await supabase.rpc("cancel_visit_request", { p_enquiry_id: enquiryId })
        : await supabase.rpc("update_enquiry_status", { p_enquiry_id: enquiryId, p_status: action });
  if (error) return { error: friendlyDbError(error) };
  refresh();
  return { ok: true, message: "Updated." };
}
