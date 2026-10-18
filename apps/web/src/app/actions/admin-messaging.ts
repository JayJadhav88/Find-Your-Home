"use server";

import { NOTIFICATION_CHANNELS, safeNotificationUrl, zonedLocalToUtc } from "@fyh/shared";
import { refresh } from "next/cache";
import { z } from "zod";
import { canSendBroadcasts, getViewer, isAdmin } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";
import { formValues, friendlyDbError, type FormState } from "./types";

// Integrations (administrators) and broadcasts (administrators and marketing). The database
// checks the same permissions again; keys are written to Vault and never read back.

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };
const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

async function adminClient() {
  const viewer = await getViewer();
  return isAdmin(viewer) ? createUserClient() : null;
}

async function saveSecret(supabase: Awaited<ReturnType<typeof createUserClient>>, name: string, value: string): Promise<string | null> {
  if (!value) return null; // empty field = keep the saved key
  const { error } = await supabase.rpc("admin_set_integration_secret", { p_name: name, p_value: value });
  return error ? friendlyDbError(error) : null;
}

const EMAIL_FROM = /^([^<>@]{1,100}<[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>|[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+)$/;

export async function saveEmailIntegration(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await adminClient();
  if (!supabase) return NOT_ALLOWED;
  const from = text(formData, "emailFrom");
  const replyTo = text(formData, "emailReplyTo");
  if (from && !EMAIL_FROM.test(from)) return { fieldErrors: { emailFrom: "Use name@domain.com or Name <name@domain.com>." }, values: formValues(formData) };
  if (replyTo && !z.email().safeParse(replyTo).success) return { fieldErrors: { emailReplyTo: "Enter a valid email address." }, values: formValues(formData) };

  const { error } = await supabase.from("integration_settings").update({ email_from: from || null, email_reply_to: replyTo || null }).eq("id", true);
  if (error) return { error: friendlyDbError(error) };
  const secretError = await saveSecret(supabase, "resend_api_key", text(formData, "resendApiKey"));
  if (secretError) return { error: secretError };
  refresh();
  return { ok: true, message: "Email settings saved." };
}

const templateName = z.string().regex(/^[a-z0-9_]{1,512}$/, "Template names use lowercase letters, numbers and _.");
const templateLanguage = z.string().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, "Language code like en, hi or en_US.");

export async function saveWhatsAppIntegration(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await adminClient();
  if (!supabase) return NOT_ALLOWED;
  const parsed = z
    .object({
      enabled: z.boolean(),
      phoneNumberId: z.string().regex(/^([0-9]{5,30})?$/, "The phone number ID is a long number from Meta's WhatsApp Manager."),
      defaultName: templateName.or(z.literal("")),
      defaultLanguage: templateLanguage,
      broadcastName: templateName.or(z.literal("")),
      broadcastLanguage: templateLanguage,
    })
    .safeParse({
      enabled: formData.get("whatsappEnabled") === "on",
      phoneNumberId: text(formData, "phoneNumberId"),
      defaultName: text(formData, "defaultTemplate"),
      defaultLanguage: text(formData, "defaultLanguage") || "en",
      broadcastName: text(formData, "broadcastTemplate"),
      broadcastLanguage: text(formData, "broadcastLanguage") || "en",
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the WhatsApp details.", values: formValues(formData) };
  const values = parsed.data;
  if (values.enabled && (!values.phoneNumberId || !values.defaultName)) {
    return { error: "To switch WhatsApp on, add the phone number ID and at least the default template.", values: formValues(formData) };
  }

  const templates: Record<string, { name: string; language: string }> = {};
  if (values.defaultName) templates.default = { name: values.defaultName, language: values.defaultLanguage };
  if (values.broadcastName) templates.broadcast = { name: values.broadcastName, language: values.broadcastLanguage };

  const { error } = await supabase
    .from("integration_settings")
    .update({ whatsapp_enabled: values.enabled, whatsapp_phone_number_id: values.phoneNumberId || null, whatsapp_templates: templates })
    .eq("id", true);
  if (error) return { error: friendlyDbError(error) };
  const secretError = await saveSecret(supabase, "whatsapp_access_token", text(formData, "whatsappToken"));
  if (secretError) return { error: secretError };
  refresh();
  return { ok: true, message: "WhatsApp settings saved." };
}

export async function savePushIntegration(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await adminClient();
  if (!supabase) return NOT_ALLOWED;
  const { error } = await supabase.from("integration_settings").update({ push_enabled: formData.get("pushEnabled") === "on" }).eq("id", true);
  if (error) return { error: friendlyDbError(error) };
  const secretError = await saveSecret(supabase, "expo_access_token", text(formData, "expoToken"));
  if (secretError) return { error: secretError };
  refresh();
  return { ok: true, message: "Push settings saved." };
}

export async function removeIntegrationKey(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await adminClient();
  if (!supabase) return NOT_ALLOWED;
  const { error } = await supabase.rpc("admin_set_integration_secret", { p_name: text(formData, "name"), p_value: "" });
  if (error) return { error: friendlyDbError(error) };
  refresh();
  return { ok: true, message: "Key removed." };
}

export async function sendIntegrationTest(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await adminClient();
  if (!supabase) return NOT_ALLOWED;
  const channel = z.enum(NOTIFICATION_CHANNELS).safeParse(formData.get("channel"));
  if (!channel.success) return { error: "Unknown channel." };
  const { error } = await supabase.rpc("admin_send_test_notification", { p_channel: channel.data });
  if (error) return { error: friendlyDbError(error) };
  const where = { email: "your email", push: "your phone or browser", whatsapp: "your WhatsApp" }[channel.data];
  return {
    ok: true,
    message: `Test queued for ${where}. It arrives on the next worker run (usually within a minute). If it doesn't, check the delivery log below.`,
  };
}

// ---------------------------------------------------------------------------
// Broadcasts
// ---------------------------------------------------------------------------
const broadcastInput = z.object({
  title: z.string().trim().min(1, "Add a title.").max(80, "Keep the title under 80 characters."),
  body: z.string().trim().min(1, "Write the message.").max(500, "Keep the message under 500 characters."),
  url: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === "" || safeNotificationUrl(value) !== null, "Use a page on this site (starting with /) or an https:// link."),
  audience: z.enum(["everyone", "owners", "buyers", "builders", "team"]),
  cityId: z.union([z.uuid(), z.literal("")]),
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)),
  scheduledAt: z.string().trim(),
  timeZone: z.string().trim().max(64),
});

