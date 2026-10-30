"use server";

import { zonedLocalToUtc } from "@fyh/shared";
import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { getViewer, isAdmin, isStaff } from "@/lib/auth";
import { getSiteSettings } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";
import { formValues, friendlyDbError, type FormState } from "./types";

// Admin → Boosts & shoots: boost plan prices (administrators), shoot requests (moderators too).

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };

const planInput = z.object({
  id: z.union([z.uuid(), z.literal("")]),
  name: z.string().trim().min(2, "Name the plan.").max(60),
  description: z.string().trim().max(200),
  days: z.coerce.number({ message: "Enter the number of days." }).int().min(1, "At least 1 day.").max(365, "At most 365 days."),
  price: z.coerce.number({ message: "Enter the price." }).min(1, "At least ₹1.").max(1_000_000),
  sortOrder: z.coerce.number().int().min(-100).max(100).default(0),
  isActive: z.boolean(),
});

export async function saveBoostPlan(_previous: FormState, formData: FormData): Promise<FormState> {
  if (!isAdmin(await getViewer())) return NOT_ALLOWED;
  const parsed = planInput.safeParse({ ...Object.fromEntries(formData.entries()), isActive: formData.get("isActive") === "on" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the plan.", values: formValues(formData) };
  const plan = parsed.data;
  const row = {
    name: plan.name,
    description: plan.description || null,
    days: plan.days,
    price_paise: Math.round(plan.price * 100),
    sort_order: plan.sortOrder,
    is_active: plan.isActive,
  };
  const supabase = await createUserClient();
  const { error } = plan.id ? await supabase.from("boost_plans").update(row).eq("id", plan.id) : await supabase.from("boost_plans").insert(row);
  if (error) return { error: friendlyDbError(error), values: formValues(formData) };
  updateTag("boost-plans");
  refresh();
  return { ok: true, message: plan.id ? "Plan saved." : "Plan added." };
}

const shootInput = z.object({
  id: z.uuid(),
  status: z.enum(["requested", "confirmed", "done", "cancelled"]),
  scheduledAt: z.string().trim(),
  note: z.string().trim().max(1000),
});

export async function updateShoot(_previous: FormState, formData: FormData): Promise<FormState> {
  if (!isStaff(await getViewer())) return NOT_ALLOWED;
  const parsed = shootInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Check the shoot details." };
  const { id, status, scheduledAt, note } = parsed.data;
  let scheduled: string | undefined;
  if (scheduledAt) {
    // The team enters local time (the site's time zone).
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduledAt)) return { error: "Choose a valid date and time." };
    scheduled = zonedLocalToUtc(scheduledAt, (await getSiteSettings()).default_timezone);
  }
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("admin_update_shoot", { p_id: id, p_status: status, p_scheduled_at: scheduled, p_team_note: note || undefined });
  if (error) return { error: friendlyDbError(error) };
  refresh();
  return { ok: true, message: "Shoot updated." };
}
