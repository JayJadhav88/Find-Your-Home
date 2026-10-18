"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, signIn, signUp, updatePassword } from "@/app/actions/auth";
import { initialFormState } from "@/app/actions/types";
import { Alert, Button, Field, TextInput } from "./ui";

export function SignInForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action, pending] = useActionState(signIn, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {notice ? <Alert tone="warning">{notice}</Alert> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="Email" name="email" error={state.fieldErrors?.email} required>
        <TextInput name="email" type="email" autoComplete="email" defaultValue={state.values?.email} error={state.fieldErrors?.email} required />
      </Field>
      <Field label="Password" name="password" error={state.fieldErrors?.password} required>
        <TextInput name="password" type="password" autoComplete="current-password" error={state.fieldErrors?.password} required />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Link className="text-brand underline" href="/forgot-password">
          Forgot your password?
        </Link>
        <Link className="text-brand underline" href={`/sign-up?next=${encodeURIComponent(next)}`}>
          Create an account
        </Link>
      </div>
    </form>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signUp, initialFormState);
  if (state.ok) return <Alert tone="success" title="Almost there">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="Your name" name="displayName" error={state.fieldErrors?.displayName} required>
        <TextInput name="displayName" autoComplete="name" defaultValue={state.values?.displayName} error={state.fieldErrors?.displayName} required />
      </Field>
      <Field label="Email" name="email" error={state.fieldErrors?.email} required>
        <TextInput name="email" type="email" autoComplete="email" defaultValue={state.values?.email} error={state.fieldErrors?.email} required />
      </Field>
      <Field
        label="Password"
        name="password"
        error={state.fieldErrors?.password}
        hint="At least 10 characters, including a letter and a number."
        required
      >
        <TextInput
          name="password"
          type="password"
          autoComplete="new-password"
          error={state.fieldErrors?.password}
          hint="At least 10 characters, including a letter and a number."
          required
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-sm">
        Already have an account?{" "}
        <Link className="text-brand underline" href={`/sign-in?next=${encodeURIComponent(next)}`}>
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initialFormState);
  if (state.ok) return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field label="Email" name="email" error={state.fieldErrors?.email} required>
        <TextInput name="email" type="email" autoComplete="email" defaultValue={state.values?.email} error={state.fieldErrors?.email} required />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="New password" name="password" error={state.fieldErrors?.password} hint="At least 10 characters, including a letter and a number." required>
        <TextInput name="password" type="password" autoComplete="new-password" error={state.fieldErrors?.password} required />
      </Field>
      <Field label="Repeat the new password" name="confirm" error={state.fieldErrors?.confirm} required>
        <TextInput name="confirm" type="password" autoComplete="new-password" error={state.fieldErrors?.confirm} required />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
