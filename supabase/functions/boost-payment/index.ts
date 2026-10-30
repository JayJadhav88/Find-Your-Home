// Boost payments through Razorpay. Called by signed-in owners from the website.
//   POST {action: "order", listingId, planId}  → creates a Razorpay order for the plan's price
//   POST {action: "verify", orderId, paymentId, signature} → checks Razorpay's signature, marks paid
//   Razorpay webhook (order.paid), signed with RAZORPAY_WEBHOOK_SECRET: marks paid even if the
//   buyer closed the browser right after paying.
// Keys come from Admin → Integrations (Vault); RAZORPAY_* function secrets still work as a fallback.
// The price always comes from the database, never from the browser.
import { loadIntegrationConfig, razorpayConfig } from "../_shared/integrations.ts";
import { errorMessage, serviceClient } from "../_shared/worker.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
};

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (request.method !== "POST") return reply({ error: "Use POST" }, 405);

  const webhookSignature = request.headers.get("x-razorpay-signature");
  if (webhookSignature) return handleWebhook(request, webhookSignature);

  const db = serviceClient();
  const razorpay = razorpayConfig(await loadIntegrationConfig(db), (name) => Deno.env.get(name));
  if (!razorpay) return reply({ error: "Online payment isn't set up yet. Please contact us to boost your property." }, 503);
  const { keyId, keySecret } = razorpay;
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await db.auth.getUser(token);
  const user = auth?.user;
  if (!user) return reply({ error: "Sign in to boost your property." }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "Bad request" }, 400);
  }

  try {
    if (body.action === "order") {
      const listingId = String(body.listingId ?? "");
      const planId = String(body.planId ?? "");
      if (!UUID.test(listingId) || !UUID.test(planId)) return reply({ error: "Choose a plan." }, 400);

      const [{ data: listing }, { data: plan }, { data: profile }] = await Promise.all([
        db.from("listings").select("id, owner_id, agent_id, status, reference_code").eq("id", listingId).maybeSingle(),
        db.from("boost_plans").select("id, name, days, price_paise, is_active").eq("id", planId).maybeSingle(),
        db.from("profiles").select("display_name, phone").eq("id", user.id).maybeSingle(),
      ]);
      if (!listing || (listing.owner_id !== user.id && listing.agent_id !== user.id)) return reply({ error: "You can only boost your own property." }, 403);
      if (!["draft", "pending_review", "published", "rejected"].includes(listing.status)) return reply({ error: "This property can't be boosted now." }, 409);
      if (!plan?.is_active) return reply({ error: "This plan is no longer available." }, 409);

      const response = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}` },
        body: JSON.stringify({
          amount: plan.price_paise,
          currency: "INR",
          receipt: `boost-${listing.reference_code}-${Date.now()}`.slice(0, 40),
          notes: { listing: listing.reference_code, plan: plan.name },
        }),
      });
      const order = await response.json();
      if (!response.ok || !order?.id) {
        console.error(`[boost-payment] order failed: ${JSON.stringify(order?.error ?? order).slice(0, 300)}`);
        return reply({ error: "We couldn't start the payment. Please try again." }, 502);
      }
      const inserted = await db.from("listing_boosts").insert({
        listing_id: listing.id,
        plan_id: plan.id,
        buyer_id: user.id,
        plan_name: plan.name,
        days: plan.days,
        amount_paise: plan.price_paise,
        razorpay_order_id: order.id,
      });
      if (inserted.error) throw inserted.error;
      return reply({
        keyId,
        orderId: order.id,
        amount: plan.price_paise,
        currency: "INR",
        planName: plan.name,
        name: profile?.display_name ?? "",
        email: user.email ?? "",
        phone: profile?.phone ?? "",
      });
    }

    if (body.action === "verify") {
      const orderId = String(body.orderId ?? "");
      const paymentId = String(body.paymentId ?? "");
      const signature = String(body.signature ?? "");
      if (!/^order_\w+$/.test(orderId) || !/^pay_\w+$/.test(paymentId) || !/^[0-9a-f]{64}$/.test(signature)) {
        return reply({ error: "Bad payment details." }, 400);
      }
      const { data: boost } = await db.from("listing_boosts").select("buyer_id").eq("razorpay_order_id", orderId).maybeSingle();
      if (!boost || boost.buyer_id !== user.id) return reply({ error: "Unknown payment." }, 404);
      const expected = await hmacHex(keySecret, `${orderId}|${paymentId}`);
      if (!sameText(expected, signature)) {
        await db.from("listing_boosts").update({ status: "failed" }).eq("razorpay_order_id", orderId).eq("status", "created");
        return reply({ error: "The payment could not be confirmed. If money was taken, contact us with payment id " + paymentId }, 400);
      }
      const { data, error } = await db.rpc("boost_mark_paid", { p_order_id: orderId, p_payment_id: paymentId });
      if (error) throw error;
      return reply({ ok: true, ...(data as Record<string, unknown>) });
    }

    return reply({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error(`[boost-payment] ${errorMessage(error)}`);
    return reply({ error: "Something went wrong. Please try again." }, 500);
  }
});

async function handleWebhook(request: Request, signature: string): Promise<Response> {
  const secret = razorpayConfig(await loadIntegrationConfig(serviceClient()), (name) => Deno.env.get(name))?.webhookSecret;
  if (!secret) return reply({ error: "Webhook not configured" }, 503);
  const raw = await request.text();
  if (!sameText(await hmacHex(secret, raw), signature)) return reply({ error: "Bad signature" }, 400);
  try {
    const event = JSON.parse(raw);
    if (event?.event !== "order.paid") return reply({ ok: true, ignored: true });
    const orderId = event.payload?.order?.entity?.id;
    const paymentId = event.payload?.payment?.entity?.id;
    if (typeof orderId !== "string" || typeof paymentId !== "string") return reply({ ok: true, ignored: true });
    const db = serviceClient();
    const { data: boost } = await db.from("listing_boosts").select("id").eq("razorpay_order_id", orderId).maybeSingle();
    if (!boost) return reply({ ok: true, ignored: true });
    const { error } = await db.rpc("boost_mark_paid", { p_order_id: orderId, p_payment_id: paymentId });
    if (error) throw error;
    return reply({ ok: true });
  } catch (error) {
    console.error(`[boost-payment] webhook: ${errorMessage(error)}`);
    return reply({ error: "Webhook failed" }, 500);
  }
}
