"use server";

import { describeNotification, fieldErrors, notificationPreferencesSchema, notificationWebHref } from "@fyh/shared";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getViewer, safeNext } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";
import { formValues, friendlyDbError, type FormState } from "./types";

/** Marks one notification read and opens what it is about. */
export async function openNotification(formData: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/account/notifications");
  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!id.success) redirect("/account/notifications");

  const supabase = await createUserClient();
  const { data } = await supabase.from("notifications").select("kind, data").eq("id", id.data).maybeSingle();
  await supabase.rpc("mark_notifications_read", { p_ids: [id.data] });
  const href = data ? notificationWebHref(describeNotification(data.kind, data.data as Record<string, unknown>).target) : null;
  // External links from broadcasts open from the page itself; redirects stay on this site.
  redirect(safeNext(href, "/account/notifications"));
}

export async function markAllNotificationsRead(): Promise<void> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/account/notifications");
  const supabase = await createUserClient();
  await supabase.rpc("mark_notifications_read", {});
  refresh();
}

export async function saveNotificationPreferences(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/account/notifications");
  const parsed = notificationPreferencesSchema.safeParse({
    emailEnabled: formData.get("emailEnabled") === "on",
    pushEnabled: formData.get("pushEnabled") === "on",
    whatsappEnabled: formData.get("whatsappEnabled") === "on",
    whatsappNumber: formData.get("whatsappNumber") ?? "",
    alertsEnabled: formData.get("alertsEnabled") === "on",
    quietHoursEnabled: formData.get("quietHoursEnabled") === "on",
    timezone: formData.get("timezone") ?? "",
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: formValues(formData) };

  const supabase = await createUserClient();
  const { error } = await supabase
    .from("notification_preferences")
    .update({
      email_enabled: parsed.data.emailEnabled,
      push_enabled: parsed.data.pushEnabled,
      whatsapp_enabled: parsed.data.whatsappEnabled,
      whatsapp_number: parsed.data.whatsappNumber || null,
      alerts_enabled: parsed.data.alertsEnabled,
      quiet_hours_enabled: parsed.data.quietHoursEnabled,
      timezone: parsed.data.timezone || null,
    })
    .eq("user_id", viewer.id);
  if (error) return { error: friendlyDbError(error), values: formValues(formData) };
  refresh();
  return { ok: true, message: "Notification settings saved." };
}

const webPushInput = z.object({
  endpoint: z.url().max(1000),
  p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/),
  auth: z.string().regex(/^[A-Za-z0-9_-]{16,32}$/),
});

/** Saves this browser's push subscription for the signed-in account. */
export async function saveWebPushSubscription(input: z.input<typeof webPushInput>): Promise<{ error?: string }> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Sign in first." };
  const parsed = webPushInput.safeParse(input);
  if (!parsed.success) return { error: "This browser returned an unexpected subscription." };
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("register_web_push", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.p256dh,
    p_auth: parsed.data.auth,
  });
  return error
    ? { error: error.code === "23514" ? "This browser's notification service isn't supported. Try Chrome, Edge, Firefox or Safari." : friendlyDbError(error) }
    : {};
}

export async function removeWebPushSubscription(endpoint: string): Promise<void> {
  const viewer = await getViewer();
  if (!viewer || typeof endpoint !== "string") return;
  const supabase = await createUserClient();
  await supabase.rpc("unregister_web_push", { p_endpoint: endpoint });
}

const ALERT_CHANNELS = ["in_app", "email", "push", "whatsapp"] as const;

/** Team members choose how they hear about new enquiries and listings to review. */
export async function saveTeamAlerts(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/account/notifications");
  const pick = (name: string) => ALERT_CHANNELS.filter((channel) => formData.getAll(name).includes(channel));
  const supabase = await createUserClient();
  const { error } = await supabase
    .from("notification_preferences")
    .update({ enquiry_alerts: pick("enquiryAlerts"), review_alerts: pick("reviewAlerts") })
    .eq("user_id", viewer.id);
  if (error) return { error: friendlyDbError(error) };
  refresh();
  return { ok: true, message: "Team alerts saved." };
}
