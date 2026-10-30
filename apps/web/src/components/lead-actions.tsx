"use client";

import { useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { readAttribution } from "@/lib/attribution";
import { env } from "@/lib/env";
import { getBrowserClient } from "@/lib/supabase-browser";
import { Alert, Button } from "./ui";

// "View contact details", "Download brochure" and "Request a callback" on a property page.
// The first time, a short pop-up asks for a name, a phone number and up to three questions
// (Admin → Settings); the answers become a lead and only then does the database release the
// lister's phone number or the brochure. The visitor's details are remembered on this device so
// they are not asked again.

export interface LeadQuestion {
  id: string;
  label: string;
  options: string[];
}

type Kind = "contact_reveal" | "brochure" | "callback";
interface Visitor {
  name: string;
  phone: string;
  email: string;
  answers: Record<string, string>;
  /** Proof of an earlier SMS check of this phone (when verification is switched on). */
  verifyToken?: string;
}
interface Pending {
  kind: Kind;
  details: Visitor;
  callbackAt: string | null;
}
interface Revealed {
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
}

const STORAGE_KEY = "fyh_visitor_v1";
const CONSENT_VERSION = "2026-10-lead-v1";

const CHANGED = "fyh-visitor-changed";

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function saveVisitor(visitor: Visitor) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(visitor));
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    // Private mode: they'll simply be asked again next time.
  }
}

const TITLES: Record<Kind, string> = {
  contact_reveal: "See the lister's contact details",
  brochure: "Download the brochure",
  callback: "Request a callback",
};

