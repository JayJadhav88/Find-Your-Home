export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="text-text-muted" role="status">
      {label}
    </p>
  );
}
