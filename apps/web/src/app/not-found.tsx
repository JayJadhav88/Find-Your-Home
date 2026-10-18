import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="mt-2 text-text-muted">This page doesn't exist, or the property is no longer listed.</p>
      <div className="mt-6 flex justify-center gap-3">
        <ButtonLink href="/search">Browse homes</ButtonLink>
        <ButtonLink href="/" variant="secondary">Go home</ButtonLink>
      </div>
    </div>
  );
}
