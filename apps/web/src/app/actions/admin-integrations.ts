"use server";

import { refresh, updateTag } from "next/cache";
import { getViewer, isAdmin } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";
import { formValues, friendlyDbError, type FormState } from "./types";

// Admin → Integrations: payments (Razorpay), SMS one-time codes, maps and the team calendar.
// Keys go to Vault through admin_set_integration_secret and are never read back.

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };
const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

async function adminClient() {
  return isAdmin(await getViewer()) ? createUserClient() : null;
}

async function saveSecret(supabase: Awaited<ReturnType<typeof createUserClient>>, name: string, value: string): Promise<string | null> {
  if (!value) return null; // empty field = keep the saved key
  const { error } = await supabase.rpc("admin_set_integration_secret", { p_name: name, p_value: value });
  return error ? friendlyDbError(error) : null;
}

export async function savePaymentIntegration(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await adminClient();
  if (!supabase) return NOT_ALLOWED;
  const keyId = text(formData, "razorpayKeyId");
  if (keyId && !/^rzp_(test|live)_[A-Za-z0-9]{6,40}$/.test(keyId)) {
    return { fieldErrors: { razorpayKeyId: "The Key Id starts with rzp_test_ or rzp_live_." }, values: formValues(formData) };
  }
  const { error } = await supabase
    .from("integration_settings")
    .update({ payments_enabled: formData.get("paymentsEnabled") === "on", razorpay_key_id: keyId || null })
    .eq("id", true);
  if (error) return { error: friendlyDbError(error) };
  const secretError =
    (await saveSecret(supabase, "razorpay_key_secret", text(formData, "razorpayKeySecret"))) ??
    (await saveSecret(supabase, "razorpay_webhook_secret", text(formData, "razorpayWebhookSecret")));
  if (secretError) return { error: secretError };
  updateTag("integrations");
  refresh();
  return { ok: true, message: "Payment settings saved." };
}

export async function saveSmsIntegration(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await adminClient();
  if (!supabase) return NOT_ALLOWED;
  const provider = text(formData, "smsProvider");
  const senderId = text(formData, "smsSenderId").toUpperCase();
  const templateId = text(formData, "smsTemplateId");
  if (provider && provider !== "msg91" && provider !== "2factor") return { error: "Choose MSG91 or 2Factor." };
  if (senderId && !/^[A-Z]{6}$/.test(senderId)) return { fieldErrors: { smsSenderId: "The sender id is 6 capital letters, e.g. FYHOME." }, values: formValues(formData) };
  if (templateId && !/^[A-Za-z0-9_-]{1,80}$/.test(templateId)) return { fieldErrors: { smsTemplateId: "Letters, numbers, - and _ only." }, values: formValues(formData) };
  if (provider === "msg91" && !templateId) return { fieldErrors: { smsTemplateId: "MSG91 needs the OTP template id." }, values: formValues(formData) };
  const { error } = await supabase
    .from("integration_settings")
    .update({
      sms_provider: (provider || null) as "msg91" | "2factor" | null,
      sms_sender_id: senderId || null,
      sms_template_id: templateId || null,
      otp_sign_in_enabled: formData.get("otpSignIn") === "on",
      otp_leads_enabled: formData.get("otpLeads") === "on",
    })
    .eq("id", true);
  if (error) return { error: friendlyDbError(error) };
  const secretError = await saveSecret(supabase, "sms_api_key", text(formData, "smsApiKey"));
  if (secretError) return { error: secretError };
  updateTag("integrations");
  refresh();
  return { ok: true, message: "SMS settings saved." };
}

export async function saveMapsIntegration(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await adminClient();
  if (!supabase) return NOT_ALLOWED;
  const provider = text(formData, "mapsProvider") === "google" ? "google" : "osm";
  const key = text(formData, "googleMapsKey");
  if (key && !/^AIza[0-9A-Za-z_-]{30,60}$/.test(key)) return { fieldErrors: { googleMapsKey: "A Google Maps key starts with AIza." }, values: formValues(formData) };
  if (provider === "google" && !key) return { fieldErrors: { googleMapsKey: "Add the Google Maps key, or choose OpenStreetMap." }, values: formValues(formData) };
  const { error } = await supabase.from("integration_settings").update({ maps_provider: provider, google_maps_key: key || null }).eq("id", true);
  if (error) return { error: friendlyDbError(error) };
  updateTag("integrations");
  refresh();
  return { ok: true, message: "Map settings saved." };
}

export async function newCalendarLink(): Promise<FormState> {
  const supabase = await adminClient();
  if (!supabase) return NOT_ALLOWED;
  const { data, error } = await supabase.rpc("admin_new_calendar_link");
  if (error || !data) return { error: friendlyDbError(error) };
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  return { ok: true, message: `Your new calendar link (copy it now, it is shown only once; the old link stops working): ${site}/api/calendar/${data}.ics` };
}
