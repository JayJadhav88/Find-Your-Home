import { ENQUIRY_STATUS_LABEL, ENQUIRY_STATUSES, formatDateTime, type EnquiryStatus } from "@fyh/shared";
import Link from "next/link";
import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { Badge, Button, cx, EmptyState, PageHeader, Select } from "@/components/ui";
import { isAdmin, requireEnquiryTeam } from "@/lib/auth";
import { getSiteSettings } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

const OWNER_FILTERS = [
  ["", "Anyone"],
  ["mine", "Assigned to me"],
  ["unassigned", "Not assigned"],
] as const;

/** Follow-up date has passed and the enquiry is still open. */
function isOverdue(followUpAt: string | null, status: string): boolean {
  return Boolean(followUpAt) && new Date(followUpAt!).getTime() <= Date.now() && !["closed", "spam"].includes(status);
}

export default function AdminEnquiriesPage({ searchParams }: PageProps<"/admin/enquiries">) {
  return (
    <Suspense fallback={<Loading />}>
      {searchParams.then((params) => (
        <Enquiries
          status={typeof params.status === "string" ? params.status : ""}
          owner={typeof params.owner === "string" ? params.owner : ""}
          due={params.due === "1"}
        />
      ))}
    </Suspense>
  );
}

async function Enquiries({ status, owner, due }: { status: string; owner: string; due: boolean }) {
  const viewer = await requireEnquiryTeam("/admin/enquiries");
  const supabase = await createUserClient();
  const settings = await getSiteSettings();

  let query = supabase
    .from("enquiries")
    .select(
      "id, kind, status, visit_status, created_at, name, follow_up_at, team_assignee, listing:listings(title, reference_code), owner:profiles!enquiries_team_assignee_fkey(display_name)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if ((ENQUIRY_STATUSES as readonly string[]).includes(status)) query = query.eq("status", status as EnquiryStatus);
  if (owner === "mine") query = query.eq("team_assignee", viewer.id);
  if (owner === "unassigned") query = query.is("team_assignee", null);
  if (due) query = query.lte("follow_up_at", new Date().toISOString());

  const counts = Promise.all(
    ENQUIRY_STATUSES.map(async (value) => {
      const { count } = await supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("status", value);
      return [value, count ?? 0] as const;
    }),
  );
  const dueCount = supabase
    .from("enquiries")
    .select("id", { count: "exact", head: true })
    .lte("follow_up_at", new Date().toISOString())
    .not("status", "in", "(closed,spam)");
  const [{ data }, statusCounts, { count: overdue }] = await Promise.all([query, counts, dueCount]);
  const rows = data ?? [];
  const fmt = { locale: settings.default_locale, timeZone: settings.default_timezone };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Enquiries"
        description="Every enquiry and visit request. Open one to contact the person, move it along, assign it and add notes."
        actions={
          isAdmin(viewer) ? (
            // File download from a route handler: plain link, no prefetch.
            <a download className="text-sm text-brand underline" href="/admin/export/enquiries">
              Export CSV
            </a>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {statusCounts.map(([value, count]) => (
          <Link
            key={value}
            href={`/admin/enquiries?status=${value}`}
            className={cx("rounded-xl border p-3 hover:border-brand", status === value ? "border-brand bg-brand-soft" : "border-border bg-surface")}
          >
            <span className="block text-2xl font-semibold">{count}</span>
            <span className="text-sm text-text-muted">{ENQUIRY_STATUS_LABEL[value]}</span>
          </Link>
        ))}
        <Link
          href="/admin/enquiries?due=1"
          className={cx("rounded-xl border p-3 hover:border-brand", due ? "border-brand bg-brand-soft" : "border-border bg-surface")}
        >
          <span className={cx("block text-2xl font-semibold", overdue ? "text-danger" : undefined)}>{overdue ?? 0}</span>
          <span className="text-sm text-text-muted">Follow-up due</span>
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-2" action="/admin/enquiries">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Status
          <Select bare name="status" defaultValue={status}>
            <option value="">All</option>
            {ENQUIRY_STATUSES.map((value) => (
              <option key={value} value={value}>{ENQUIRY_STATUS_LABEL[value]}</option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Team owner
          <Select bare name="owner" defaultValue={owner}>
            {OWNER_FILTERS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </label>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="No enquiries match" />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {rows.map((row) => {
            const late = isOverdue(row.follow_up_at, row.status);
            return (
              <li key={row.id}>
                <Link
                  href={`/admin/enquiries/${row.id}`}
                  className="flex flex-col gap-1 p-4 hover:bg-surface-muted sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>
                    <span className="font-medium">{row.listing?.title ?? "Listing removed"}</span>
                    <span className="block text-sm text-text-muted">
                      {row.name} · {row.kind === "visit_request" ? `visit ${row.visit_status}` : "question"} · {formatDateTime(row.created_at, fmt)}
                      {row.owner ? ` · ${row.owner.display_name}` : ""}
                    </span>
                    {row.follow_up_at ? (
                      <span className={cx("block text-sm", late ? "font-semibold text-danger" : "text-text-muted")}>
                        Follow up {formatDateTime(row.follow_up_at, fmt)}
                      </span>
                    ) : null}
                  </span>
                  <Badge tone={row.status === "new" ? "pending_review" : row.status === "closed" || row.status === "spam" ? "archived" : "published"}>
                    {ENQUIRY_STATUS_LABEL[row.status]}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
