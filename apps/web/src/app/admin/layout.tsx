import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { canManageEnquiries, canSendBroadcasts, getViewer, isAdmin, isStaff, isTeam, type Viewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const prefetch = "force-disabled";

// Each page also checks its own permission; the menu only hides what a role can't open.
const LINKS: Array<[string, string, (viewer: Viewer | null) => boolean]> = [
  ["/admin", "Dashboard", isTeam],
  ["/admin/listings", "Listings", isStaff],
  ["/admin/reports", "Reports", isStaff],
  ["/admin/import", "Import from Excel", isAdmin],
  ["/admin/enquiries", "Enquiries", canManageEnquiries],
  ["/admin/broadcasts", "Send a message", canSendBroadcasts],
  ["/admin/users", "Users & team", isAdmin],
  ["/admin/integrations", "Integrations", isAdmin],
  ["/admin/taxonomy", "Types, amenities & places", isAdmin],
  ["/admin/settings", "Settings", isAdmin],
  ["/admin/content", "Pages", isAdmin],
  ["/admin/data-requests", "Privacy requests", isAdmin],
  ["/admin/audit", "Audit log", isStaff],
];

const linkClass = "whitespace-nowrap rounded-lg px-3 py-2 text-sm hover:bg-surface";

async function AdminNav() {
  const viewer = await getViewer();
  return (
    <>
      {LINKS.filter(([, , allowed]) => allowed(viewer)).map(([href, label]) => (
        <Link key={href} href={href} className={linkClass}>
          {label}
        </Link>
      ))}
    </>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[14rem_1fr]">
      <nav aria-label="Admin" className="flex gap-1 overflow-x-auto lg:flex-col">
        <Suspense fallback={<span className={linkClass}>Loading menu…</span>}>
          <AdminNav />
        </Suspense>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
