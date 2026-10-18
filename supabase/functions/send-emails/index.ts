// Delivers notification_outbox emails through the configured provider (log | resend).
// Invoked by the scheduler. When no provider is configured, emails stay queued.
// The Resend key saved in Admin → Integrations wins over the RESEND_API_KEY variable.
import { emailProviderFromConfig, renderEmail, UnknownTemplateError } from "../_shared/email.ts";
import { loadIntegrationConfig } from "../_shared/integrations.ts";
import { errorMessage, json, rejectUnlessWorker, serviceClient } from "../_shared/worker.ts";

interface QueuedEmail {
  id: number;
  template: string;
  recipient_email: string | null;
  recipient_name: string | null;
  template_data: Record<string, unknown>;
  attempts: number;
}

Deno.serve(async (request) => {
  const denied = rejectUnlessWorker(request);
  if (denied) return denied;

  const db = serviceClient();
  let stored;
  try {
    stored = await loadIntegrationConfig(db);
  } catch (error) {
    return json({ error: errorMessage(error) }, 500);
  }
  const config = emailProviderFromConfig((name) => Deno.env.get(name), {
    resendApiKey: stored.secrets.resend_api_key,
    emailFrom: stored.email_from,
  });
  if (!config.provider) {
    // Do not claim anything: messages stay pending until email is configured.
    return json({ configured: false, reason: config.reason });
  }

  const siteUrl = Deno.env.get("SITE_URL");
  if (!siteUrl) return json({ error: "SITE_URL is not configured" }, 500);

  const { data: settings } = await db.from("site_settings").select("brand_name").maybeSingle();
  const brandName = settings?.brand_name ?? "Find Your Home";

  const { data: queued, error } = await db.rpc("worker_claim_notifications", { p_limit: 25 });
  if (error) return json({ error: errorMessage(error) }, 500);

  const results = [];
  for (const email of (queued ?? []) as QueuedEmail[]) {
    const finish = (status: string, extra: { id?: string; error?: string; permanent?: boolean } = {}) =>
      db.rpc("worker_finish_notification", {
        p_id: email.id,
        p_status: status,
        p_provider_message_id: extra.id ?? null,
        p_error: extra.error ?? null,
        p_permanent: extra.permanent ?? false,
      });

    if (!email.recipient_email) {
      await finish("failed", { error: "Recipient has no active account or email", permanent: true });
      results.push({ id: email.id, status: "failed", reason: "no recipient" });
      continue;
    }

    try {
      const content = renderEmail(email.template, email.template_data, {
        brandName,
        siteUrl,
        recipientName: email.recipient_name,
      });
      const sent = await config.provider.send({
        ...content,
        to: email.recipient_email,
        idempotencyKey: `outbox-${email.id}`,
      });

      if (sent.ok) {
        await finish("sent", { id: sent.providerMessageId });
        results.push({ id: email.id, status: "sent" });
      } else {
        await finish("failed", { error: sent.error, permanent: !sent.retryable });
        results.push({ id: email.id, status: "failed", retryable: sent.retryable });
      }
    } catch (failure) {
      const permanent = failure instanceof UnknownTemplateError;
      await finish("failed", { error: errorMessage(failure), permanent });
      results.push({ id: email.id, status: "failed", retryable: !permanent });
    }
  }

  return json({ configured: true, provider: config.provider.name, processed: results.length, results });
});
