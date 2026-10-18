import { formatDateTime } from "@fyh/shared";
import Link from "next/link";
import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { getSiteSettings } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

export default function EnquiriesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Enquiries />
    </Suspense>
  );
}

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  in_progress: "In progress",
  responded: "Replied",
  closed: "Closed",
  spam: "Spam",
};

const VISIT_LABEL: Record<string, string> = {
  requested: "Visit requested (not confirmed)",
  confirmed: "Visit confirmed",
  declined: "Visit declined",
  cancelled: "Visit cancelled",
};

async function Enquiries() {
  const viewer = await requireViewer("/account/enquiries");
  const supabase = await createUserClient();
  const settings = await getSiteSettings();
  // RLS returns enquiries the viewer sent plus those they may handle as the lister.
  const { data } = await supabase
    .from("enquiries")
    .select("id, kind, status, visit_status, created_at, sender_user_id, assigned_to, listing:listings(title, reference_code)")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = data ?? [];
  const received = rows.filter((row) => row.assigned_to === viewer.id);
  const sent = rows.filter((row) => row.sender_user_id === viewer.id);
  const fmt = { locale: settings.default_locale, timeZone: settings.default_timezone };

  const table = (items: typeof rows, empty: string) =>
    items.length ? (
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {items.map((row) => (
          <li key={row.id}>
            <Link href={`/account/enquiries/${row.id}`} className="flex flex-col gap-1 p-4 hover:bg-surface-muted sm:flex-row sm:items-center sm:justify-between">
              <span>
                <span className="font-medium">{row.listing?.title ?? "Listing removed"}</span>
                <span className="block text-sm text-text-muted">
                  {row.kind === "visit_request" ? VISIT_LABEL[row.visit_status ?? "requested"] : "Question"} ·{" "}
                  {formatDateTime(row.created_at, fmt)}
                </span>
              </span>
              <Badge tone={row.status === "new" ? "pending_review" : "archived"}>{STATUS_LABEL[row.status]}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    ) : (
      <EmptyState title={empty} />
    );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Enquiries" />
      {received.length || viewer.roles.some((role) => role === "owner" || role === "agent") ? (
        <section aria-labelledby="received-heading" className="flex flex-col gap-3">
          <h2 id="received-heading" className="text-lg font-semibold">
            Received about your listings
          </h2>
          {settings.owner_leads_enabled || viewer.roles.includes("agent")
            ? table(received, "No enquiries received yet")
            : (
              <p className="text-sm text-text-muted">Enquiries for your listings are handled by our team.</p>
            )}
        </section>
      ) : null}
      <section aria-labelledby="sent-heading" className="flex flex-col gap-3">
        <h2 id="sent-heading" className="text-lg font-semibold">
          Sent by you
        </h2>
        {table(sent, "You haven't sent any enquiries while signed in")}
      </section>
    </div>
  );
}
