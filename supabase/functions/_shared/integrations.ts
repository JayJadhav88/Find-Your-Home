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
    secrets: (config.secrets ?? {}) as Record<string, string>,
  };
}
