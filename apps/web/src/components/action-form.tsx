"use client";

import { useActionState, type ReactNode } from "react";
import { initialFormState, type FormState } from "@/app/actions/types";
import { Alert, Button } from "./ui";

/**
 * Generic form for a Server Action with the (previousState, formData) signature. Shows the
 * result, disables the button while pending, and can ask for confirmation first.
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
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const errors = state.fieldErrors ? Object.values(state.fieldErrors) : [];
  return (
    <form
      action={formAction}
      noValidate
      className={className ?? (inline ? "flex flex-wrap items-end gap-2" : "flex flex-col gap-3")}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
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
