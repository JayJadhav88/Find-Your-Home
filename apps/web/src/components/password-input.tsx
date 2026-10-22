"use client";

import { useState, type ComponentProps } from "react";
import { TextInput } from "./ui";

/** A password (or secret key) field with a Show / Hide button. */
export function PasswordInput(props: Omit<ComponentProps<typeof TextInput>, "type">) {
  const [visible, setVisible] = useState(false);
  const id = props.id ?? props.name;
  return (
    <div className="relative">
      <TextInput {...props} type={visible ? "text" : "password"} className="pr-20" />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-controls={id}
        aria-pressed={visible}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex min-w-16 items-center justify-center px-3 text-sm font-medium text-brand hover:underline"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
