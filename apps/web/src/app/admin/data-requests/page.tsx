import { Suspense } from "react";
import { updateDataRequest } from "@/app/actions/admin";
import { ActionForm } from "@/components/action-form";
import { Loading } from "@/components/loading";
import { Badge, Card, EmptyState, PageHeader, Select, TextInput } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";

export default function DataRequestsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <DataRequests />
    </Suspense>
  );
}

async function DataRequests() {
  await requireAdmin("/admin/data-requests");
  const supabase = await createUserClient();
  const { data } = await supabase
    .from("data_requests")
    .select("*, user:profiles!data_requests_user_id_fkey(display_name)")
    .order("requested_at", { ascending: false })
    .limit(200);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Privacy requests"
        description="Data copies and account deletions requested by members. Fulfil them manually (see the README), then mark them completed."
      />
      {!data?.length ? (
        <EmptyState title="No requests" />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((request) => (
            <li key={request.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p>
                    <span className="font-semibold">{request.kind === "export" ? "Data copy" : "Account deletion"}</span> for{" "}
                    {request.user?.display_name ?? "deleted account"} · requested {request.requested_at.slice(0, 10)}
                  </p>
                  <Badge tone={request.status === "completed" ? "published" : request.status === "rejected" ? "rejected" : "pending_review"}>
                    {request.status.replace("_", " ")}
                  </Badge>
                </div>
                {request.notes ? <p className="text-sm text-text-muted">Notes: {request.notes}</p> : null}
                <ActionForm action={updateDataRequest} submitLabel="Update" variant="secondary" inline>
                  <input type="hidden" name="id" value={request.id} />
                  <label className="flex flex-col gap-1 text-sm font-medium">
                    Status
                    <Select name="status" defaultValue={request.status}>
                      <option value="pending">Pending</option>
                      <option value="in_progress">In progress</option>
                      <option value="completed">Completed</option>
                      <option value="rejected">Rejected</option>
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium">
                    Notes
                    <TextInput name="notes" />
                  </label>
                </ActionForm>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
