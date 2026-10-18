// Phone push (Expo push service) and WhatsApp (Meta WhatsApp Cloud API) senders.
// Pure TypeScript (fetch only), so it runs in Deno Edge Functions and in Vitest.

export type ChannelResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; retryable: boolean; error: string };

// ---------------------------------------------------------------------------
// Expo push (iOS and Android apps)
// ---------------------------------------------------------------------------
export interface PushMessage {
  title: string;
  body: string;
  /** Delivered to the app with the notification; used to open the right screen. */
  data: Record<string, unknown>;
}

export interface ExpoPushOutcome {
  /** At least one device accepted the message. */
  delivered: boolean;
  /** Devices the push service says no longer exist; remove them. */
  goneTokens: string[];
  retryable: boolean;
  error?: string;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function sendExpoPush(
  tokens: string[],
  message: PushMessage,
  options: { accessToken?: string; fetchImpl?: typeof fetch } = {},
): Promise<ExpoPushOutcome> {
  if (!tokens.length) return { delivered: false, goneTokens: [], retryable: false, error: "No devices" };

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      },
      body: JSON.stringify(
        tokens.slice(0, 100).map((to) => ({
          to,
          title: message.title,
          body: message.body,
          data: message.data,
          sound: "default",
          channelId: "default",
          priority: "high",
        })),
      ),
    });
  } catch (error) {
    return { delivered: false, goneTokens: [], retryable: true, error: `Network error: ${(error as Error).message}` };
  }

  const payload = (await response.json().catch(() => ({}))) as {
    data?: Array<{ status: "ok" | "error"; id?: string; message?: string; details?: { error?: string } }>;
    errors?: Array<{ message?: string }>;
  };
  if (!response.ok || !Array.isArray(payload.data)) {
    return {
      delivered: false,
      goneTokens: [],
      retryable: response.status === 429 || response.status >= 500,
      error: `Expo push ${response.status}: ${payload.errors?.[0]?.message ?? "unexpected response"}`,
    };
  }

  const goneTokens: string[] = [];
  const errors: string[] = [];
  let delivered = false;
  let retryable = false;
  payload.data.forEach((ticket, index) => {
    if (ticket.status === "ok") {
      delivered = true;
      return;
    }
    const code = ticket.details?.error ?? "Unknown";
    if (code === "DeviceNotRegistered") goneTokens.push(tokens[index]!);
    if (code === "MessageRateExceeded") retryable = true;
    errors.push(`${code}${ticket.message ? `: ${ticket.message}` : ""}`);
  });
  return { delivered, goneTokens, retryable: !delivered && retryable, error: errors.length ? errors.join("; ") : undefined };
}

// ---------------------------------------------------------------------------
// WhatsApp Cloud API (template messages)
// ---------------------------------------------------------------------------
export interface WhatsAppTemplate {
  name: string;
  language: string;
}

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  apiVersion?: string;
}

/** Template variables cannot contain line breaks, tabs or more than four spaces in a row. */
export function whatsappParameter(value: string, max = 500): string {
  const clean = value.replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean || "-";
}

/** Template for a notification kind: a kind-specific one, else "default". */
export function whatsappTemplateFor(templates: unknown, kind: string): WhatsAppTemplate | null {
  if (!templates || typeof templates !== "object") return null;
  const map = templates as Record<string, unknown>;
  const entry = (map[kind] ?? (kind === "broadcast" ? null : map.default)) as Partial<WhatsAppTemplate> | null | undefined;
  if (!entry || typeof entry.name !== "string" || !/^[a-z0-9_]{1,512}$/.test(entry.name)) return null;
  const language = typeof entry.language === "string" && /^[a-z]{2,3}(_[A-Z]{2})?$/.test(entry.language) ? entry.language : "en";
  return { name: entry.name, language };
}

// Meta error codes that clear up by themselves (rate limits, temporary failures).
const WHATSAPP_RETRYABLE_CODES = new Set([1, 2, 4, 80007, 130429, 131000, 131016, 131056, 133004, 190]);

export async function sendWhatsAppTemplate(
  config: WhatsAppConfig,
  to: string,
  template: WhatsAppTemplate,
  parameters: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<ChannelResult> {
  const number = to.replace(/^\+/, "");
  if (!/^[1-9][0-9]{7,14}$/.test(number)) return { ok: false, retryable: false, error: "Invalid WhatsApp number" };
  if (!/^[0-9]{5,30}$/.test(config.phoneNumberId)) return { ok: false, retryable: false, error: "Invalid phone number ID" };

  let response: Response;
  try {
    response = await fetchImpl(
      `https://graph.facebook.com/${config.apiVersion ?? "v23.0"}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: number,
          type: "template",
          template: {
            name: template.name,
            language: { code: template.language },
            components: parameters.length
              ? [{ type: "body", parameters: parameters.map((text) => ({ type: "text", text: whatsappParameter(text) })) }]
              : [],
          },
        }),
      },
    );
  } catch (error) {
    return { ok: false, retryable: true, error: `Network error: ${(error as Error).message}` };
  }

  const body = (await response.json().catch(() => ({}))) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string; code?: number };
  };
  const id = body.messages?.[0]?.id;
  if (response.ok && id) return { ok: true, providerMessageId: id };
  const code = body.error?.code;
  const retryable = response.status === 429 || response.status >= 500 || (code !== undefined && WHATSAPP_RETRYABLE_CODES.has(code));
  return { ok: false, retryable, error: `WhatsApp ${response.status}${code ? ` (${code})` : ""}: ${body.error?.message ?? "unknown error"}` };
}
