import { formatDateTime } from "@fyh/shared";
import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { EmptyState, PageHeader } from "@/components/ui";
import { isAdmin, requireStaff } from "@/lib/auth";
import { getSiteSettings } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

export default function AuditPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Audit />
    </Suspense>
  );
}

function summarize(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const entries = Object.entries(value as Record<string, unknown>).filter(([key]) => !["updated_at", "created_at"].includes(key));
  return entries
    .slice(0, 6)
    .map(([key, item]) => `${key}: ${typeof item === "object" ? JSON.stringify(item) : String(item)}`)
    .join(", ");
}

async function Audit() {
  const viewer = await requireStaff("/admin/audit");
  const supabase = await createUserClient();
  const settings = await getSiteSettings();
  // RLS: administrators see everything, moderators see their own actions.
  const { data } = await supabase
    .from("audit_log")
    .select("id, action, entity_type, entity_id, after, created_at, actor:profiles(display_name)")
    .order("id", { ascending: false })
    .limit(200);
  const fmt = { locale: settings.default_locale, timeZone: settings.default_timezone };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Audit log" description={isAdmin(viewer) ? "The latest 200 administrative actions." : "Your latest 200 actions."} />
      {!data?.length ? (
        <EmptyState title="Nothing recorded yet" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">Audit log</caption>
            <thead className="border-b border-border text-text-muted">
              <tr>
                <th scope="col" className="p-3">When</th>
                <th scope="col" className="p-3">Who</th>
                <th scope="col" className="p-3">Action</th>
                <th scope="col" className="p-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="border-b border-border align-top last:border-0">
                  <td className="whitespace-nowrap p-3">{formatDateTime(row.created_at, fmt)}</td>
                  <td className="p-3">{row.actor?.display_name ?? "system / script"}</td>
                  <td className="p-3">
                    {row.action}
                    <span className="block text-text-muted">{row.entity_type} {row.entity_id?.slice(0, 12)}</span>
                  </td>
                  <td className="max-w-md break-words p-3 text-text-muted">{summarize(row.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
