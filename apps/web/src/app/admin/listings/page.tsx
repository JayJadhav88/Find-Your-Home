import { LISTING_STATUSES } from "@fyh/shared";
import Link from "next/link";
import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { Badge, Button, EmptyState, PageHeader, Select, TextInput } from "@/components/ui";
import { isAdmin, requireStaff } from "@/lib/auth";
import { STATUS_LABEL } from "@/lib/listing-format";
import { createUserClient } from "@/lib/supabase";

const PAGE_SIZE = 50;

export default function AdminListingsPage({ searchParams }: PageProps<"/admin/listings">) {
  return (
    <Suspense fallback={<Loading />}>
      {searchParams.then((params) => (
        <Listings
          status={typeof params.status === "string" ? params.status : ""}
          q={typeof params.q === "string" ? params.q.trim() : ""}
          page={Math.max(1, Number(params.page) || 1)}
        />
      ))}
    </Suspense>
  );
}

async function Listings({ status, q, page }: { status: string; q: string; page: number }) {
  const viewer = await requireStaff("/admin/listings");
  const supabase = await createUserClient();
  let query = supabase
    .from("listings")
    .select("id, title, reference_code, status, purpose, submitted_at, updated_at, is_featured, owner:profiles!listings_owner_id_fkey(display_name)", { count: "exact" });
  if ((LISTING_STATUSES as readonly string[]).includes(status)) query = query.eq("status", status as (typeof LISTING_STATUSES)[number]);
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    query = query.or(`title.ilike.%${safe}%,reference_code.ilike.%${safe}%`);
  }
  query =
    status === "pending_review"
      ? query.order("submitted_at", { ascending: true })
      : query.order("updated_at", { ascending: false });
  const { data, count, error } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const rows = data ?? [];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const link = (next: number) => `/admin/listings?${new URLSearchParams({ ...(status && { status }), ...(q && { q }), page: String(next) })}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Listings"
        description={status === "pending_review" ? "Oldest submissions first." : undefined}
        actions={isAdmin(viewer) ? (
          // File download from a route handler: plain link, no prefetch.
          <a download className="text-sm text-brand underline" href="/admin/export/listings">Export CSV</a>
        ) : null}
      />
      <form className="flex flex-wrap items-end gap-2" action="/admin/listings">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Status
          <Select bare name="status" defaultValue={status}>
            <option value="">All</option>
            {LISTING_STATUSES.map((value) => (
              <option key={value} value={value}>{STATUS_LABEL[value]}</option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Title or reference
          <TextInput bare name="q" defaultValue={q} />
        </label>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      {error ? <p className="text-danger">Could not load listings.</p> : null}
      {rows.length === 0 ? (
        <EmptyState title="No listings match" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Listings</caption>
            <thead className="border-b border-border text-text-muted">
              <tr>
                <th scope="col" className="p-3">Listing</th>
                <th scope="col" className="p-3">Owner</th>
                <th scope="col" className="p-3">Status</th>
                <th scope="col" className="p-3">{status === "pending_review" ? "Submitted" : "Updated"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <Link href={`/admin/listings/${row.id}`} className="font-medium text-brand underline">{row.title}</Link>
                    <span className="block text-text-muted">{row.reference_code}{row.is_featured ? " · Featured" : ""}</span>
                  </td>
                  <td className="p-3">{row.owner?.display_name ?? "—"}</td>
                  <td className="p-3"><Badge tone={row.status}>{STATUS_LABEL[row.status]}</Badge></td>
                  <td className="p-3">{(status === "pending_review" ? row.submitted_at : row.updated_at)?.slice(0, 16).replace("T", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
          {page > 1 ? <Link className="text-brand underline" href={link(page - 1)}>Previous</Link> : null}
          <span>Page {page} of {pages}</span>
          {page < pages ? <Link className="text-brand underline" href={link(page + 1)}>Next</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