export function LeadActions({
  listingId,
  hasPhone,
  hasWhatsapp,
  hasEmail,
  hasBrochure,
  questions,
  brandName,
}: {
  listingId: string;
  hasPhone: boolean;
  hasWhatsapp: boolean;
  hasEmail: boolean;
  hasBrochure: boolean;
  questions: LeadQuestion[];
  brandName: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const stored = useSyncExternalStore(subscribe, readStored, () => null);
  const visitor = useMemo<Visitor | null>(() => {
    try {
      return stored ? (JSON.parse(stored) as Visitor) : null;
    } catch {
      return null;
    }
  }, [stored]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [brochureUrl, setBrochureUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  // Waiting for the SMS code before the request can be sent.
  const [awaitingCode, setAwaitingCode] = useState<Pending | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  const hasContact = hasPhone || hasWhatsapp || hasEmail;

  async function sendCode(phone: string): Promise<string | null> {
    const { error: failure } = await getBrowserClient().functions.invoke("phone-otp", { body: { phone } });
    if (!failure) return null;
    const context = (failure as { context?: Response }).context;
    const detail = context ? await context.json().catch(() => null) : null;
    return detail?.error ?? "We couldn't send the SMS. Please try again.";
  }

  function submit(chosen: Kind, details: Visitor, callbackAt: string | null, code?: string) {
    setError(null);
    setCodeError(null);
    startTransition(async () => {
      const attribution = readAttribution();
      const { data, error: failure } = await getBrowserClient().rpc("submit_gated_lead", {
        p_listing_id: listingId,
        p_kind: chosen,
        p_name: details.name,
        p_phone: details.phone,
        p_email: details.email || undefined,
        p_answers: details.answers,
        p_callback_at: callbackAt ?? undefined,
        p_consent_text_version: CONSENT_VERSION,
        p_source: attribution.source,
        p_utm: attribution.utm,
        p_otp: code ?? details.verifyToken,
      });
      if (failure?.code === "PT428") {
        // Phone verification is on: send a code and ask for it.
        const problem = await sendCode(details.phone);
        if (problem) {
          setError(problem);
          return;
        }
        setAwaitingCode({ kind: chosen, details: { ...details, verifyToken: undefined }, callbackAt });
        if (!dialog.current?.open) {
          dialog.current?.showModal();
          setDialogOpen(true);
        }
        return;
      }
      if (failure && code) {
        setCodeError(failure.code === "22023" || failure.code === "PT409" ? failure.message : "That didn't work. Please try again.");
        return;
      }
      if (failure) {
        setError(
          failure.code === "PT429"
            ? "You've sent several requests recently. Please try again later."
            : failure.code === "22023" || failure.code === "PT409"
              ? failure.message
              : "That didn't work. Please try again.",
        );
        return;
      }
      const result = (data ?? {}) as { brochure_key?: string | null; verify_token?: string | null } & Revealed;
      saveVisitor({ ...details, verifyToken: result.verify_token ?? details.verifyToken });
      setAwaitingCode(null);
      if (chosen === "contact_reveal") setRevealed({ phone: result.phone, whatsapp: result.whatsapp, email: result.email });
      if (chosen === "brochure" && result.brochure_key) {
        const url = `${env.supabaseUrl}/storage/v1/object/public/listing-brochures/${result.brochure_key}`;
        setBrochureUrl(url);
        window.open(url, "_blank", "noopener");
      }
      if (chosen === "callback") setNotice(`Thanks, ${details.name.split(" ")[0]}. We'll call you back soon.`);
      dialog.current?.close();
    });
  }

  function start(chosen: Kind) {
    setError(null);
    setNotice(null);
    // Returning visitors skip the form (callbacks always ask for a time).
    if (visitor && chosen !== "callback") {
      submit(chosen, visitor, null);
      return;
    }
    setKind(chosen);
    setFieldErrors({});
    dialog.current?.showModal();
    setDialogOpen(true);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kind) return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    const next: Record<string, string> = {};
    if (!value("name")) next.name = "Please enter your name.";
    if (value("phone").replace(/\D/g, "").length < 7) next.phone = "Please enter a valid phone number.";
    if (value("email") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value("email"))) next.email = "Enter a valid email address.";
    if (form.get("consent") !== "on") next.consent = "Please agree so the lister and our team can contact you.";
    let callbackAt: string | null = null;
    if (kind === "callback" && value("when") === "pick") {
      const local = value("callbackAt");
      if (!local) next.callbackAt = "Choose a time, or pick “As soon as possible”.";
      else callbackAt = new Date(local).toISOString();
    }
    setFieldErrors(next);
    if (Object.keys(next).length) return;
    const answers: Record<string, string> = {};
    for (const question of questions) {
      const answer = value(`q-${question.id}`);
      if (answer) answers[question.id] = answer;
    }
    submit(kind, { name: value("name"), phone: value("phone"), email: value("email"), answers }, callbackAt);
  }

  const contactShown = revealed && (revealed.phone || revealed.whatsapp || revealed.email);

  return (
    <div className="flex flex-col gap-2">
      {hasContact ? (
        contactShown ? (
          <ul className="flex flex-col gap-1 text-sm" aria-live="polite">
            {revealed.phone ? (
              <li>
                📞{" "}
                <a className="font-semibold text-brand underline" href={`tel:${revealed.phone.replace(/\s/g, "")}`}>
                  {revealed.phone}
                </a>
              </li>
            ) : null}
            {revealed.whatsapp ? (
              <li>
                💬{" "}
                <a className="font-semibold text-brand underline" href={`https://wa.me/${revealed.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              </li>
            ) : null}
            {revealed.email ? (
              <li>
                ✉️{" "}
                <a className="font-semibold text-brand underline" href={`mailto:${revealed.email}`}>
                  {revealed.email}
                </a>
              </li>
            ) : null}
          </ul>
        ) : (
          <Button type="button" onClick={() => start("contact_reveal")} disabled={pending}>
            {hasPhone ? "View phone number" : "View contact details"}
          </Button>
        )
      ) : null}
      {hasBrochure ? (
        brochureUrl ? (
          <a href={brochureUrl} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold text-brand hover:bg-surface-muted">
            Open the brochure (PDF)
          </a>
        ) : (
          <Button type="button" variant="accent" onClick={() => start("brochure")} disabled={pending}>
            Download brochure
          </Button>
        )
      ) : null}
      <Button type="button" variant="secondary" onClick={() => start("callback")} disabled={pending}>
        Request a callback
      </Button>
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error && !dialogOpen ? <Alert tone="danger">{error}</Alert> : null}

      <dialog
        ref={dialog}
        aria-labelledby="lead-dialog-title"
        className="m-auto w-[min(100%-2rem,28rem)] rounded-2xl border border-border bg-surface p-0 text-text shadow-xl backdrop:bg-black/50"
        onClose={() => {
          setKind(null);
          setAwaitingCode(null);
          setDialogOpen(false);
        }}
      >
        {awaitingCode ? (
          <form
            noValidate
            className="flex flex-col gap-3 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\D/g, "");
              if (code.length !== 6) return setCodeError("Enter the 6-digit code from the SMS.");
              submit(awaitingCode.kind, awaitingCode.details, awaitingCode.callbackAt, code);
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="lead-dialog-title" className="text-lg font-semibold">
                  Verify your phone number
                </h2>
                <p className="text-sm text-text-muted">We sent a 6-digit code by SMS to {awaitingCode.details.phone}.</p>
              </div>
              <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="rounded-lg px-2 text-xl text-text-muted hover:bg-surface-muted">
                ×
              </button>
            </div>
            <LeadField label="Code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} error={codeError ?? undefined} required />
            <Button type="submit" disabled={pending}>
              {pending ? "Checking…" : "Verify and continue"}
            </Button>
            <button
              type="button"
              disabled={pending}
              className="self-start text-sm text-brand underline"
              onClick={() =>
                startTransition(async () => {
                  const problem = await sendCode(awaitingCode.details.phone);
                  setCodeError(problem ?? null);
                  if (!problem) setNotice(null);
                })
              }
            >
              Send the code again
            </button>
          </form>
        ) : kind ? (
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="lead-dialog-title" className="text-lg font-semibold">
                  {TITLES[kind]}
                </h2>
                <p className="text-sm text-text-muted">A few quick details, so the lister knows who&apos;s interested.</p>
              </div>
              <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="rounded-lg px-2 text-xl text-text-muted hover:bg-surface-muted">
                ×
              </button>
            </div>
            <LeadField label="Your name" name="name" error={fieldErrors.name} autoComplete="name" defaultValue={visitor?.name} required />
            <LeadField label="Phone number" name="phone" type="tel" error={fieldErrors.phone} autoComplete="tel" defaultValue={visitor?.phone} required />
            <LeadField label="Email (optional)" name="email" type="email" error={fieldErrors.email} autoComplete="email" defaultValue={visitor?.email} />
            {questions.map((question) => (
              <fieldset key={question.id} className="flex flex-col gap-1">
                <legend className="text-sm font-medium">{question.label}</legend>
                <div className="flex flex-wrap gap-2">
                  {question.options.map((option) => (
                    <label key={option} className="cursor-pointer">
                      <input
                        type="radio"
                        name={`q-${question.id}`}
                        value={option}
                        defaultChecked={visitor?.answers[question.id] === option}
                        className="peer sr-only"
                      />
                      <span className="inline-flex min-h-9 items-center rounded-full border border-border px-3 text-sm peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-focus">
                        {option}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            {kind === "callback" ? <CallbackTime error={fieldErrors.callbackAt} /> : null}
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="consent" className="mt-1 size-4 accent-[var(--fyh-brand)]" defaultChecked={Boolean(visitor)} />
              <span>I agree that the lister and {brandName} may contact me about this property.</span>
            </label>
            {fieldErrors.consent ? <p className="text-sm text-danger" role="alert">{fieldErrors.consent}</p> : null}
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : kind === "brochure" ? "Get the brochure" : kind === "callback" ? "Request callback" : "Show contact details"}
            </Button>
          </form>
        ) : null}
      </dialog>
    </div>
  );
}

function LeadField({
  label,
  name,
  error,
  type = "text",
  ...props
}: { label: string; name: string; error?: string; type?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <input
        name={name}
        type={type}
        aria-invalid={error ? true : undefined}
        className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base font-normal aria-[invalid=true]:border-danger"
        {...props}
      />
      {error ? (
        <span className="text-xs font-normal text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function CallbackTime({ error }: { error?: string }) {
  const [when, setWhen] = useState<"asap" | "pick">("asap");
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">When should we call?</legend>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="when" value="asap" checked={when === "asap"} onChange={() => setWhen("asap")} className="accent-[var(--fyh-brand)]" />
          As soon as possible
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="when" value="pick" checked={when === "pick"} onChange={() => setWhen("pick")} className="accent-[var(--fyh-brand)]" />
          At a time I choose
        </label>
      </div>
      {when === "pick" ? (
        <input
          type="datetime-local"
          name="callbackAt"
          aria-label="Callback time"
          aria-invalid={error ? true : undefined}
          className="min-h-11 rounded-lg border border-border bg-surface px-3"
        />
      ) : null}
      {error ? <p className="text-xs text-danger" role="alert">{error}</p> : null}
    </fieldset>
  );
}
