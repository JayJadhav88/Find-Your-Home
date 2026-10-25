"use client";

import { useActionState, useEffect, useState } from "react";
import { initialFormState, type FormState } from "@/app/actions/types";
import { Alert, Button, cx } from "./ui";

// Select many rows and apply one action to all of them. Row and "select all" checkboxes
// live in the page (inside tables or lists) and join the bar's <form> through the HTML
// `form` attribute, so the server page keeps rendering the rows.

export interface BulkAction {
  value: string;
  label: string;
  /** Ask for a reason (e.g. reject); sent as `reason`. */
  reason?: "required" | "optional";
  /** Extra choice, e.g. which status or which team member; sent as `choice`. */
  choices?: Array<{ value: string; label: string }>;
  choiceLabel?: string;
  /** Shown before running, e.g. for deleting. */
  confirm?: string;
  danger?: boolean;
}

const rowSelector = (formId: string) => `input[type="checkbox"][form="${formId}"][name="ids"]`;

/** Checkbox for one row. */
export function RowCheckbox({ formId, value, label }: { formId: string; value: string; label: string }) {
  return (
    <input
      type="checkbox"
      form={formId}
      name="ids"
      value={value}
      aria-label={`Select ${label}`}
      className="size-5 cursor-pointer accent-[var(--fyh-brand)]"
    />
  );
}

/** "Select all on this page" checkbox for a table header or list heading. */
export function SelectAllCheckbox({ formId, label = "Select all on this page" }: { formId: string; label?: string }) {
  const [state, setState] = useState<"none" | "some" | "all">("none");

  useEffect(() => {
    const update = () => {
      const boxes = [...document.querySelectorAll<HTMLInputElement>(rowSelector(formId))];
      const ticked = boxes.filter((box) => box.checked).length;
      setState(ticked === 0 ? "none" : ticked === boxes.length ? "all" : "some");
    };
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, [formId]);

  return (
    <input
      type="checkbox"
      aria-label={label}
      title={label}
      className="size-5 cursor-pointer accent-[var(--fyh-brand)]"
      checked={state === "all"}
      ref={(element) => {
        if (element) element.indeterminate = state === "some";
      }}
      onChange={(event) => {
        const on = event.currentTarget.checked;
        for (const box of document.querySelectorAll<HTMLInputElement>(rowSelector(formId))) box.checked = on;
        document.dispatchEvent(new Event("change"));
      }}
    />
  );
}

/**
 * The action bar: how many are selected, the action, and Apply. With `totalMatching`, offers
 * to apply to everything matching the current filter (not only this page); the filter is
 * passed as hidden `filter_*` fields.
 */
export function BulkActionBar({
  formId,
  action,
  actions,
  noun,
  totalMatching,
  filter = {},
}: {
  formId: string;
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  actions: BulkAction[];
  noun: [string, string];
  totalMatching?: number;
  filter?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const [selected, setSelected] = useState(0);
  const [onPage, setOnPage] = useState(0);
  const [allMatching, setAllMatching] = useState(false);
  const [choice, setChoice] = useState(actions[0]?.value ?? "");
  const current = actions.find((item) => item.value === choice) ?? actions[0];

  useEffect(() => {
    const update = () => {
      const boxes = [...document.querySelectorAll<HTMLInputElement>(rowSelector(formId))];
      setOnPage(boxes.length);
      setSelected(boxes.filter((box) => box.checked).length);
    };
    update();
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, [formId]);

  // Clear ticks after a successful run (the list re-renders with the new statuses).
  useEffect(() => {
    if (!state.ok) return;
    for (const box of document.querySelectorAll<HTMLInputElement>(rowSelector(formId))) box.checked = false;
    document.dispatchEvent(new Event("change"));
  }, [state, formId]);

  const count = allMatching && totalMatching ? totalMatching : selected;
  const name = (n: number) => (n === 1 ? noun[0] : noun[1]);
  const canOfferAll = totalMatching !== undefined && totalMatching > onPage && selected === onPage && onPage > 0;

  return (
    <form
      id={formId}
      action={formAction}
      className={cx(
        "sticky bottom-0 z-10 flex flex-col gap-3 rounded-xl border bg-surface p-3 shadow-lg",
        count > 0 ? "border-brand" : "border-border",
      )}
      onSubmit={(event) => {
        const message = current?.confirm ?? `Apply "${current?.label}" to ${count} ${name(count)}?`;
        if (!window.confirm(message.replace("{count}", String(count)))) event.preventDefault();
      }}
    >
      {Object.entries(filter).map(([key, value]) => (
        <input key={key} type="hidden" name={`filter_${key}`} value={value} />
      ))}
      <input type="hidden" name="scope" value={allMatching ? "all" : "selected"} />
      <div className="flex flex-wrap items-end gap-3">
        <p className="min-w-32 text-sm font-medium" aria-live="polite">
          {count ? `${count} ${name(count)} selected` : `Tick ${noun[1]} to act on several at once`}
        </p>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Action
          <select
            name="bulkAction"
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
            className="min-h-11 rounded-lg border border-border bg-surface px-3"
          >
            {actions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {current?.choices ? (
          <label className="flex flex-col gap-1 text-sm font-medium">
            {current.choiceLabel ?? "Choose"}
            <select name="choice" className="min-h-11 rounded-lg border border-border bg-surface px-3">
              {current.choices.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {current?.reason ? (
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm font-medium">
            Reason{current.reason === "required" ? "" : " (optional)"}
            <input
              name="reason"
              required={current.reason === "required"}
              maxLength={2000}
              className="min-h-11 rounded-lg border border-border bg-surface px-3"
            />
          </label>
        ) : null}
        <Button type="submit" variant={current?.danger ? "danger" : "primary"} disabled={pending || count === 0}>
          {pending ? "Working…" : `Apply to ${count || "selected"}`}
        </Button>
      </div>
      {canOfferAll ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allMatching}
            onChange={(event) => setAllMatching(event.target.checked)}
            className="size-5 accent-[var(--fyh-brand)]"
          />
          Apply to all {totalMatching} {name(totalMatching!)} matching this filter, not only the {onPage} on this page
        </label>
      ) : null}
      <div aria-live="polite">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok && state.message ? (
          <Alert tone={state.message.includes("Skipped") ? "warning" : "success"}>
            <span className="whitespace-pre-line">{state.message}</span>
          </Alert>
        ) : null}
      </div>
    </form>
  );
}
