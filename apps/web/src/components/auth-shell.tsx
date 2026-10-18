import type { ReactNode } from "react";

export function AuthShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description ? <p className="mt-1 text-text-muted">{description}</p> : null}
      <div className="mt-6 rounded-xl border border-border bg-surface p-6">{children}</div>
    </div>
  );
}
