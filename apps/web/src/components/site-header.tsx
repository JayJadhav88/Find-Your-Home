import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/actions/auth";
import { getViewer, isTeam } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";

export function SiteHeader({ brandName }: { brandName: string }) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2" aria-label={`${brandName} home`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- small static logo; next/image adds nothing here */}
          <img src="/brand/logo-icon.png" alt="" width={51} height={40} className="h-10 w-auto" />
          {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
          <img src="/brand/logo-wordmark.png" alt={brandName} width={160} height={20} className="h-4 w-auto sm:h-5" />
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-1 text-sm">
          <Link href="/search?category=rental" className="rounded-lg px-3 py-2 hover:bg-surface-muted">
            Rent
          </Link>
          <Link href="/search?category=resale" className="rounded-lg px-3 py-2 hover:bg-surface-muted">
            Resale
          </Link>
          <Link href="/search?category=new_project" className="rounded-lg px-3 py-2 hover:bg-surface-muted">
            New projects
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
  const supabase = await createUserClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  const unread = count ?? 0;
  return (
    <>
      <Link
        href="/account/notifications"
        className="relative rounded-lg px-3 py-2 hover:bg-surface-muted"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      >
        <span aria-hidden>🔔</span>
        {unread ? (
          <span aria-hidden className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-danger px-1 text-center text-xs font-semibold leading-5 text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Link>
      {isTeam(viewer) ? (
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
