"use client";

import { useActionState } from "react";
import {
  becomeOwner,
  handleEnquiry,
  requestAccountDeletion,
  requestDataExport,
  updateProfile,
} from "@/app/actions/account";
import { listingWorkflow } from "@/app/actions/listings";
import { initialFormState, type FormState } from "@/app/actions/types";
import { Alert, Button, Checkbox, Field, TextInput } from "./ui";

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <Alert tone="danger">{state.error}</Alert>;
  if (state.ok && state.message) return <Alert tone="success">{state.message}</Alert>;
  return null;
}

export function ProfileForm({ displayName, phone, marketingOptIn }: { displayName: string; phone: string; marketingOptIn: boolean }) {
  const [state, action, pending] = useActionState(updateProfile, initialFormState);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Feedback state={state} />
      <Field label="Name" name="displayName" error={errors.displayName} required>
        <TextInput name="displayName" autoComplete="name" defaultValue={state.values?.displayName ?? displayName} error={errors.displayName} />
      </Field>
      <Field label="Phone" name="phone" error={errors.phone} hint="Only shown on listings where you choose to show it.">
        <TextInput name="phone" type="tel" autoComplete="tel" defaultValue={state.values?.phone ?? phone} error={errors.phone} />
      </Field>
      <Checkbox name="marketingOptIn" label="Email me occasional product news" defaultChecked={marketingOptIn} />
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button>
      </div>
    </form>
  );
}

export function BecomeOwnerButton() {
  const [state, action, pending] = useActionState(becomeOwner, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <Feedback state={state} />
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Enabling…" : "Start listing properties"}</Button>
      </div>
    </form>
  );
}

export function DataExportButton() {
  const [state, action, pending] = useActionState(requestDataExport, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <Feedback state={state} />
      <div>
        <Button type="submit" variant="secondary" disabled={pending || state.ok}>Request a copy of my data</Button>
      </div>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(requestAccountDeletion, initialFormState);
  if (state.ok) return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <Feedback state={state} />
      <Field label='Type "DELETE" to request account deletion' name="confirm" error={state.fieldErrors?.confirm}>
        <TextInput name="confirm" autoComplete="off" error={state.fieldErrors?.confirm} />
      </Field>
      <div>
        <Button type="submit" variant="danger" disabled={pending}>Request deletion</Button>
      </div>
    </form>
  );
}

export function WorkflowButtons({
  listingId,
  actions,
}: {
  listingId: string;
  actions: Array<{ action: string; label: string; variant?: "primary" | "secondary" | "danger"; confirm?: string }>;
}) {
  const [state, formAction, pending] = useActionState(listingWorkflow, initialFormState);
  if (!actions.length && !state.message && !state.error) return null;
  return (
    <div className="flex flex-col gap-3">
      <Feedback state={state} />
      <div className="flex flex-wrap gap-2">
        {actions.map((item) => (
          <form
            key={item.action}
            action={formAction}
            onSubmit={(event) => {
              if (item.confirm && !window.confirm(item.confirm)) event.preventDefault();
            }}
          >
            <input type="hidden" name="listingId" value={listingId} />
            <input type="hidden" name="action" value={item.action} />
            <Button type="submit" variant={item.variant ?? "secondary"} disabled={pending}>
              {item.label}
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}

export function EnquiryActions({
  enquiryId,
  actions,
}: {
  enquiryId: string;
  actions: Array<{ action: string; label: string; variant?: "primary" | "secondary" | "danger" }>;
}) {
  const [state, formAction, pending] = useActionState(handleEnquiry, initialFormState);
  return (
    <div className="flex flex-col gap-2">
      <Feedback state={state} />
      <div className="flex flex-wrap gap-2">
        {actions.map((item) => (
          <form key={item.action} action={formAction}>
            <input type="hidden" name="enquiryId" value={enquiryId} />
            <input type="hidden" name="action" value={item.action} />
            <Button type="submit" variant={item.variant ?? "secondary"} disabled={pending}>
              {item.label}
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}
