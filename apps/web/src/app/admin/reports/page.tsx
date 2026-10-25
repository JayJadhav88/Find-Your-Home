import { formatDateTime } from "@fyh/shared";
import Link from "next/link";
import { Suspense } from "react";
import { handleReport } from "@/app/actions/admin";
import { bulkReports } from "@/app/actions/admin-bulk";
import { ActionForm } from "@/components/action-form";
import { BulkActionBar, RowCheckbox, SelectAllCheckbox } from "@/components/bulk-actions";
import { Loading } from "@/components/loading";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { getSiteSettings } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

const REASON_LABEL: Record<string, string> = {
  fraud: "Possible scam",
  wrong_info: "Wrong details",
  unavailable: "No longer available",
  duplicate: "Duplicate",
  offensive: "Offensive",
  other: "Other",
};

export default function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  return (
    <Suspense fallback={<Loading />}>
      {searchParams.then((params) => (
        <Reports showAll={params.all === "1"} />
      ))}
    </Suspense>
  );
}

async function Reports({ showAll }: { showAll: boolean }) {
  await requireStaff("/admin/reports");
  const supabase = await createUserClient();
  let query = supabase
    .from("listing_reports")
    .select("id, reason, details, status, created_at, listing:listings(id, title, reference_code, status)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (!showAll) query = query.eq("status", "open");
  const [settings, { data: reports }] = await Promise.all([getSiteSettings(), query]);
  const fmt = { locale: settings.default_locale, timeZone: settings.default_timezone };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        description="Listings visitors reported. Open the listing to see automatic warning signs, then suspend it or dismiss the report."
        actions={
          <Link className="text-sm text-brand underline" href={showAll ? "/admin/reports" : "/admin/reports?all=1"}>
            {showAll ? "Open reports only" : "Show all reports"}
          </Link>
        }
      />
      {reports?.length ? (
        <>
        <label className="flex items-center gap-2 text-sm">
          <SelectAllCheckbox formId="bulk-reports" /> Select all {reports.length} shown
        </label>
        <ul className="flex flex-col gap-3">
          {reports.map((report) => (
            <li key={report.id} className="flex items-start gap-3">
              <span className="pt-5">
                <RowCheckbox formId="bulk-reports" value={String(report.id)} label={`report ${report.id}`} />
              </span>
              <div className="min-w-0 flex-1">
              <Card className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {report.listing ? (
                      <Link className="underline" href={`/admin/listings/${report.listing.id}`}>
                        {report.listing.title} ({report.listing.reference_code})
                      </Link>
                    ) : (
                      "Listing removed"
                    )}
                  </span>
                  <span className="flex gap-2">
                    <Badge tone="rejected">{REASON_LABEL[report.reason] ?? report.reason}</Badge>
                    <Badge tone={report.status === "open" ? "pending_review" : "archived"}>{report.status}</Badge>
                  </span>
                </div>
                {report.details ? <p className="whitespace-pre-wrap text-sm">{report.details}</p> : null}
                <p className="text-xs text-text-muted">{formatDateTime(report.created_at, fmt)}</p>
                <div className="flex flex-wrap gap-2">
                  {report.status === "open" ? (
                    <>
                      <ActionForm action={handleReport} submitLabel="Resolved" submitAriaLabel={`Mark report ${report.id} resolved`} variant="secondary" inline>
                        <input type="hidden" name="id" value={report.id} />
                        <input type="hidden" name="status" value="resolved" />
                      </ActionForm>
                      <ActionForm action={handleReport} submitLabel="Dismiss" submitAriaLabel={`Dismiss report ${report.id}`} variant="ghost" inline>
                        <input type="hidden" name="id" value={report.id} />
                        <input type="hidden" name="status" value="dismissed" />
                      </ActionForm>
                    </>
                  ) : (
                    <ActionForm action={handleReport} submitLabel="Reopen" submitAriaLabel={`Reopen report ${report.id}`} variant="ghost" inline>
                      <input type="hidden" name="id" value={report.id} />
                      <input type="hidden" name="status" value="open" />
                    </ActionForm>
                  )}
                </div>
              </Card>
            </div>
            </li>
          ))}
        </ul>
        <BulkActionBar
          formId="bulk-reports"
          action={bulkReports}
          noun={["report", "reports"]}
          actions={[
            { value: "resolved", label: "Mark resolved" },
            { value: "dismissed", label: "Dismiss" },
            { value: "open", label: "Reopen" },
          ]}
        />
        </>
      ) : (
        <EmptyState title={showAll ? "No reports yet" : "No open reports"} />
      )}
    </div>
  );
}
