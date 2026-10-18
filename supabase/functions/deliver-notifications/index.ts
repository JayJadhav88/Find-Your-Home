// Delivers queued phone/browser push and WhatsApp messages (notification_outbox rows with
// channel 'push' or 'whatsapp'). Email has its own worker (send-emails).
//
// Push: Expo push service for the iOS/Android app, Web Push for browsers (needs
// WEB_PUSH_PUBLIC_KEY / WEB_PUSH_PRIVATE_KEY, see `pnpm setup:web-push`).
// WhatsApp: Meta WhatsApp Cloud API with approved templates (Admin → Integrations).
// NOTIFY_LOG_ONLY=true prints messages instead of sending them (local development).
import { sendExpoPush, sendWhatsAppTemplate, whatsappTemplateFor } from "../_shared/channels.ts";
import { loadIntegrationConfig } from "../_shared/integrations.ts";
import { describeNotification, notificationWebHref } from "../_shared/notification-text.ts";
import { sendWebPush, type VapidKeys, type WebPushSubscription } from "../_shared/web-push.ts";
import { errorMessage, json, rejectUnlessWorker, serviceClient } from "../_shared/worker.ts";

interface QueuedDelivery {
  id: number;
  template: string;
  channel: "push" | "whatsapp";
  recipient_phone: string | null;
  push_tokens: string[] | null;
  web_push: WebPushSubscription[] | null;
  template_data: Record<string, unknown>;
  notification_id: number | null;
}

type Outcome =
  | { status: "sent"; providerId?: string }
  | { status: "failed"; error: string; permanent: boolean }
  | { status: "skipped_not_configured" | "skipped_preference"; error: string };

