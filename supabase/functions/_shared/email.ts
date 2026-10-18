// Transactional email: provider adapter (log | resend) and templates.
// Pure TypeScript (uses only fetch), so it runs in Deno Edge Functions and in Vitest.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Stable key so a retried send is not delivered twice. */
  idempotencyKey: string;
}

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; retryable: boolean; error: string };

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<SendResult>;
}

/** Local development: prints the email instead of sending it. */
export class LogEmailProvider implements EmailProvider {
  readonly name = "log";
  constructor(private readonly log: (line: string) => void = console.log) {}

  send(message: EmailMessage): Promise<SendResult> {
    this.log(`[email:log] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`);
    return Promise.resolve({ ok: true, providerMessageId: `log-${message.idempotencyKey}` });
  }
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<SendResult> {
    let response: Response;
    try {
      response = await this.fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": message.idempotencyKey,
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      });
    } catch (error) {
      return { ok: false, retryable: true, error: `Network error: ${(error as Error).message}` };
    }

    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (response.ok && body.id) return { ok: true, providerMessageId: body.id };

    // 429 and 5xx are temporary; other 4xx (bad address, unverified domain) will not fix themselves.
    const retryable = response.status === 429 || response.status >= 500;
    return { ok: false, retryable, error: `Resend ${response.status}: ${body.message ?? body.name ?? "unknown error"}` };
  }
}

export type ProviderConfig =
  | { provider: EmailProvider }
  | { provider: null; reason: string };

/** EMAIL_PROVIDER=log|resend. Missing or incomplete config never throws: emails are marked not configured. */
export function emailProviderFromEnv(env: (name: string) => string | undefined): ProviderConfig {
  const choice = (env("EMAIL_PROVIDER") ?? "").trim().toLowerCase();
  if (choice === "log") return { provider: new LogEmailProvider() };
  if (choice === "resend") {
    const apiKey = env("RESEND_API_KEY");
    const from = env("EMAIL_FROM");
    if (!apiKey || !from) return { provider: null, reason: "EMAIL_PROVIDER=resend needs RESEND_API_KEY and EMAIL_FROM" };
    return { provider: new ResendEmailProvider(apiKey, from) };
  }
  return { provider: null, reason: "EMAIL_PROVIDER is not set" };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export interface TemplateContext {
  brandName: string;
  siteUrl: string;
  recipientName?: string | null;
}

type Data = Record<string, unknown>;

interface Rendered {
  subject: string;
  /** Plain-text paragraphs; the first link (if any) becomes the call to action. */
  paragraphs: string[];
  action?: { label: string; path: string };
}

const str = (value: unknown) => (typeof value === "string" ? value : value == null ? "" : String(value));

const TEMPLATES: Record<string, (data: Data, ctx: TemplateContext) => Rendered> = {
  listing_submitted: (data) => ({
    subject: `Listing awaiting review: ${str(data.reference)}`,
    paragraphs: [`"${str(data.title)}" (${str(data.reference)}) was submitted and is waiting for review.`],
    action: { label: "Open the moderation queue", path: "/admin/listings?status=pending_review" },
  }),

  listing_decision: (data) => {
    const decisions: Record<string, [string, string]> = {
      approve: ["is now live", "Your listing has been approved and is now visible to visitors."],
      reject: ["needs changes", "Your listing was not approved yet. Update it and submit it again."],
      suspend: ["has been suspended", "Your listing has been taken offline by our moderators."],
      reinstate: ["is live again", "Your listing has been reinstated and is visible again."],
    };
    const [headline, body] = decisions[str(data.decision)] ?? ["was reviewed", "Your listing was reviewed."];
    const paragraphs = [`"${str(data.title)}" (${str(data.reference)}) ${headline}.`, body];
    if (str(data.reason)) paragraphs.push(`Moderator note: ${str(data.reason)}`);
    return {
      subject: `Your listing ${headline}: ${str(data.reference)}`,
      paragraphs,
      action: { label: "View your listing", path: `/account/listings/${str(data.listing_id)}` },
    };
  },

  enquiry_received: (data) => ({
    subject:
      data.kind === "visit_request"
        ? `New visit request for ${str(data.reference)}`
        : `New enquiry for ${str(data.reference)}`,
    paragraphs: [
      data.kind === "visit_request"
        ? `Someone asked to visit "${str(data.title)}" (${str(data.reference)}). The visit is not confirmed until you accept it.`
        : `Someone sent an enquiry about "${str(data.title)}" (${str(data.reference)}).`,
      "Sign in to read the message and reply. For privacy, contact details are only shown in your dashboard.",
    ],
    action: { label: "Open your enquiries", path: `/account/enquiries/${str(data.enquiry_id)}` },
  }),

  visit_response: (data) => ({
    subject: data.visit_status === "confirmed" ? "Your visit is confirmed" : "Your visit request was declined",
    paragraphs: [
      data.visit_status === "confirmed"
        ? "The lister confirmed your requested visit time."
        : "The lister could not accept your requested visit time. You can send another request.",
    ],
    action: { label: "View the property", path: `/properties/${str(data.listing_id)}` },
  }),

  visit_cancelled: (data) => ({
    subject: "A visit request was cancelled",
    paragraphs: ["The person who requested a visit has cancelled it."],
    action: { label: "Open your enquiries", path: `/account/enquiries/${str(data.enquiry_id)}` },
  }),

  data_request_created: (data) => ({
    subject: `New ${str(data.kind) === "deletion" ? "account deletion" : "data export"} request`,
    paragraphs: ["A member submitted a privacy request. Handle it within your stated response time."],
    action: { label: "Open privacy requests", path: "/admin/data-requests" },
  }),
};

export class UnknownTemplateError extends Error {}

export function renderEmail(
  template: string,
  data: Data,
  ctx: TemplateContext,
): Pick<EmailMessage, "subject" | "text" | "html"> {
  const build = TEMPLATES[template];
  if (!build) throw new UnknownTemplateError(`Unknown email template: ${template}`);
  const rendered = build(data, ctx);
  const greeting = ctx.recipientName ? `Hello ${ctx.recipientName},` : "Hello,";
  const actionUrl = rendered.action ? new URL(rendered.action.path, ctx.siteUrl).toString() : null;
  const footer = `— ${ctx.brandName}`;

  const text = [
    greeting,
    "",
    ...rendered.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...(actionUrl && rendered.action ? [`${rendered.action.label}: ${actionUrl}`, ""] : []),
    footer,
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1c1b19;line-height:1.5">
<p>${escapeHtml(greeting)}</p>
${rendered.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n")}
${
  actionUrl && rendered.action
    ? `<p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#1f5f57;color:#ffffff;padding:10px 16px;border-radius:8px;text-decoration:none">${escapeHtml(rendered.action.label)}</a></p>`
    : ""
}
<p style="color:#5c5850">${escapeHtml(footer)}</p>
</body></html>`;

  return { subject: `${rendered.subject} · ${ctx.brandName}`, text, html };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
