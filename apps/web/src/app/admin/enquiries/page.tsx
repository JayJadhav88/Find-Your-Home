import { ENQUIRY_STATUSES, formatDateTime } from "@fyh/shared";
import Link from "next/link";
import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { Badge, Button, EmptyState, PageHeader, Select } from "@/components/ui";
import { isAdmin, requireEnquiryTeam } from "@/lib/auth";
import { getSiteSettings } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

export default function AdminEnquiriesPage({ searchParams }: PageProps<"/admin/enquiries">) {
  return (
    <Suspense fallback={<Loading />}>
      {searchParams.then((params) => (
        <Enquiries status={typeof params.status === "string" ? params.status : ""} />
      ))}
    </Suspense>
  );
}

async function Enquiries({ status }: { status: string }) {
  const viewer = await requireEnquiryTeam("/admin/enquiries");
  const supabase = await createUserClient();
  const settings = await getSiteSettings();
  let query = supabase
    .from("enquiries")
    .select("id, kind, status, visit_status, created_at, name, listing:listings(title, reference_code)")
    .order("created_at", { ascending: false })
    .limit(200);
  if ((ENQUIRY_STATUSES as readonly string[]).includes(status)) query = query.eq("status", status as (typeof ENQUIRY_STATUSES)[number]);
  const { data } = await query;
  const rows = data ?? [];
  const fmt = { locale: settings.default_locale, timeZone: settings.default_timezone };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Enquiries"
        description="Open an enquiry to see contact details and update its status."
        actions={isAdmin(viewer) ? (
          // File download from a route handler: plain link, no prefetch.
          <a download className="text-sm text-brand underline" href="/admin/export/enquiries">Export CSV</a>
        ) : null}
      />
      <form className="flex flex-wrap items-end gap-2" action="/admin/enquiries">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Status
          <Select bare name="status" defaultValue={status}>
            <option value="">All</option>
            {ENQUIRY_STATUSES.map((value) => (
              <option key={value} value={value}>{value.replace("_", " ")}</option>
            ))}
          </Select>
        </label>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No enquiries" />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={`/account/enquiries/${row.id}`} className="flex flex-col gap-1 p-4 hover:bg-surface-muted sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <span className="font-medium">{row.listing?.title ?? "Listing removed"}</span>
                  <span className="block text-sm text-text-muted">
                    {row.name} · {row.kind === "visit_request" ? `visit ${row.visit_status}` : "question"} · {formatDateTime(row.created_at, fmt)}
                  </span>
                </span>
                <Badge tone={row.status === "new" ? "pending_review" : "archived"}>{row.status.replace("_", " ")}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
