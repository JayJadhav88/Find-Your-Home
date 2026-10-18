import { describe, expect, it, vi } from "vitest";
import {
  emailProviderFromConfig,
  emailProviderFromEnv,
  LogEmailProvider,
  renderEmail,
  ResendEmailProvider,
  UnknownTemplateError,
  type EmailMessage,
} from "./email";

const ctx = { brandName: "Find Your Home", siteUrl: "http://localhost:3000", recipientName: "Sam" };

const message: EmailMessage = {
  to: "owner@example.test",
  subject: "Subject",
  text: "Text",
  html: "<p>Text</p>",
  idempotencyKey: "outbox-42",
};

describe("renderEmail", () => {
  it("renders a decision email with the moderator note and a link", () => {
    const email = renderEmail(
      "listing_decision",
      { decision: "reject", title: "Sunny flat", reference: "FYH-001001", listing_id: "abc", reason: "Add photos" },
      ctx,
    );
    expect(email.subject).toBe("Your listing needs changes: FYH-001001 · Find Your Home");
    expect(email.text).toContain("Moderator note: Add photos");
    expect(email.text).toContain("http://localhost:3000/account/listings/abc");
    expect(email.text.startsWith("Hello Sam,")).toBe(true);
  });

  it("omits a hidden moderator note", () => {
    const email = renderEmail("listing_decision", { decision: "reject", reason: null }, ctx);
    expect(email.text).not.toContain("Moderator note");
  });

  it("escapes user-controlled text in HTML", () => {
    const email = renderEmail(
      "listing_submitted",
      { title: '<script>alert("x")</script>', reference: "FYH-1" },
      ctx,
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("does not put enquirer contact details or messages in lead emails", () => {
    const email = renderEmail(
      "enquiry_received",
      { kind: "enquiry", title: "Flat", reference: "FYH-1", enquiry_id: "e1", email: "lead@example.test", message: "secret" },
      ctx,
    );
    expect(email.text).not.toContain("lead@example.test");
    expect(email.text).not.toContain("secret");
  });

  it("says visit requests are not confirmed yet", () => {
    const email = renderEmail("enquiry_received", { kind: "visit_request", reference: "FYH-1" }, ctx);
    expect(email.text).toContain("not confirmed until you accept it");
  });

  it("rejects unknown templates", () => {
    expect(() => renderEmail("nope", {}, ctx)).toThrow(UnknownTemplateError);
  });
});

describe("emailProviderFromEnv", () => {
  const env = (values: Record<string, string>) => (name: string) => values[name];

  it("uses the log provider for local development", () => {
    const config = emailProviderFromEnv(env({ EMAIL_PROVIDER: "log" }));
    expect(config.provider?.name).toBe("log");
  });

  it("reports missing Resend configuration instead of throwing", () => {
    const config = emailProviderFromEnv(env({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_x" }));
    expect(config.provider).toBeNull();
  });

  it("is not configured when EMAIL_PROVIDER is unset", () => {
    expect(emailProviderFromEnv(env({})).provider).toBeNull();
  });
});

describe("LogEmailProvider", () => {
  it("logs instead of sending", async () => {
    const lines: string[] = [];
    const result = await new LogEmailProvider((line) => lines.push(line)).send(message);
    expect(result).toEqual({ ok: true, providerMessageId: "log-outbox-42" });
    expect(lines[0]).toContain("to=owner@example.test");
  });
});

describe("ResendEmailProvider", () => {
  function provider(response: Response | Error) {
    const fetchMock = vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)));
    return { fetchMock, provider: new ResendEmailProvider("re_test_key", "Find Your Home <noreply@example.test>", fetchMock as unknown as typeof fetch) };
  }

  it("sends with an idempotency key and returns the message id", async () => {
    const { fetchMock, provider: resend } = provider(new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }));
    const result = await resend.send(message);

    expect(result).toEqual({ ok: true, providerMessageId: "msg_1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("outbox-42");
    expect(JSON.parse(init.body as string).to).toEqual(["owner@example.test"]);
  });

  it("retries rate limits and server errors", async () => {
    for (const status of [429, 500, 503]) {
      const { provider: resend } = provider(new Response(JSON.stringify({ message: "busy" }), { status }));
      expect(await resend.send(message)).toMatchObject({ ok: false, retryable: true });
    }
  });

  it("does not retry permanent errors", async () => {
    const { provider: resend } = provider(new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 }));
    expect(await resend.send(message)).toMatchObject({ ok: false, retryable: false, error: expect.stringContaining("domain not verified") });
  });

  it("treats network failures as retryable", async () => {
    const { provider: resend } = provider(new Error("ECONNRESET"));
    expect(await resend.send(message)).toMatchObject({ ok: false, retryable: true });
  });
});

describe("kinds without a dedicated email", () => {
  it("use the shared notification wording", () => {
    const email = renderEmail("broadcast", { title: "New projects in Pune", body: "Ten new homes this week.", url: "/search?category=new_project" }, ctx);
    expect(email.subject).toBe("New projects in Pune · Find Your Home");
    expect(email.text).toContain("Ten new homes this week.");
    expect(email.text).toContain("http://localhost:3000/search?category=new_project");
  });

  it("still refuse unknown kinds", () => {
    expect(() => renderEmail("no_such_kind", {}, ctx)).toThrow(UnknownTemplateError);
  });
});

describe("emailProviderFromConfig", () => {
  const env = (values: Record<string, string>) => (name: string) => values[name];

  it("prefers the key saved by an administrator", () => {
    const config = emailProviderFromConfig(env({ EMAIL_PROVIDER: "log" }), { resendApiKey: "re_saved", emailFrom: "Find Your Home <hi@example.test>" });
    expect(config.provider?.name).toBe("resend");
  });

  it("needs a sender address with a saved key", () => {
    expect(emailProviderFromConfig(env({}), { resendApiKey: "re_saved" }).provider).toBeNull();
    expect(emailProviderFromConfig(env({ EMAIL_FROM: "a@example.test" }), { resendApiKey: "re_saved" }).provider?.name).toBe("resend");
  });

  it("falls back to environment variables", () => {
    expect(emailProviderFromConfig(env({ EMAIL_PROVIDER: "log" }), {}).provider?.name).toBe("log");
  });
});
