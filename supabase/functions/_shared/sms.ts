// Sends a one-time code by SMS through the provider chosen in Admin → Integrations.
// India requires DLT registration: the sender id and template must be approved there first.
//   MSG91:   POST https://control.msg91.com/api/v5/otp?template_id=…&mobile=91…&otp=…  (authkey header)
//   2Factor: GET  https://2factor.in/API/V1/{key}/SMS/{phone}/{otp}/{template name}

export type SmsProvider = "msg91" | "2factor";

export interface SmsConfig {
  provider: SmsProvider | null;
  apiKey: string | null;
  senderId?: string | null;
  templateId?: string | null;
}

/** "+91 98765 43210", "09876543210" → "919876543210". */
export function smsDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
}

export async function sendOtpSms(config: SmsConfig, phone: string, code: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!config.provider || !config.apiKey) throw new Error("SMS is not set up");
  if (!/^[0-9]{4,8}$/.test(code)) throw new Error("Bad code");
  const mobile = smsDigits(phone);
  if (!/^[0-9]{10,15}$/.test(mobile)) throw new Error("Bad phone number");

  if (config.provider === "msg91") {
    if (!config.templateId) throw new Error("MSG91 needs the DLT template id");
    const url = new URL("https://control.msg91.com/api/v5/otp");
    url.searchParams.set("template_id", config.templateId);
    url.searchParams.set("mobile", mobile);
    url.searchParams.set("otp", code);
    url.searchParams.set("otp_expiry", "10");
    const response = await fetchImpl(url.toString(), {
      method: "POST",
      headers: { authkey: config.apiKey, "Content-Type": "application/json", accept: "application/json" },
      body: "{}",
    });
    const body = (await response.json().catch(() => ({}))) as { type?: string; message?: string };
    if (!response.ok || body.type === "error") throw new Error(`MSG91: ${body.message ?? response.status}`);
    return;
  }

  // 2Factor: the template name (approved on DLT) is optional; without it their default is used.
  const path = [config.apiKey, "SMS", mobile, code, config.templateId].filter(Boolean).map(encodeURIComponent).join("/");
  const response = await fetchImpl(`https://2factor.in/API/V1/${path}`, { method: "GET" });
  const body = (await response.json().catch(() => ({}))) as { Status?: string; Details?: string };
  if (!response.ok || body.Status !== "Success") throw new Error(`2Factor: ${body.Details ?? response.status}`);
}
