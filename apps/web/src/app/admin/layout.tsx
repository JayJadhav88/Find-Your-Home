import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const prefetch = "force-disabled";

const LINKS = [
  ["/admin", "Dashboard"],
  ["/admin/listings", "Listings"],
  ["/admin/enquiries", "Enquiries"],
  ["/admin/users", "Users"],
  ["/admin/taxonomy", "Types, amenities & places"],
  ["/admin/settings", "Settings"],
  ["/admin/content", "Pages"],
  ["/admin/data-requests", "Privacy requests"],
  ["/admin/audit", "Audit log"],
] as const;

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[14rem_1fr]">
      <nav aria-label="Admin" className="flex gap-1 overflow-x-auto lg:flex-col">
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
