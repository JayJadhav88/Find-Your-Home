import { describe, expect, it, vi } from "vitest";
import { sendOtpSms, smsDigits } from "./sms";

const respond = (status: number, body: unknown) =>
  vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & {
    mock: { calls: Array<[string, RequestInit]> };
  };

describe("sms", () => {
  it("normalises Indian numbers", () => {
    expect(smsDigits("+91 98765 43210")).toBe("919876543210");
    expect(smsDigits("09876543210")).toBe("919876543210");
    expect(smsDigits("98765-43210")).toBe("919876543210");
  });

  it("sends through MSG91 with the DLT template and the key in a header", async () => {
    const fetchImpl = respond(200, { type: "success" });
    await sendOtpSms({ provider: "msg91", apiKey: "key-123456", templateId: "tmpl1" }, "98765 43210", "123456", fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toContain("template_id=tmpl1");
    expect(url).toContain("mobile=919876543210");
    expect(url).toContain("otp=123456");
    expect((init.headers as Record<string, string>).authkey).toBe("key-123456");
  });

  it("reports MSG91 errors", async () => {
    await expect(
      sendOtpSms({ provider: "msg91", apiKey: "k", templateId: "t" }, "9876543210", "123456", respond(200, { type: "error", message: "Invalid authkey" })),
    ).rejects.toThrow(/Invalid authkey/);
  });

  it("sends through 2Factor", async () => {
    const fetchImpl = respond(200, { Status: "Success", Details: "abc" });
    await sendOtpSms({ provider: "2factor", apiKey: "abc-key", templateId: "OTP1" }, "9876543210", "654321", fetchImpl);
    expect(fetchImpl.mock.calls[0]![0]).toBe("https://2factor.in/API/V1/abc-key/SMS/919876543210/654321/OTP1");
  });

  it("refuses when nothing is set up", async () => {
    await expect(sendOtpSms({ provider: null, apiKey: null }, "9876543210", "123456")).rejects.toThrow(/not set up/);
  });
});
