// Public: sends a 6-digit code by SMS so a visitor can verify their phone in the lead pop-up.
// POST {phone}. Only works when "Verify phone in the lead pop-up" is on in Admin → Integrations.
// Each number gets at most 3 codes per 10 minutes and 10 per day (checked in the database).
import { loadIntegrationConfig, smsConfig } from "../_shared/integrations.ts";
import { sendOtpSms } from "../_shared/sms.ts";
import { errorMessage, serviceClient } from "../_shared/worker.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
};

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (request.method !== "POST") return reply({ error: "Use POST" }, 405);
  let phone = "";
  try {
    phone = String((await request.json())?.phone ?? "").slice(0, 32);
  } catch {
    return reply({ error: "Bad request" }, 400);
  }

  const db = serviceClient();
  try {
    const config = await loadIntegrationConfig(db);
    const sms = smsConfig(config);
    if (!config.otp_leads_enabled || !sms.provider || !sms.apiKey) return reply({ error: "Phone verification is switched off." }, 409);

    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
    const limited = await db.rpc("geocode_rate_limit", { p_key: `otp-ip:${ip}` });
    if (limited.error) return reply({ error: "Too many codes requested. Please wait a little." }, 429);

    const { data: code, error } = await db.rpc("otp_create", { p_phone: phone });
    if (error) {
      const status = error.code === "PT429" ? 429 : 400;
      return reply({ error: status === 429 ? "Too many codes for this number. Please wait a few minutes." : error.message }, status);
    }
    await sendOtpSms(sms, phone, String(code));
    return reply({ ok: true });
  } catch (error) {
    console.error(`[phone-otp] ${errorMessage(error)}`);
    return reply({ error: "We couldn't send the SMS. Please try again." }, 502);
  }
});
