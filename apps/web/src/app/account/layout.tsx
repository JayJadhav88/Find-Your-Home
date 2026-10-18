import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "My account", robots: { index: false, follow: false } };
// Rarely visited, per-user pages: skip speculative prefetching.
export const prefetch = "force-disabled";

const LINKS = [
  ["/account", "Overview"],
  ["/account/notifications", "Notifications"],
  ["/account/listings", "My listings"],
  ["/account/enquiries", "Enquiries"],
  ["/account/favorites", "Saved homes"],
  ["/account/saved-searches", "Saved searches"],
  ["/account/profile", "Profile & privacy"],
] as const;

export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[13rem_1fr]">
      <nav aria-label="Account" className="flex gap-1 overflow-x-auto md:flex-col">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm hover:bg-surface">
            {label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
