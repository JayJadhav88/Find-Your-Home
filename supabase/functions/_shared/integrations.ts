// Integration settings and keys saved by administrators (Supabase Vault), loaded by workers.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

export interface IntegrationConfig {
  email_from: string | null;
  email_reply_to: string | null;
  whatsapp_enabled: boolean;
  whatsapp_phone_number_id: string | null;
  whatsapp_templates: Record<string, unknown>;
  push_enabled: boolean;
  sheets_enabled: boolean;
  sheets_webhook_url: string | null;
  payments_enabled: boolean;
  razorpay_key_id: string | null;
  sms_provider: "msg91" | "2factor" | null;
  sms_sender_id: string | null;
  sms_template_id: string | null;
  otp_sign_in_enabled: boolean;
  otp_leads_enabled: boolean;
  secrets: Record<string, string>;
}

export async function loadIntegrationConfig(db: SupabaseClient): Promise<IntegrationConfig> {
  const { data, error } = await db.rpc("worker_integration_config");
  if (error) throw new Error(`Could not load integration settings: ${error.message}`);
  const config = (data ?? {}) as Partial<IntegrationConfig>;
  return {
    email_from: config.email_from ?? null,
    email_reply_to: config.email_reply_to ?? null,
    whatsapp_enabled: Boolean(config.whatsapp_enabled),
    whatsapp_phone_number_id: config.whatsapp_phone_number_id ?? null,
    whatsapp_templates: (config.whatsapp_templates ?? {}) as Record<string, unknown>,
    push_enabled: config.push_enabled ?? true,
    sheets_enabled: Boolean(config.sheets_enabled),
    sheets_webhook_url: config.sheets_webhook_url ?? null,
    payments_enabled: Boolean(config.payments_enabled),
    razorpay_key_id: config.razorpay_key_id ?? null,
    sms_provider: config.sms_provider ?? null,
    sms_sender_id: config.sms_sender_id ?? null,
    sms_template_id: config.sms_template_id ?? null,
    otp_sign_in_enabled: Boolean(config.otp_sign_in_enabled),
    otp_leads_enabled: Boolean(config.otp_leads_enabled),
    secrets: (config.secrets ?? {}) as Record<string, string>,
  };
}

/** SMS settings for one-time codes. */
export function smsConfig(config: IntegrationConfig) {
  return {
    provider: config.sms_provider,
    apiKey: config.secrets.sms_api_key ?? null,
    senderId: config.sms_sender_id,
    templateId: config.sms_template_id,
  };
}

/** Razorpay keys: Admin → Integrations first, then Edge Function secrets (older setups). */
export function razorpayConfig(config: IntegrationConfig, env: (name: string) => string | undefined) {
  const fromAdmin = config.razorpay_key_id && config.secrets.razorpay_key_secret;
  if (fromAdmin) {
    return config.payments_enabled
      ? { keyId: config.razorpay_key_id!, keySecret: config.secrets.razorpay_key_secret!, webhookSecret: config.secrets.razorpay_webhook_secret ?? null }
      : null;
  }
  const keyId = env("RAZORPAY_KEY_ID");
  const keySecret = env("RAZORPAY_KEY_SECRET");
  return keyId && keySecret ? { keyId, keySecret, webhookSecret: env("RAZORPAY_WEBHOOK_SECRET") ?? null } : null;
}
