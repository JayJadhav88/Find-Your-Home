"use server";

import { CALL_OUTCOMES, ENQUIRY_STATUSES, LEAD_INTERESTS, zonedLocalToUtc } from "@fyh/shared";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canSeeLeads, getViewer } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";
import { formValues, friendlyDbError, type FormState } from "./types";

// The database decides which leads someone may change (sales agents: only their own).

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };

async function leadsClient() {
  const viewer = await getViewer();
  return canSeeLeads(viewer) ? createUserClient() : null;
}

const updateInput = z.object({
  id: z.uuid(),
  status: z.enum(ENQUIRY_STATUSES),
  assignee: z.union([z.uuid(), z.literal("")]),
  followUp: z.string().trim(),
  lostReason: z.string().trim().max(200),
});

export async function updateEnquiryAsTeam(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await leadsClient();
  if (!supabase) return NOT_ALLOWED;
  const parsed = updateInput.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    assignee: formData.get("assignee") ?? "",
    followUp: formData.get("followUp") ?? "",
    lostReason: formData.get("lostReason") ?? "",
  });
  if (!parsed.success) return { error: "Check the status, owner and follow-up date." };

  let followUp: string | null = null;
  if (parsed.data.followUp) {
    const { data: settings } = await supabase.from("site_settings").select("default_timezone").single();
    try {
      followUp = zonedLocalToUtc(parsed.data.followUp, settings?.default_timezone ?? "UTC");
    } catch {
      return { fieldErrors: { followUp: "Choose a valid date and time." }, values: formValues(formData) };
    }
  }

  const { error } = await supabase.rpc("admin_update_enquiry", {
    p_enquiry_id: parsed.data.id,
    p_status: parsed.data.status,
    // Empty = not assigned / no follow-up; the generated types don't mark these nullable.
    p_team_assignee: parsed.data.assignee || (null as unknown as string),
    p_follow_up_at: followUp ?? (null as unknown as string),
    p_lost_reason: parsed.data.lostReason || undefined,
  });
  if (error) return { error: friendlyDbError(error) };
  refresh();
  return { ok: true, message: "Saved." };
}

export async function addEnquiryNote(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await leadsClient();
  if (!supabase) return NOT_ALLOWED;
  const parsed = z
    .object({ id: z.uuid(), body: z.string().trim().min(1, "Write a note.").max(2000, "Keep notes under 2,000 characters.") })
    .safeParse({ id: formData.get("id"), body: formData.get("body") });
  if (!parsed.success) return { fieldErrors: { body: parsed.error.issues[0]?.message ?? "Write a note." } };
  const { error } = await supabase.rpc("add_enquiry_note", { p_enquiry_id: parsed.data.id, p_body: parsed.data.body });
  if (error) return { error: friendlyDbError(error), values: formValues(formData) };
  refresh();
  return { ok: true, message: "Note added." };
}

export async function logContactAttempt(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await leadsClient();
  if (!supabase) return NOT_ALLOWED;
  const parsed = z
    .object({ id: z.uuid(), outcome: z.enum(CALL_OUTCOMES), note: z.string().trim().max(500) })
    .safeParse({ id: formData.get("id"), outcome: formData.get("outcome"), note: formData.get("note") ?? "" });
  if (!parsed.success) return { error: "Choose what happened." };
  const { error } = await supabase.rpc("log_contact_attempt", {
    p_enquiry_id: parsed.data.id,
    p_outcome: parsed.data.outcome,
    p_note: parsed.data.note || undefined,
  });
  if (error) return { error: friendlyDbError(error) };
  refresh();
  return { ok: true, message: "Logged." };
}

const leadInput = z
  .object({
    name: z.string().trim().min(1, "Add a name.").max(100),
    email: z.union([z.email("Enter a valid email address."), z.literal("")]),
    phone: z.string().trim().max(32),
    interest: z.enum(LEAD_INTERESTS),
    source: z.enum(["manual", "referral", "campaign", "organic", "qr", "other"]),
    city: z.string().trim().max(100),
    message: z.string().trim().max(5000),
  })
  .refine((value) => value.email || value.phone, { message: "Add a phone number or an email address.", path: ["phone"] });

export async function createLead(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await leadsClient();
  if (!supabase) return NOT_ALLOWED;
  const parsed = leadInput.safeParse({
    name: formData.get("name"),
    email: String(formData.get("email") ?? "").trim(),
    phone: formData.get("phone") ?? "",
    interest: formData.get("interest"),
    source: formData.get("source"),
    city: formData.get("city") ?? "",
    message: formData.get("message") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, values: formValues(formData) };
  }
  const values = parsed.data;
  const { data, error } = await supabase.rpc("admin_create_lead", {
    p_name: values.name,
    p_email: values.email,
    p_phone: values.phone,
    p_interest: values.interest,
    p_message: values.message,
    p_source: values.source,
    p_city: values.city || undefined,
  });
  if (error || !data) return { error: friendlyDbError(error), values: formValues(formData) };
  redirect(`/admin/enquiries/${data}`);
}
