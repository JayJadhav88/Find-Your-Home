import {
  ENQUIRY_STATUS_LABEL,
  ENQUIRY_STATUSES,
  formatDateTime,
  LEAD_INTEREST_LABEL,
  LEAD_INTERESTS,
  LEAD_SOURCE_LABEL,
  LEAD_SOURCES,
  PIPELINE_STATUSES,
  type EnquiryStatus,
  type LeadInterest,
  type LeadSource,
} from "@fyh/shared";
import Link from "next/link";
import { Suspense } from "react";
import { createLead } from "@/app/actions/admin-enquiries";
import { ActionForm } from "@/components/action-form";
import { Loading } from "@/components/loading";
import { Badge, Button, Card, cx, EmptyState, Field, PageHeader, Select, TextArea, TextInput } from "@/components/ui";
import { canManageEnquiries, isAdmin, requireEnquiryTeam } from "@/lib/auth";
import { getSiteSettings } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

const OWNER_FILTERS = [
  ["", "Anyone"],
  ["mine", "Assigned to me"],
  ["unassigned", "Not assigned"],
] as const;

const CLOSED: readonly string[] = ["closed", "spam", "won", "lost", "unqualified"];

/** Follow-up date has passed and the lead is still open. */
function isOverdue(followUpAt: string | null, status: string): boolean {
  return Boolean(followUpAt) && new Date(followUpAt!).getTime() <= Date.now() && !CLOSED.includes(status);
}

/** How long ago, for "lead age": 45m, 6h, 3d. */
function age(createdAt: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(createdAt)) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

type Filters = { status: string; owner: string; due: boolean; type: string; source: string };

export default function AdminEnquiriesPage({ searchParams }: PageProps<"/admin/enquiries">) {
  return (
    <Suspense fallback={<Loading />}>
      {searchParams.then((params) => {
        const pick = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
        return <Enquiries filters={{ status: pick("status"), owner: pick("owner"), due: params.due === "1", type: pick("type"), source: pick("source") }} />;
      })}
    </Suspense>
  );
}

