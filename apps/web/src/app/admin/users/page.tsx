import { APP_ROLES } from "@fyh/shared";
import { Suspense } from "react";
import { setUserRole, setUserStatus } from "@/app/actions/admin";
import { ActionForm } from "@/components/action-form";
import { Loading } from "@/components/loading";
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Select, TextInput } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";

export default function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <Suspense fallback={<Loading />}>
      {searchParams.then((params) => (
        <Users q={typeof params.q === "string" ? params.q : ""} />
      ))}
    </Suspense>
  );
}

async function Users({ q }: { q: string }) {
  const viewer = await requireAdmin("/admin/users");
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("admin_list_users", { p_query: q || undefined, p_limit: 100 });
  const users = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Users" description="Grant roles, suspend or reactivate accounts. Every change is audited." />
      <form className="flex flex-wrap items-end gap-2" action="/admin/users">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Name or email
          <TextInput name="q" defaultValue={q} />
        </label>
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      {error ? <Alert tone="danger">Could not load users.</Alert> : null}
      {users.length === 0 ? (
        <EmptyState title="No users found" />
      ) : (
        <ul className="flex flex-col gap-3">
          {users.map((user) => (
            <li key={user.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {user.display_name} {user.id === viewer.id ? <span className="text-text-muted">(you)</span> : null}
                    </p>
                    <p className="text-sm text-text-muted">
                      {user.email} · {user.email_confirmed ? "verified" : "not verified"} · joined {user.created_at.slice(0, 10)} ·{" "}
                      {user.listings_count} listing(s)
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {user.status !== "active" ? <Badge tone="suspended">{user.status.replace("_", " ")}</Badge> : null}
                    {user.roles.map((role) => (
                      <Badge key={role}>{role}</Badge>
                    ))}
                  </div>
                </div>
                {user.id !== viewer.id ? (
                  <div className="flex flex-wrap gap-6">
                    <ActionForm action={setUserRole} submitLabel="Apply" variant="secondary" inline>
                      <input type="hidden" name="userId" value={user.id} />
                      <label className="flex flex-col gap-1 text-sm font-medium">
                        Role
                        <Select name="role" defaultValue="owner">
                          {APP_ROLES.filter((role) => role !== "buyer").map((role) => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </Select>
                      </label>
                      <label className="flex flex-col gap-1 text-sm font-medium">
                        Change
                        <Select name="grant" defaultValue="1">
                          <option value="1">Grant</option>
                          <option value="0">Remove</option>
                        </Select>
                      </label>
                    </ActionForm>
                    {user.status === "suspended" ? (
                      <ActionForm action={setUserStatus} submitLabel="Reactivate" variant="secondary" inline>
                        <input type="hidden" name="userId" value={user.id} />
                        <input type="hidden" name="status" value="active" />
                      </ActionForm>
                    ) : (
                      <ActionForm action={setUserStatus} submitLabel="Suspend" variant="danger" inline confirm="Suspend this account and sign it out everywhere?">
                        <input type="hidden" name="userId" value={user.id} />
                        <input type="hidden" name="status" value="suspended" />
                        <label className="flex flex-col gap-1 text-sm font-medium">
                          Reason (internal)
                          <TextInput name="reason" />
                        </label>
                      </ActionForm>
                    )}
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
