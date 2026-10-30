"use client";

import { enquirySchema, fieldErrors, zonedLocalToUtc } from "@fyh/shared";
import { useState, useSyncExternalStore, useTransition } from "react";
import { readAttribution } from "@/lib/attribution";
import { getBrowserClient } from "@/lib/supabase-browser";
import { Alert, Button, Checkbox, Field, TextArea, TextInput } from "./ui";

// Calls the submit_enquiry RPC directly from the browser so per-visitor rate limiting sees
// the visitor's own IP. The database validates and rate-limits; this form adds fast feedback.

const CONSENT_VERSION = "2026-10-v1";
const noopSubscribe = () => () => {};

export function EnquiryForm({
  listingId,
  defaultName,
  defaultEmail,
  brandName,
  initialKind = "enquiry",
}: {
  listingId: string;
  defaultName?: string;
  defaultEmail?: string;
  brandName: string;
  initialKind?: "enquiry" | "visit_request";
}) {
  const [kind, setKind] = useState<"enquiry" | "visit_request">(initialKind);
  // The visitor's own time zone; "UTC" while rendering on the server.
  const timeZone = useSyncExternalStore(
    noopSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    () => "UTC",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = enquirySchema.safeParse({ ...Object.fromEntries(form.entries()), listingId, kind, timeZone });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});

    startTransition(async () => {
      const values = parsed.data;
      let visitAt: string | null = null;
      if (values.kind === "visit_request" && values.visitAt && values.timeZone) {
        visitAt = zonedLocalToUtc(values.visitAt, values.timeZone);
        if (Date.parse(visitAt) <= Date.now()) {
          setErrors({ visitAt: "Choose a time in the future" });
          return;
        }
      }
      const { error } = await getBrowserClient().rpc("submit_enquiry", {
        p_listing_id: values.listingId,
        p_name: values.name,
        p_email: values.email,
        p_message: values.message,
        p_phone: values.phone ?? undefined,
        p_kind: values.kind,
        p_requested_visit_at: visitAt ?? undefined,
        p_requested_timezone: values.kind === "visit_request" ? values.timeZone : undefined,
        p_consent_text_version: CONSENT_VERSION,
        p_source: readAttribution().source,
        p_utm: readAttribution().utm,
      });
      if (error) {
        setResult({
          ok: false,
          message:
            error.code === "PT429"
              ? "You've sent several messages recently. Please try again later."
              : error.code === "PT409" || error.code === "22023"
                ? error.message
                : "We couldn't send your message. Please try again.",
        });
        return;
      }
      setResult({
        ok: true,
        message:
          values.kind === "visit_request"
            ? "Visit requested. It isn't confirmed yet — the lister will reply by email."
            : "Message sent. The lister will reply by email.",
      });
    });
  }

  if (result?.ok) return <Alert tone="success">{result.message}</Alert>;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <fieldset className="grid grid-cols-2 gap-1 rounded-lg bg-surface-muted p-1 text-sm">
        <legend className="sr-only">What would you like to do?</legend>
        {(
          [
            ["enquiry", "Ask a question"],
            ["visit_request", "Request a visit"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className={`flex min-h-10 cursor-pointer items-center justify-center rounded-md font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--fyh-focus)] ${kind === value ? "bg-surface shadow-sm" : ""}`}
          >
            <input
              type="radio"
              name="kind"
              value={value}
              checked={kind === value}
              onChange={() => setKind(value)}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </fieldset>
      {result && !result.ok ? <Alert tone="danger">{result.message}</Alert> : null}
      <Field label="Name" name="name" error={errors.name} required>
        <TextInput name="name" autoComplete="name" defaultValue={defaultName} error={errors.name} required />
      </Field>
      <Field label="Email" name="email" error={errors.email} required>
        <TextInput name="email" type="email" autoComplete="email" defaultValue={defaultEmail} error={errors.email} required />
      </Field>
      <Field label="Phone (optional)" name="phone" error={errors.phone}>
        <TextInput name="phone" type="tel" autoComplete="tel" error={errors.phone} />
      </Field>
      {kind === "visit_request" ? (
        <Field label="Preferred date and time" name="visitAt" error={errors.visitAt} hint={`Your time zone: ${timeZone}`} required>
          <TextInput name="visitAt" type="datetime-local" error={errors.visitAt} hint={`Your time zone: ${timeZone}`} required />
        </Field>
      ) : null}
      <Field label="Message" name="message" error={errors.message} required>
        <TextArea
          name="message"
          error={errors.message}
          defaultValue={kind === "visit_request" ? "I'd like to visit this property." : "Is this property still available?"}
          required
        />
      </Field>
      <div>
        <Checkbox
          name="consent"
          label={`I agree that ${brandName} passes my name, contact details and message to the lister.`}
        />
        {errors.consent ? (
          <p className="text-sm text-danger" role="alert">
            {errors.consent}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : kind === "visit_request" ? "Request a visit" : "Send message"}
      </Button>
    </form>
  );
}
