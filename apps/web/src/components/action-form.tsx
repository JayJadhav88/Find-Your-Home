"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import { initialFormState, type FormState } from "@/app/actions/types";
import { Alert, Button } from "./ui";

/**
 * Generic form for a Server Action with the (previousState, formData) signature. Shows the
 * result, disables the button while pending, and can ask for confirmation first.
 *
 * Submits through a transition instead of the form's `action`, because React resets a form
 * after an action submission: after a validation error people would lose what they typed.
 * `resetOnSuccess` clears the fields after a successful save (e.g. "add a note"). Without
 * JavaScript the form still posts through `action`.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  submitAriaLabel,
  variant = "primary",
  confirm,
  className,
  inline = false,
  resetOnSuccess = false,
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  children?: ReactNode;
  submitLabel: string;
  /** Accessible name when the visible label repeats on the page, e.g. "Enable EUR". */
  submitAriaLabel?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  confirm?: string;
  className?: string;
  inline?: boolean;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state.fieldErrors ? Object.values(state.fieldErrors) : [];

  useEffect(() => {
    if (resetOnSuccess && state.ok) formRef.current?.reset();
  }, [resetOnSuccess, state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className={className ?? (inline ? "flex flex-wrap items-end gap-2" : "flex flex-col gap-3")}
      onSubmit={(event) => {
        event.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {children}
      <div>
        <Button type="submit" variant={variant} disabled={pending} aria-label={submitAriaLabel}>
          {pending ? "Working…" : submitLabel}
        </Button>
      </div>
      <div aria-live="polite" className={inline ? "basis-full" : undefined}>
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {errors.length ? <Alert tone="danger">{errors.join(" ")}</Alert> : null}
        {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
      </div>
    </form>
  );
}
