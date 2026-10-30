"use client";

import { useState, useTransition } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";
import { Alert, Button } from "./ui";

// Sign in or sign up with a mobile number and a 6-digit SMS code (Admin → Integrations → SMS).
// New numbers get an account automatically.

function e164(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function PhoneSignIn({ next }: { next: string }) {
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    const number = e164(phone);
    if (!number) return setError("Enter a 10-digit mobile number.");
    setError(null);
    startTransition(async () => {
      const { error: failure } = await getBrowserClient().auth.signInWithOtp({ phone: number });
      if (failure) return setError(failure.status === 429 ? "Too many codes. Please wait a minute and try again." : "We couldn't send the SMS. Check the number and try again.");
      setSentTo(number);
    });
  }

  function verify() {
    if (!sentTo) return;
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from the SMS.");
    setError(null);
    startTransition(async () => {
      const { error: failure } = await getBrowserClient().auth.verifyOtp({ phone: sentTo, token: code, type: "sms" });
      if (failure) return setError("That code is not right or has expired. Try again or ask for a new code.");
      window.location.assign(next);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <p className="font-medium">Continue with your mobile number</p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {sentTo ? (
        <>
          <p className="text-sm text-text-muted">Enter the 6-digit code we sent to {sentTo}.</p>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Code
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base tracking-widest"
            />
          </label>
          <Button type="button" onClick={verify} disabled={pending}>
            {pending ? "Checking…" : "Verify and continue"}
          </Button>
          <button type="button" className="self-start text-sm text-brand underline" onClick={() => { setSentTo(null); setCode(""); }}>
            Change number or send again
          </button>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Mobile number
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="98765 43210"
              className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base"
            />
          </label>
          <Button type="button" variant="secondary" onClick={send} disabled={pending}>
            {pending ? "Sending…" : "Send code by SMS"}
          </Button>
        </>
      )}
    </div>
  );
}
