import { describe, expect, it, vi } from "vitest";
import { sendExpoPush, sendWhatsAppTemplate, whatsappParameter, whatsappTemplateFor } from "./channels";

const respond = (status: number, body: unknown) =>
  vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & {
    mock: { calls: Array<[string, RequestInit]> };
  };

describe("Expo push", () => {
  const message = { title: "Listing received", body: "Usually reviewed within 12 hours.", data: { kind: "listing_received" } };

  it("sends one message per device and reports success", async () => {
    const fetchImpl = respond(200, { data: [{ status: "ok", id: "t1" }, { status: "ok", id: "t2" }] });
    const result = await sendExpoPush(["ExponentPushToken[a]", "ExponentPushToken[b]"], message, { fetchImpl });
    expect(result).toMatchObject({ delivered: true, goneTokens: [] });
    const sent = JSON.parse(fetchImpl.mock.calls[0]![1].body as string);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ to: "ExponentPushToken[a]", title: "Listing received", sound: "default" });
  });

  it("reports uninstalled devices for removal", async () => {
    const fetchImpl = respond(200, {
      data: [{ status: "ok" }, { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }],
    });
    const result = await sendExpoPush(["ExponentPushToken[a]", "ExponentPushToken[b]"], message, { fetchImpl });
    expect(result.goneTokens).toEqual(["ExponentPushToken[b]"]);
    expect(result.delivered).toBe(true);
  });

  it("retries when the service is overloaded", async () => {
    const result = await sendExpoPush(["ExponentPushToken[a]"], message, { fetchImpl: respond(503, {}) });
    expect(result).toMatchObject({ delivered: false, retryable: true });
  });

  it("sends the access token when one is configured", async () => {
    const fetchImpl = respond(200, { data: [{ status: "ok" }] });
    await sendExpoPush(["ExponentPushToken[a]"], message, { fetchImpl, accessToken: "expo-secret" });
    expect((fetchImpl.mock.calls[0]![1].headers as Record<string, string>).Authorization).toBe("Bearer expo-secret");
  });
});

describe("WhatsApp", () => {
  const config = { phoneNumberId: "123456789012", accessToken: "meta-token" };
  const template = { name: "account_update", language: "en" };

  it("sends an approved template with the notification text as variables", async () => {
    const fetchImpl = respond(200, { messages: [{ id: "wamid.1" }] });
    const result = await sendWhatsAppTemplate(config, "+919876543210", template, ["Your listing is live", "Sunny flat\nis approved"], fetchImpl);
    expect(result).toEqual({ ok: true, providerMessageId: "wamid.1" });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v23.0/123456789012/messages");
    const body = JSON.parse(init.body as string);
    expect(body.to).toBe("919876543210");
    expect(body.template.components[0].parameters[1].text).toBe("Sunny flat is approved");
  });

  it("treats rate limits and expired tokens as temporary", async () => {
    expect(await sendWhatsAppTemplate(config, "+919876543210", template, [], respond(400, { error: { code: 130429, message: "rate" } }))).toMatchObject({
      ok: false,
      retryable: true,
    });
    expect(await sendWhatsAppTemplate(config, "+919876543210", template, [], respond(401, { error: { code: 190, message: "expired" } }))).toMatchObject({
      retryable: true,
    });
  });

  it("gives up on missing templates and bad numbers", async () => {
    expect(await sendWhatsAppTemplate(config, "+919876543210", template, [], respond(404, { error: { code: 132001, message: "no template" } }))).toMatchObject({
      ok: false,
      retryable: false,
    });
    expect(await sendWhatsAppTemplate(config, "12", template, [], respond(200, {}))).toMatchObject({ ok: false, retryable: false });
  });

  it("cleans template variables", () => {
    expect(whatsappParameter("a\n\tb      c")).toBe("a b   c");
    expect(whatsappParameter("")).toBe("-");
    expect(whatsappParameter("x".repeat(600))).toHaveLength(500);
  });

  it("picks a template per kind, with a default except for broadcasts", () => {
    const templates = { default: { name: "account_update", language: "en" }, broadcast: { name: "news", language: "hi" } };
    expect(whatsappTemplateFor(templates, "listing_decision")).toEqual({ name: "account_update", language: "en" });
    expect(whatsappTemplateFor(templates, "broadcast")).toEqual({ name: "news", language: "hi" });
    expect(whatsappTemplateFor({ default: templates.default }, "broadcast")).toBeNull();
    expect(whatsappTemplateFor({ default: { name: "Bad Name!" } }, "x")).toBeNull();
    expect(whatsappTemplateFor(null, "x")).toBeNull();
  });
});
