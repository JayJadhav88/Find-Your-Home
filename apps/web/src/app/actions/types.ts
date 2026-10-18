/** Return shape for form Server Actions used with useActionState. */
export interface FormState {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Echo of submitted text values so the form keeps them after an error. */
  values?: Record<string, string>;
}

export const initialFormState: FormState = {};

export function formValues(formData: FormData, omit: string[] = ["password"]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !omit.includes(key) && !key.startsWith("$")) values[key] = value;
  }
  return values;
}

/** Turns database errors into messages that are safe and useful to show. */
export function friendlyDbError(error: { code?: string; message?: string; details?: string | null } | null): string {
  if (!error) return "Something went wrong. Please try again.";
  switch (error.code) {
    case "42501":
      return error.message?.startsWith("new row violates") || error.message?.startsWith("permission denied")
        ? "You don't have permission to do that."
        : (error.message ?? "You don't have permission to do that.");
    case "PT409":
      return error.message ?? "That action isn't possible right now.";
    case "PT429":
      return "Too many requests. Please wait a little and try again.";
    case "22023":
      return error.details ? `${error.message}: ${error.details}` : (error.message ?? "Some details are invalid.");
    case "23514":
      return error.message?.includes("violates check constraint")
        ? "Some details are outside the allowed range."
        : (error.message ?? "Some details are invalid.");
    case "23505":
      return "That already exists.";
    default:
      return "Something went wrong. Please try again.";
  }
}