export async function createBroadcast(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!canSendBroadcasts(viewer)) return NOT_ALLOWED;
  const parsed = broadcastInput.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    url: formData.get("url") ?? "",
    audience: formData.get("audience"),
    cityId: formData.get("cityId") ?? "",
    channels: formData.getAll("channels"),
    scheduledAt: formData.get("scheduledAt") ?? "",
    timeZone: formData.get("timeZone") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, values: formValues(formData) };
  }
  const values = parsed.data;

  const supabase = await createUserClient();
  let scheduledAt: string | null = null;
  if (values.scheduledAt) {
    // datetime-local has no zone: interpret it in the site's time zone.
    const { data: settings } = await supabase.from("site_settings").select("default_timezone").single();
    try {
      scheduledAt = zonedLocalToUtc(values.scheduledAt, values.timeZone || settings?.default_timezone || "UTC");
    } catch {
      return { fieldErrors: { scheduledAt: "Choose a valid date and time." }, values: formValues(formData) };
    }
  }

  const { error } = await supabase.rpc("admin_create_broadcast", {
    p_title: values.title,
    p_body: values.body,
    p_url: values.url,
    p_audience: values.audience,
    // No city = whole audience; the generated type does not mark the uuid as nullable.
    p_city: values.cityId || (null as unknown as string),
    p_channels: values.channels,
    p_scheduled_at: scheduledAt ?? undefined,
  });
  if (error) return { error: friendlyDbError(error), values: formValues(formData) };
  refresh();
  return {
    ok: true,
    message: scheduledAt
      ? "Scheduled. It will be sent at the chosen time."
      : "Sending now. It appears in the app within a minute; emails and WhatsApp follow, respecting quiet hours.",
  };
}

export async function cancelBroadcast(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!canSendBroadcasts(viewer)) return NOT_ALLOWED;
  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!id.success) return { error: "Unknown message." };
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("admin_cancel_broadcast", { p_id: id.data });
  if (error) return { error: friendlyDbError(error) };
  refresh();
  return { ok: true, message: "Cancelled." };
}

// ---------------------------------------------------------------------------
// Google Sheets
// ---------------------------------------------------------------------------
const SHEET_WEBHOOK = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{10,200}\/exec$/;

export async function saveSheetsIntegration(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await adminClient();
  if (!supabase) return NOT_ALLOWED;
  const url = text(formData, "sheetsUrl");
  const enabled = formData.get("sheetsEnabled") === "on";
  if (url && !SHEET_WEBHOOK.test(url)) {
    return { fieldErrors: { sheetsUrl: "Paste the web app URL from Apps Script: https://script.google.com/macros/s/…/exec" }, values: formValues(formData) };
  }
  if (enabled && !url) return { fieldErrors: { sheetsUrl: "Add the web app URL to switch Google Sheets on." }, values: formValues(formData) };
  const { error } = await supabase.from("integration_settings").update({ sheets_enabled: enabled, sheets_webhook_url: url || null }).eq("id", true);
  if (error) return { error: friendlyDbError(error) };
  refresh();
  return { ok: true, message: enabled ? "Saved. New enquiries will be added to the sheet." : "Saved." };
}

export async function createSheetsSecret(): Promise<FormState> {
  const supabase = await adminClient();
  if (!supabase) return NOT_ALLOWED;
  const { data, error } = await supabase.rpc("admin_new_sheets_secret");
  if (error || !data) return { error: friendlyDbError(error) };
  refresh();
  return { ok: true, message: `New secret (shown only now): ${data} — paste it into the script in place of PASTE_SECRET_HERE, then deploy a new version.` };
}

export async function syncAllEnquiriesToSheet(): Promise<FormState> {
  const supabase = await adminClient();
  if (!supabase) return NOT_ALLOWED;
  const { data, error } = await supabase.rpc("admin_sync_all_enquiries_to_sheet");
  if (error) return { error: friendlyDbError(error) };
  return { ok: true, message: `${data ?? 0} enquiries queued. They appear in the sheet over the next few minutes.` };
}
