// Supabase Auth "Send SMS" hook: Auth makes the sign-in code, this function delivers it with the
// SMS provider chosen in Admin → Integrations (MSG91 or 2Factor).
// Secret: SEND_SMS_HOOK_SECRET ("v1,whsec_…", generated when the hook is switched on).
import { Webhook } from "npm:standardwebhooks@1.0.0";
import { loadIntegrationConfig, smsConfig } from "../_shared/integrations.ts";
import { sendOtpSms } from "../_shared/sms.ts";
import { errorMessage, serviceClient } from "../_shared/worker.ts";

function failure(message: string, status = 500): Response {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return failure("Use POST", 405);
  const secret = (Deno.env.get("SEND_SMS_HOOK_SECRET") ?? "").replace("v1,whsec_", "");
  if (!secret) return failure("SMS hook secret is not set");

  const payload = await request.text();
  let phone: string;
  let otp: string;
  try {
    const event = new Webhook(secret).verify(payload, Object.fromEntries(request.headers)) as { user: { phone: string }; sms: { otp: string } };
    phone = event.user.phone;
    otp = event.sms.otp;
  } catch {
    return failure("Bad signature", 401);
  }

  try {
    const config = await loadIntegrationConfig(serviceClient());
    const sms = smsConfig(config);
    if (!config.otp_sign_in_enabled || !sms.provider || !sms.apiKey) return failure("Sign-in by SMS is switched off", 400);
    await sendOtpSms(sms, phone, otp);
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error(`[send-sms] ${errorMessage(error)}`);
    return failure("We couldn't send the SMS. Please try again.");
  }
});