Deno.serve(async (request) => {
  const denied = rejectUnlessWorker(request);
  if (denied) return denied;

  const siteUrl = Deno.env.get("SITE_URL");
  if (!siteUrl) return json({ error: "SITE_URL is not configured" }, 500);
  const logOnly = Deno.env.get("NOTIFY_LOG_ONLY") === "true";

  const db = serviceClient();
  let config;
  try {
    config = await loadIntegrationConfig(db);
  } catch (error) {
    return json({ error: errorMessage(error) }, 500);
  }

  const { data: settings } = await db.from("site_settings").select("contact_email").maybeSingle();
  const vapid: VapidKeys | null =
    Deno.env.get("WEB_PUSH_PUBLIC_KEY") && Deno.env.get("WEB_PUSH_PRIVATE_KEY")
      ? {
          publicKey: Deno.env.get("WEB_PUSH_PUBLIC_KEY")!,
          privateKey: Deno.env.get("WEB_PUSH_PRIVATE_KEY")!,
          subject: Deno.env.get("WEB_PUSH_SUBJECT") ?? (settings?.contact_email ? `mailto:${settings.contact_email}` : siteUrl),
        }
      : null;
  const expoAccessToken = config.secrets.expo_access_token ?? Deno.env.get("EXPO_ACCESS_TOKEN");
  const whatsappToken = config.secrets.whatsapp_access_token ?? Deno.env.get("WHATSAPP_ACCESS_TOKEN");

  // Due broadcasts become queued deliveries first (in the database, one transaction each).
  const { data: broadcastsSent, error: broadcastError } = await db.rpc("worker_send_due_broadcasts");
  if (broadcastError) return json({ error: errorMessage(broadcastError) }, 500);

  const { data: queued, error } = await db.rpc("worker_claim_notifications", { p_limit: 50, p_channels: ["push", "whatsapp"] });
  if (error) return json({ error: errorMessage(error) }, 500);

  async function deliverPush(item: QueuedDelivery, title: string, body: string, href: string | null): Promise<Outcome> {
    if (!config.push_enabled) return { status: "skipped_not_configured", error: "Push is switched off in Integrations" };
    const tokens = item.push_tokens ?? [];
    const browsers = vapid ? (item.web_push ?? []) : [];
    if (!tokens.length && !browsers.length) {
      return item.web_push?.length && !vapid
        ? { status: "skipped_not_configured", error: "Browser push keys are not configured" }
        : { status: "skipped_preference", error: "No phone or browser registered, or push switched off" };
    }
    if (logOnly) {
      console.log(`[push:log] ${tokens.length} phone(s), ${browsers.length} browser(s): ${title} — ${body}`);
      return { status: "sent", providerId: "log" };
    }

    const errors: string[] = [];
    let delivered = false;
    let retryable = false;

    if (tokens.length) {
      const result = await sendExpoPush(
        tokens,
        { title, body, data: { kind: item.template, data: item.template_data, notificationId: item.notification_id } },
        { accessToken: expoAccessToken },
      );
      for (const token of result.goneTokens) await db.rpc("worker_remove_push_token", { p_token: token });
      delivered ||= result.delivered;
      retryable ||= result.retryable;
      if (result.error) errors.push(result.error);
    }

    const url = href ? new URL(href, siteUrl).toString() : siteUrl;
    const payload = JSON.stringify({ title, body, url, tag: item.notification_id ? `n${item.notification_id}` : undefined });
    for (const subscription of browsers) {
      const result = await sendWebPush(subscription, payload, vapid!);
      if (result.ok) {
        delivered = true;
        continue;
      }
      if (result.gone) await db.rpc("worker_remove_web_push", { p_endpoint: subscription.endpoint });
      retryable ||= result.retryable;
      errors.push(result.error);
    }

    if (delivered) return { status: "sent" };
    return { status: "failed", error: errors.join("; ") || "Not delivered", permanent: !retryable };
  }

  async function deliverWhatsApp(item: QueuedDelivery, title: string, body: string): Promise<Outcome> {
    if (!config.whatsapp_enabled || !config.whatsapp_phone_number_id || !whatsappToken) {
      return { status: "skipped_not_configured", error: "WhatsApp is not set up in Integrations" };
    }
    if (!item.recipient_phone) return { status: "skipped_preference", error: "Recipient has not opted in to WhatsApp" };
    const template = whatsappTemplateFor(config.whatsapp_templates, item.template);
    if (!template) return { status: "skipped_not_configured", error: `No WhatsApp template for ${item.template}` };
    if (logOnly) {
      console.log(`[whatsapp:log] to=${item.recipient_phone} template=${template.name}: ${title} — ${body}`);
      return { status: "sent", providerId: "log" };
    }
    const result = await sendWhatsAppTemplate(
      { phoneNumberId: config.whatsapp_phone_number_id, accessToken: whatsappToken, apiVersion: Deno.env.get("WHATSAPP_API_VERSION") },
      item.recipient_phone,
      template,
      [title, body],
    );
    return result.ok ? { status: "sent", providerId: result.providerMessageId } : { status: "failed", error: result.error, permanent: !result.retryable };
  }

  const results = [];
  for (const item of (queued ?? []) as QueuedDelivery[]) {
    let outcome: Outcome;
    try {
      const text = describeNotification(item.template, item.template_data);
      outcome =
        item.channel === "push"
          ? await deliverPush(item, text.title, text.body, notificationWebHref(text.target))
          : await deliverWhatsApp(item, text.title, text.body);
    } catch (failure) {
      outcome = { status: "failed", error: errorMessage(failure), permanent: false };
    }

    await db.rpc("worker_finish_notification", {
      p_id: item.id,
      p_status: outcome.status,
      p_provider_message_id: outcome.status === "sent" ? (outcome.providerId ?? null) : null,
      p_error: outcome.status === "sent" ? null : outcome.error,
      p_permanent: outcome.status === "failed" ? outcome.permanent : true,
    });
    results.push({ id: item.id, channel: item.channel, status: outcome.status });
  }

  return json({ broadcastsSent, processed: results.length, logOnly, browserPush: Boolean(vapid), results });
});
