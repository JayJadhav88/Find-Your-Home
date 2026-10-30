"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";
import { Alert, Button, cx } from "./ui";

// Pay online (Razorpay) to feature a property. The price comes from the server; the payment is
// confirmed by the server (signature check) before the boost counts.

export type BoostPlan = { id: string; name: string; description: string | null; days: number; price_paise: number };

type Order = { keyId: string; orderId: string; amount: number; currency: string; planName: string; name: string; email: string; phone: string };
type RazorpayResult = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayInstance = { open: () => void; on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

function loadCheckout(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

async function callPayment(body: Record<string, unknown>) {
  const { data, error } = await getBrowserClient().functions.invoke("boost-payment", { body });
  if (error) {
    // Show the function's own message when it sent one.
    const context = (error as { context?: Response }).context;
    const detail = context ? await context.json().catch(() => null) : null;
    throw new Error(detail?.error ?? "We couldn't reach the payment service. Please try again.");
  }
  return data;
}

export function BoostPicker({ listingId, plans, brandName, isLive }: { listingId: string; plans: BoostPlan[]; brandName: string; isLive: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState(plans[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const plan = plans.find((item) => item.id === selected);

  if (!plans.length) return null;

  async function pay() {
    if (!plan) return;
    setBusy(true);
    setResult(null);
    try {
      if (!(await loadCheckout()) || !window.Razorpay) throw new Error("The payment window couldn't load. Check your connection and try again.");
      const order = (await callPayment({ action: "order", listingId, planId: plan.id })) as Order;
      const checkout = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: brandName,
        description: order.planName,
        prefill: { name: order.name, email: order.email, contact: order.phone },
        theme: { color: "#0B3266" },
        modal: { ondismiss: () => setBusy(false) },
        handler: async (response: RazorpayResult) => {
          try {
            await callPayment({
              action: "verify",
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
            setResult({
              tone: "success",
              text: isLive
                ? `Payment received. Your property is featured for ${plan.days} days.`
                : `Payment received. The ${plan.days}-day boost starts as soon as your property is approved.`,
            });
            router.refresh();
          } catch (failure) {
            setResult({ tone: "danger", text: failure instanceof Error ? failure.message : "We couldn't confirm the payment." });
          } finally {
            setBusy(false);
          }
        },
      });
      checkout.on("payment.failed", (response) => {
        setResult({ tone: "danger", text: response.error?.description ?? "The payment failed. No money was taken; try again." });
        setBusy(false);
      });
      checkout.open();
    } catch (failure) {
      setResult({ tone: "danger", text: failure instanceof Error ? failure.message : "Something went wrong." });
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {result ? <Alert tone={result.tone}>{result.text}</Alert> : null}
      <div role="radiogroup" aria-label="Boost plan" className="grid gap-3 sm:grid-cols-2">
        {plans.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={selected === item.id}
            onClick={() => setSelected(item.id)}
            className={cx(
              "flex flex-col gap-1 rounded-xl border-2 p-4 text-left",
              selected === item.id ? "border-accent bg-accent/10" : "border-border bg-surface hover:border-accent/60",
            )}
          >
            <span className="font-semibold">{item.name}</span>
            <span className="text-2xl font-bold text-brand">{rupees(item.price_paise)}</span>
            <span className="text-sm text-text-muted">{item.description ?? `Featured for ${item.days} days`}</span>
          </button>
        ))}
      </div>
      <div>
        <Button type="button" variant="accent" onClick={pay} disabled={busy || !plan}>
          {busy ? "Opening payment…" : plan ? `Boost now: pay ${rupees(plan.price_paise)}` : "Choose a plan"}
        </Button>
      </div>
      <p className="text-xs text-text-muted">Secure payment by Razorpay: UPI, cards, net banking and wallets.</p>
    </div>
  );
}
