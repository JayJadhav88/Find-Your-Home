import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Small, accessible building blocks styled with the shared design tokens (see globals.css).

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

type Variant = "primary" | "accent" | "secondary" | "danger" | "ghost";

const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong",
  // Logo orange; navy text keeps it readable.
  accent: "bg-accent text-brand-strong hover:brightness-95",
  secondary: "border border-border bg-surface text-text hover:bg-surface-muted",
  danger: "bg-danger text-white hover:opacity-90",
  ghost: "text-brand hover:bg-brand-soft",
};

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(buttonBase, variants[variant], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(buttonBase, variants[variant], className)} {...props} />;
}

export function Field({
  label,
  name,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${name}-hint`} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${name}-error`} className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputClass =
  "min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-text placeholder:text-text-muted aria-[invalid=true]:border-danger";

export function describedBy(name: string, error?: string, hint?: string) {
  return error ? `${name}-error` : hint ? `${name}-hint` : undefined;
}

// Inputs get id = name so <Field> labels can point at them. Pass `bare` when the input sits
// inside its own <label> (inline admin forms repeat on a page and must not share ids).

export function TextInput({
  name,
  error,
  hint,
  bare = false,
  className,
  ...props
}: ComponentProps<"input"> & { name: string; error?: string; hint?: string; bare?: boolean }) {
  return (
    <input
      id={bare ? props.id : (props.id ?? name)}
      name={name}
      aria-invalid={error ? true : undefined}
      aria-describedby={bare ? undefined : describedBy(name, error, hint)}
      className={cx(inputClass, className)}
      {...props}
    />
  );
}

export function TextArea({
  name,
  error,
  hint,
  bare = false,
  className,
  ...props
}: ComponentProps<"textarea"> & { name: string; error?: string; hint?: string; bare?: boolean }) {
  return (
    <textarea
      id={bare ? props.id : (props.id ?? name)}
      name={name}
      aria-invalid={error ? true : undefined}
      aria-describedby={bare ? undefined : describedBy(name, error, hint)}
      className={cx(inputClass, "min-h-32", className)}
      {...props}
    />
  );
}

export function Select({
  name,
  error,
  hint,
  bare = false,
  className,
  children,
  ...props
}: ComponentProps<"select"> & { name: string; error?: string; hint?: string; bare?: boolean }) {
  return (
    <select
      id={bare ? props.id : (props.id ?? name)}
      name={name}
      aria-invalid={error ? true : undefined}
      aria-describedby={bare ? undefined : describedBy(name, error, hint)}
      className={cx(inputClass, className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function Checkbox({ label, name, ...props }: ComponentProps<"input"> & { label: ReactNode; name: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
      <input type="checkbox" name={name} className="size-5 accent-[var(--fyh-brand)]" {...props} />
      <span>{label}</span>
    </label>
  );
}

type Tone = "info" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  info: "border-brand/30 bg-brand-soft text-text",
  success: "border-success/40 bg-success/10 text-text",
  warning: "border-warning/40 bg-warning/10 text-text",
  danger: "border-danger/40 bg-danger/10 text-text",
};

export function Alert({ tone = "info", title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-lg border p-4 text-sm", tones[tone])}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-1" : undefined}>{children}</div> : null}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  draft: "bg-surface-muted text-text-muted",
  pending_review: "bg-warning/15 text-warning",
  published: "bg-success/15 text-success",
  rejected: "bg-danger/15 text-danger",
  suspended: "bg-danger/15 text-danger",
  archived: "bg-surface-muted text-text-muted",
  sold: "bg-brand-soft text-brand",
  rented: "bg-brand-soft text-brand",
};

export function Badge({ tone, children }: { tone?: string; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        badgeTones[tone ?? ""] ?? "bg-brand-soft text-brand",
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
      <p className="font-semibold">{title}</p>
      {children ? <div className="mt-1 text-sm text-text-muted">{children}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-xl border border-border bg-surface p-5", className)} {...props} />;
}
