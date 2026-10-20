import { ROLE_LABEL, TEAM_ROLES, type AppRole } from "@fyh/shared";
import { Suspense } from "react";
import { addTeamMember, removeFromTeam, setUserRole, setUserStatus } from "@/app/actions/admin";
import { ActionForm } from "@/components/action-form";
import { Loading } from "@/components/loading";
import { Alert, Badge, Card, EmptyState, Field, PageHeader, Select, TextInput } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";

// What each team role may do. The database enforces the same rules.
const ROLE_ACCESS: Array<[AppRole, string]> = [
  ["administrator", "Everything: team and roles, customers, integrations, settings, pages, imports, privacy requests."],
  ["crm_manager", "All leads and enquiries: assign them to sales agents, move them through the pipeline, add leads, notes and follow-ups."],
  ["sales_agent", "Only the leads assigned to them: call, update status, add notes and follow-ups. Cannot reassign."],
  ["moderator", "Review and publish listings, handle reports and fraud warnings, and handle enquiries."],
  ["support", "Enquiries only: see all, assign, change status, add internal notes."],
  ["content_manager", "Site content: About, Contact, Terms and Privacy pages, home banners and the floating button. No access to leads."],
  ["marketing", "Send messages to members (broadcasts) and see their delivery reports."],
];

const isTeamRole = (role: AppRole) => (TEAM_ROLES as readonly AppRole[]).includes(role);

export default function TeamPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Team />
    </Suspense>
  );
}

async function Team() {
  const viewer = await requireAdmin("/admin/team");
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("admin_list_users", { p_kind: "team", p_limit: 200 });
  const members = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Team & roles" description="People who work in the admin panel and what each role can do. Every change is audited." />

      <Card>
        <h2 className="text-lg font-semibold">Roles</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {ROLE_ACCESS.map(([role, access]) => (
            <div key={role} className="rounded-lg border border-border p-3">
              <dt className="font-medium">{ROLE_LABEL[role]}</dt>
              <dd className="text-sm text-text-muted">{access}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Add a team member</h2>
        <p className="mb-3 mt-1 text-sm text-text-muted">
          They create their own account first (email, or Google once it is set up), then you give it a role here.
        </p>
        <ActionForm action={addTeamMember} submitLabel="Add to team" resetOnSuccess>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Their account email" name="email">
              <TextInput name="email" type="email" autoComplete="off" />
            </Field>
            <Field label="Role" name="role">
              <Select name="role" defaultValue="support">
                {TEAM_ROLES.map((role) => (
                  <option key={role} value={role}>{ROLE_LABEL[role]}</option>
                ))}
              </Select>
            </Field>
          </div>
        </ActionForm>
      </Card>

      {error ? <Alert tone="danger">Could not load the team.</Alert> : null}
      {members.length === 0 ? (
        <EmptyState title="No team members yet" />
      ) : (
        <ul className="flex flex-col gap-3">
          {members.map((member) => (
            <li key={member.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {member.display_name} {member.id === viewer.id ? <span className="text-text-muted">(you)</span> : null}
                    </p>
                    <p className="text-sm text-text-muted">
                      {member.email} · {member.last_sign_in_at ? `last signed in ${member.last_sign_in_at.slice(0, 10)}` : "never signed in"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {member.status !== "active" ? <Badge tone="suspended">{member.status.replace("_", " ")}</Badge> : null}
                    {member.roles.filter(isTeamRole).map((role) => (
                      <Badge key={role}>{ROLE_LABEL[role].split(" (")[0]}</Badge>
                    ))}
                  </div>
                </div>
                {member.id !== viewer.id ? (
                  <div className="flex flex-wrap gap-6">
                    <ActionForm action={setUserRole} submitLabel="Apply" submitAriaLabel={`Apply role change for ${member.display_name}`} variant="secondary" inline>
                      <input type="hidden" name="userId" value={member.id} />
                      <label className="flex flex-col gap-1 text-sm font-medium">
                        Role
                        <Select bare name="role" defaultValue="support">
                          {TEAM_ROLES.map((role) => (
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
                    <ActionForm
                      action={removeFromTeam}
                      submitLabel="Remove from team"
                      submitAriaLabel={`Remove ${member.display_name} from the team`}
                      variant="ghost"
                      inline
                      confirm={`Remove ${member.display_name} from the team? Their customer account stays.`}
                    >
                      <input type="hidden" name="userId" value={member.id} />
                    </ActionForm>
                    {member.status === "suspended" ? (
                      <ActionForm action={setUserStatus} submitLabel="Reactivate" submitAriaLabel={`Reactivate ${member.display_name}`} variant="secondary" inline>
                        <input type="hidden" name="userId" value={member.id} />
                        <input type="hidden" name="status" value="active" />
                      </ActionForm>
                    ) : (
                      <ActionForm
                        action={setUserStatus}
                        submitLabel="Suspend account"
                        submitAriaLabel={`Suspend ${member.display_name}`}
                        variant="danger"
                        inline
                        confirm="Suspend this account and sign it out everywhere?"
                      >
                        <input type="hidden" name="userId" value={member.id} />
                        <input type="hidden" name="status" value="suspended" />
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