async function Enquiries({ filters }: { filters: Filters }) {
  const { status, owner, due, type, source } = filters;
  const viewer = await requireEnquiryTeam("/admin/enquiries");
  const supabase = await createUserClient();
  const settings = await getSiteSettings();

  let query = supabase
    .from("enquiries")
    .select(
      "id, kind, status, visit_status, created_at, name, follow_up_at, team_assignee, lead_type, interest, source, first_response_at, listing:listings(title, reference_code), owner:profiles!enquiries_team_assignee_fkey(display_name)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if ((ENQUIRY_STATUSES as readonly string[]).includes(status)) query = query.eq("status", status as EnquiryStatus);
  if (owner === "mine") query = query.eq("team_assignee", viewer.id);
  if (owner === "unassigned") query = query.is("team_assignee", null);
  if (due) query = query.lte("follow_up_at", new Date().toISOString());
  if (type === "customer" || type === "owner") query = query.eq("lead_type", type);
  if ((LEAD_SOURCES as readonly string[]).includes(source)) query = query.eq("source", source);

  // Counts follow what this person may see (sales agents: their own leads).
  const counts = Promise.all(
    PIPELINE_STATUSES.map(async (value) => {
      const { count } = await supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("status", value);
      return [value, count ?? 0] as const;
    }),
  );
  const dueCount = supabase
    .from("enquiries")
    .select("id", { count: "exact", head: true })
    .lte("follow_up_at", new Date().toISOString())
    .not("status", "in", `(${CLOSED.join(",")})`);
  const [{ data }, statusCounts, { count: overdue }] = await Promise.all([query, counts, dueCount]);
  const rows = data ?? [];
  const fmt = { locale: settings.default_locale, timeZone: settings.default_timezone };
  const filterLink = (extra: string) => `/admin/enquiries?${extra}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leads & enquiries"
        description={
          canManageEnquiries(viewer)
            ? "Every lead: listing enquiries, visit requests, Contact Us messages and leads added by the team."
            : "The leads assigned to you."
        }
        actions={
          isAdmin(viewer) ? (
            // File download from a route handler: plain link, no prefetch.
            <a download className="text-sm text-brand underline" href="/admin/export/enquiries">
              Export CSV
            </a>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {statusCounts.map(([value, count]) => (
          <Link
            key={value}
            href={filterLink(`status=${value}`)}
            className={cx("rounded-xl border p-3 hover:border-brand", status === value ? "border-brand bg-brand-soft" : "border-border bg-surface")}
          >
            <span className="block text-2xl font-semibold">{count}</span>
            <span className="text-sm text-text-muted">{ENQUIRY_STATUS_LABEL[value]}</span>
          </Link>
        ))}
        <Link
          href={filterLink("due=1")}
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
          Type
          <Select bare name="type" defaultValue={type}>
            <option value="">All</option>
            <option value="customer">Buyers and renters</option>
            <option value="owner">Owners (sell / list)</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Source
          <Select bare name="source" defaultValue={source}>
            <option value="">All</option>
            {LEAD_SOURCES.map((value) => (
              <option key={value} value={value}>{LEAD_SOURCE_LABEL[value]}</option>
            ))}
          </Select>
        </label>
        {canManageEnquiries(viewer) ? (
          <label className="flex flex-col gap-1 text-sm font-medium">
            Team owner
            <Select bare name="owner" defaultValue={owner}>
              {OWNER_FILTERS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </label>
        ) : null}
        <Button type="submit" variant="secondary">Filter</Button>
      </form>

      <details className="rounded-xl border border-border bg-surface p-4">
        <summary className="cursor-pointer font-medium">Add a lead (phone call, walk-in, referral)</summary>
        <div className="mt-4">
          <ActionForm action={createLead} submitLabel="Add lead">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" name="name" required>
                <TextInput name="name" maxLength={100} />
              </Field>
              <Field label="Looking to" name="interest">
                <Select name="interest" defaultValue="buy">
                  {LEAD_INTERESTS.map((value) => (
                    <option key={value} value={value}>{LEAD_INTEREST_LABEL[value]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Phone" name="phone" hint="Phone or email: at least one.">
                <TextInput name="phone" type="tel" maxLength={32} />
              </Field>
              <Field label="Email" name="email">
                <TextInput name="email" type="email" maxLength={254} />
              </Field>
              <Field label="City or locality" name="city">
                <TextInput name="city" maxLength={100} />
              </Field>
              <Field label="Came from" name="source">
                <Select name="source" defaultValue="manual">
                  {(["manual", "referral", "campaign", "organic", "qr", "other"] as const).map((value) => (
                    <option key={value} value={value}>{LEAD_SOURCE_LABEL[value]}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Notes" name="message">
              <TextArea name="message" rows={3} maxLength={5000} />
            </Field>
          </ActionForm>
        </div>
      </details>

      {rows.length === 0 ? (
        <EmptyState title="No leads match" />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {rows.map((row) => {
            const late = isOverdue(row.follow_up_at, row.status);
            const waiting = !row.first_response_at && (row.status === "new" || row.status === "assigned");
            return (
              <li key={row.id}>
                <Link
                  href={`/admin/enquiries/${row.id}`}
                  className="flex flex-col gap-1 p-4 hover:bg-surface-muted sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>
                    <span className="font-medium">
                      {row.listing?.title ?? (row.interest ? `${LEAD_INTEREST_LABEL[row.interest as LeadInterest]} (no listing)` : "Lead")}
                    </span>
                    <span className="block text-sm text-text-muted">
                      {row.name} · {row.lead_type === "owner" ? "owner" : row.kind === "visit_request" ? `visit ${row.visit_status}` : "enquiry"} ·{" "}
                      {LEAD_SOURCE_LABEL[row.source as LeadSource] ?? row.source} · {formatDateTime(row.created_at, fmt)}
                      {row.owner ? ` · ${row.owner.display_name}` : ""}
                    </span>
                    {waiting ? (
                      <span className="block text-sm font-semibold text-danger">Waiting for a first reply: {age(row.created_at)}</span>
                    ) : null}
                    {row.follow_up_at ? (
                      <span className={cx("block text-sm", late ? "font-semibold text-danger" : "text-text-muted")}>
                        Follow up {formatDateTime(row.follow_up_at, fmt)}
                      </span>
                    ) : null}
                  </span>
                  <Badge tone={row.status === "new" ? "pending_review" : CLOSED.includes(row.status) ? "archived" : "published"}>
                    {ENQUIRY_STATUS_LABEL[row.status]}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Card className="text-sm text-text-muted">
        Lead age is shown until the first reply. Statuses: New → Assigned → Contacted → Qualified → Visit scheduled → Negotiation → Won or
        Lost/Unqualified (with a reason).
      </Card>
    </div>
  );
}
