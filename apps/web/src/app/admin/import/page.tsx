import { formatDateTime } from "@fyh/shared";
import Link from "next/link";
import { Suspense } from "react";
import { ImportForm, type OwnerOption } from "@/components/import-form";
import { Loading } from "@/components/loading";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

export default function AdminImportPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Import />
    </Suspense>
  );
}

async function Import() {
  const viewer = await requireAdmin("/admin/import");
  const supabase = await createUserClient();
  const settings = await getSiteSettings();
  const [{ data: users }, { data: batches }] = await Promise.all([
    supabase.rpc("admin_list_users", { p_limit: 200 }),
    supabase
      .from("import_batches")
      .select("id, file_name, total_rows, imported_rows, publish_requested, created_at, owner:profiles!import_batches_owner_id_fkey(display_name)")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const owners: OwnerOption[] = (users ?? [])
    .filter((user) => user.status === "active" && user.roles.some((role) => ["owner", "agent", "builder", "administrator"].includes(role)))
    .map((user) => ({ id: user.id, label: `${user.display_name} — ${user.email}`, isBuilder: user.roles.includes("builder") }));

  // Image download progress per batch, from the worker's job results.
  const batchIds = (batches ?? []).map((batch) => batch.id);
  const { data: listings } = batchIds.length
    ? await supabase.from("listings").select("id, import_batch_id, status").in("import_batch_id", batchIds)
    : { data: [] };
  const statusCounts = new Map<string, Record<string, number>>();
  for (const listing of listings ?? []) {
    const counts = statusCounts.get(listing.import_batch_id!) ?? {};
    counts[listing.status] = (counts[listing.status] ?? 0) + 1;
    statusCounts.set(listing.import_batch_id!, counts);
  }
  const fmt = { locale: settings.default_locale, timeZone: settings.default_timezone };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Import listings from Excel"
        description="Add many properties at once. Images and videos are given as links in the sheet."
        actions={
          <a download className="text-sm text-brand underline" href="/admin/import/template">
            Download the Excel template
          </a>
        }
      />
      <Alert tone="info" title="How it works">
        <ol className="list-decimal pl-5">
          <li>Download the template. Its “Lists” sheet shows the categories, property types, amenities and places this site accepts.</li>
          <li>Fill one property per row. Category and Title are required; add direct image links and YouTube/Instagram links.</li>
          <li>Check the file: nothing is saved yet. Fix any rows with problems, or import the ready rows.</li>
          <li>Images are downloaded in the background, checked and stored here; then listings go live or into the review queue.</li>
        </ol>
      </Alert>
      {owners.length ? (
        <Card>
          <ImportForm owners={owners} defaultOwnerId={owners.find((owner) => owner.id === viewer.id)?.id ?? owners[0]!.id} />
        </Card>
      ) : (
        <Alert tone="warning">No account can own listings yet. Give a user the owner, agent or builder role first.</Alert>
      )}

      <section aria-labelledby="recent-imports" className="flex flex-col gap-3">
        <h2 id="recent-imports" className="text-lg font-semibold">Recent imports</h2>
        {batches?.length ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Recent imports</caption>
              <thead className="border-b border-border text-text-muted">
                <tr>
                  <th scope="col" className="p-3">When</th>
                  <th scope="col" className="p-3">File</th>
                  <th scope="col" className="p-3">Owner</th>
                  <th scope="col" className="p-3">Imported</th>
                  <th scope="col" className="p-3">Now</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => {
                  const counts = statusCounts.get(batch.id) ?? {};
                  return (
                    <tr key={batch.id} className="border-b border-border last:border-0">
                      <td className="whitespace-nowrap p-3">{formatDateTime(batch.created_at, fmt)}</td>
                      <td className="p-3">{batch.file_name}</td>
                      <td className="p-3">{batch.owner?.display_name ?? "—"}</td>
                      <td className="p-3">{batch.imported_rows} of {batch.total_rows}{batch.publish_requested ? " · publish" : " · review"}</td>
                      <td className="p-3">
                        <Link className="text-brand underline" href={`/admin/listings?batch=${batch.id}`}>
                          {[
                            counts.published ? `${counts.published} live` : null,
                            counts.pending_review ? `${counts.pending_review} in review` : null,
                            counts.draft ? `${counts.draft} downloading images` : null,
                          ]
                            .filter(Boolean)
                            .join(", ") || "View"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No imports yet" />
        )}
      </section>
    </div>
  );
}
