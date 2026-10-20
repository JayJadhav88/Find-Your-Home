import { ROLE_LABEL, type AppRole } from "@fyh/shared";
import Link from "next/link";
import { Suspense } from "react";
import { setUserRole, setUserStatus } from "@/app/actions/admin";
import { ActionForm } from "@/components/action-form";
import { Loading } from "@/components/loading";
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Select, TextInput } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";

// Customer-side roles an administrator may give: listing rights.
const CUSTOMER_ROLES: AppRole[] = ["owner", "builder", "agent"];

export default function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  return (
    <Suspense fallback={<Loading />}>
      {searchParams.then((params) => (
        <Customers q={typeof params.q === "string" ? params.q : ""} />
      ))}
    </Suspense>
  );
}

async function Customers({ q }: { q: string }) {
  await requireAdmin("/admin/customers");
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("admin_list_users", { p_query: q || undefined, p_limit: 100, p_kind: "customers" });
  const customers = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Customers"
        description="Members who browse, enquire and list properties. Search, give listing rights, suspend or reactivate. Team members are under Team & roles."
      />
      <form className="flex flex-wrap items-end gap-2" action="/admin/customers">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Name or email
          <TextInput bare name="q" defaultValue={q} />
        </label>
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      {error ? <Alert tone="danger">Could not load customers.</Alert> : null}
      {customers.length === 0 ? (
        <EmptyState title="No customers found" />
      ) : (
        <ul className="flex flex-col gap-3">
          {customers.map((customer) => (
            <li key={customer.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{customer.display_name}</p>
                    <p className="text-sm text-text-muted">
                      {customer.email} · {customer.email_confirmed ? "verified" : "not verified"} · joined {customer.created_at.slice(0, 10)} ·{" "}
                      {customer.listings_count} listing(s) · {customer.enquiries_count} enquiry(ies)
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {customer.status !== "active" ? <Badge tone="suspended">{customer.status.replace("_", " ")}</Badge> : null}
                    {customer.roles
                      .filter((role) => role !== "buyer")
                      .map((role) => (
                        <Badge key={role}>{ROLE_LABEL[role].split(" (")[0]}</Badge>
                      ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-6">
                  <ActionForm action={setUserRole} submitLabel="Apply" submitAriaLabel={`Apply listing rights for ${customer.display_name}`} variant="secondary" inline>
                    <input type="hidden" name="userId" value={customer.id} />
                    <label className="flex flex-col gap-1 text-sm font-medium">
                      Listing rights
                      <Select bare name="role" defaultValue="owner">
                        {CUSTOMER_ROLES.map((role) => (
                          <option key={role} value={role}>{ROLE_LABEL[role]}</option>
                        ))}
                      </Select>
                    </label>
                    <label className="flex flex-col gap-1 text-sm font-medium">
                      Change
                      <Select bare name="grant" defaultValue="1">
                        <option value="1">Give</option>
                        <option value="0">Take away</option>
                      </Select>
                    </label>
                  </ActionForm>
                  {customer.status === "suspended" ? (
                    <ActionForm action={setUserStatus} submitLabel="Reactivate" submitAriaLabel={`Reactivate ${customer.display_name}`} variant="secondary" inline>
                      <input type="hidden" name="userId" value={customer.id} />
                      <input type="hidden" name="status" value="active" />
                    </ActionForm>
                  ) : (
                    <ActionForm
                      action={setUserStatus}
                      submitLabel="Suspend"
                      submitAriaLabel={`Suspend ${customer.display_name}`}
                      variant="danger"
                      inline
                      confirm="Suspend this account and sign it out everywhere?"
                    >
                      <input type="hidden" name="userId" value={customer.id} />
                      <input type="hidden" name="status" value="suspended" />
                      <label className="flex flex-col gap-1 text-sm font-medium">
                        Reason (internal)
                        <TextInput bare name="reason" />
                      </label>
                    </ActionForm>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-text-muted">
        To make a customer part of the team, use <Link className="underline" href="/admin/team">Team &amp; roles</Link>.
      </p>
    </div>
  );
}
