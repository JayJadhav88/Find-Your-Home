"use server";

import { ENQUIRY_STATUSES, zonedLocalToUtc } from "@fyh/shared";
import { refresh } from "next/cache";
import { z } from "zod";
import { canManageEnquiries, getViewer } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";
import { formValues, friendlyDbError, type FormState } from "./types";

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };

const updateInput = z.object({
  id: z.uuid(),
  status: z.enum(ENQUIRY_STATUSES),
  assignee: z.union([z.uuid(), z.literal("")]),
  followUp: z.string().trim(),
});

export async function updateEnquiryAsTeam(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!canManageEnquiries(viewer)) return NOT_ALLOWED;
  const parsed = updateInput.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    assignee: formData.get("assignee") ?? "",
    followUp: formData.get("followUp") ?? "",
  });
  if (!parsed.success) return { error: "Check the status, owner and follow-up date." };

  const supabase = await createUserClient();
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
  });
  if (error) return { error: friendlyDbError(error) };
  refresh();
  return { ok: true, message: "Saved." };
}

export async function addEnquiryNote(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!canManageEnquiries(viewer)) return NOT_ALLOWED;
  const parsed = z
    .object({ id: z.uuid(), body: z.string().trim().min(1, "Write a note.").max(2000, "Keep notes under 2,000 characters.") })
    .safeParse({ id: formData.get("id"), body: formData.get("body") });
  if (!parsed.success) return { fieldErrors: { body: parsed.error.issues[0]?.message ?? "Write a note." } };
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("add_enquiry_note", { p_enquiry_id: parsed.data.id, p_body: parsed.data.body });
  if (error) return { error: friendlyDbError(error), values: formValues(formData) };
  refresh();
  return { ok: true, message: "Note added." };
}
