"use client";

import { LEAD_INTEREST_LABEL, LEAD_INTERESTS, type LeadInterest } from "@fyh/shared";
import { useState, useTransition } from "react";
import { readAttribution } from "@/lib/attribution";
import { getBrowserClient } from "@/lib/supabase-browser";
import { Alert, Button, Checkbox, Field, Select, TextArea, TextInput } from "./ui";

// Calls submit_contact_lead from the browser so per-visitor rate limiting sees the visitor's
// own IP. The database validates everything again and creates one lead.

const CONSENT_VERSION = "2026-10-contact-v1";
const INTERESTS = LEAD_INTERESTS.filter((value) => value !== "rent_out");

export function ContactForm({ brandName }: { brandName: string }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    const next: Record<string, string> = {};
    if (!value("name")) next.name = "Please enter your name.";
    if (!value("phone") && !value("email")) next.phone = "Please give a phone number or an email address.";
    if (value("email") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value("email"))) next.email = "Enter a valid email address.";
    if (!value("message")) next.message = "Please write a short message.";
    if (form.get("consent") !== "on") next.consent = "Please agree so we can contact you about this enquiry.";
    setErrors(next);
    if (Object.keys(next).length) return;

    startTransition(async () => {
      const attribution = readAttribution();
      const { error } = await getBrowserClient().rpc("submit_contact_lead", {
        p_name: value("name"),
        p_email: value("email"),
        p_phone: value("phone"),
        p_interest: value("interest") as LeadInterest,
        p_message: value("message"),
        p_city: value("city") || undefined,
        p_preferred_contact: value("preferredContact") || undefined,
        p_property_reference: value("reference") || undefined,
        p_consent_text_version: CONSENT_VERSION,
        p_source: attribution.source === "qr" ? "qr" : "contact_form",
        p_utm: attribution.utm,
      });
      if (error) {
        setResult({
          ok: false,
          message:
            error.code === "PT429"
              ? "You've sent several messages recently. Please try again later."
              : error.code === "22023"
                ? error.message
                : "We couldn't send your message. Please try again.",
        });
        return;
      }
      setResult({ ok: true, message: `Thank you. The ${brandName} team will get back to you soon.` });
    });
  }

  if (result?.ok) return <Alert tone="success" title="Message sent">{result.message}</Alert>;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">
        Have a question about renting, buying, selling, a new-launch project or listing your property? Send us the form below and our
        team will review your request. Please don&rsquo;t include sensitive financial or identity information in the message.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" name="name" error={errors.name} required>
          <TextInput name="name" autoComplete="name" error={errors.name} maxLength={100} />
        </Field>
        <Field label="What is it about?" name="interest">
          <Select name="interest" defaultValue="buy">
            {INTERESTS.map((value) => (
              <option key={value} value={value}>{LEAD_INTEREST_LABEL[value]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Phone" name="phone" error={errors.phone} hint="Phone or email: at least one.">
          <TextInput name="phone" type="tel" autoComplete="tel" error={errors.phone} maxLength={32} />
        </Field>
        <Field label="Email" name="email" error={errors.email}>
          <TextInput name="email" type="email" autoComplete="email" error={errors.email} maxLength={254} />
        </Field>
        <Field label="City or locality" name="city">
          <TextInput name="city" autoComplete="address-level2" maxLength={100} />
        </Field>
        <Field label="Preferred way to reach you" name="preferredContact">
          <Select name="preferredContact" defaultValue="">
            <option value="">No preference</option>
            <option value="phone">Phone call</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
          </Select>
        </Field>
      </div>
      <Field label="Property or project reference (optional)" name="reference" hint="e.g. FYH-001234">
        <TextInput name="reference" maxLength={60} />
      </Field>
      <Field label="Message" name="message" error={errors.message} required>
        <TextArea name="message" rows={5} maxLength={5000} error={errors.message} />
      </Field>
      <div>
        <Checkbox name="consent" label={`I agree that ${brandName} may contact me about this enquiry.`} />
        {errors.consent ? <p className="text-sm text-danger" role="alert">{errors.consent}</p> : null}
      </div>
      {result && !result.ok ? <Alert tone="danger">{result.message}</Alert> : null}
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send message"}</Button>
      </div>
    </form>
  );
}
