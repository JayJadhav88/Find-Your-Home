"use client";

import { Button } from "@/components/ui";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center" role="alert">
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-text-muted">Please try again. If it keeps happening, come back in a few minutes.</p>
      <div className="mt-6 flex justify-center">
        <Button onClick={() => retry()}>Try again</Button>
      </div>
    </div>
  );
}
