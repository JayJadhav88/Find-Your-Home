import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/actions/auth";
import { getViewer, isStaff } from "@/lib/auth";

export function SiteHeader({ brandName }: { brandName: string }) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-semibold text-brand">
          {brandName}
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-1 text-sm">
          <Link href="/search?purpose=sale" className="rounded-lg px-3 py-2 hover:bg-surface-muted">
            Buy
          </Link>
          <Link href="/search?purpose=rent" className="rounded-lg px-3 py-2 hover:bg-surface-muted">
            Rent
          </Link>
          <Link href="/account/listings/new" className="rounded-lg px-3 py-2 hover:bg-surface-muted">
            List a property
          </Link>
          <Suspense fallback={<span className="inline-block h-9 w-20" aria-hidden />}>
            <UserMenu />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}

async function UserMenu() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <Link href="/sign-in" className="rounded-lg bg-brand px-3 py-2 font-semibold text-white hover:bg-brand-strong">
        Sign in
      </Link>
    );
  }
  return (
    <>
      {isStaff(viewer) ? (
        <Link href="/admin" className="rounded-lg px-3 py-2 hover:bg-surface-muted">
          Admin
        </Link>
      ) : null}
      <Link href="/account" className="rounded-lg px-3 py-2 font-medium hover:bg-surface-muted">
        My account
      </Link>
      <form action={signOut}>
        <button type="submit" className="rounded-lg px-3 py-2 text-text-muted hover:bg-surface-muted">
          Sign out
        </button>
      </form>
    </>
  );
}
