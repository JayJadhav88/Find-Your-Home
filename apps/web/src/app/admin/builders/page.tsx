import Link from "next/link";
import { Suspense } from "react";
import { mergeBuilders, saveBuilder } from "@/app/actions/admin-builders";
import { ActionForm } from "@/components/action-form";
import { Loading } from "@/components/loading";
import { Badge, Card, Checkbox, EmptyState, Field, PageHeader, Select, TextArea, TextInput } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";

type BuilderRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  website: string | null;
  logo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  user_id: string | null;
};

export default function BuildersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Builders />
    </Suspense>
  );
}

async function Builders() {
  await requireStaff("/admin/builders");
  const supabase = await createUserClient();
  const [{ data: builders }, { data: projects }] = await Promise.all([
    supabase.from("builders").select("*").order("name"),
    supabase.from("listings").select("builder_id").not("builder_id", "is", null),
  ]);
  const projectCount = new Map<string, number>();
  for (const row of projects ?? []) if (row.builder_id) projectCount.set(row.builder_id, (projectCount.get(row.builder_id) ?? 0) + 1);
  const list = (builders ?? []) as BuilderRow[];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Builders"
        description="One record per builder, used for New Launches and the builder filter. Names that differ only in capitals or spaces count as the same builder."
      />

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Add a builder</h2>
        <BuilderForm />
      </Card>

      {list.length > 1 ? (
        <Card>
          <h2 className="text-lg font-semibold">Merge duplicates</h2>
          <p className="mb-3 mt-1 text-sm text-text-muted">Projects move to the builder you keep, and the duplicate is removed.</p>
          <ActionForm action={mergeBuilders} submitLabel="Merge" variant="secondary" inline confirm="Merge these builders? This can't be undone.">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Duplicate
              <Select bare name="from" defaultValue="">
                <option value="" disabled>Choose…</option>
                {list.map((builder) => (
                  <option key={builder.id} value={builder.id}>{builder.name}</option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Keep
              <Select bare name="into" defaultValue="">
                <option value="" disabled>Choose…</option>
                {list.map((builder) => (
                  <option key={builder.id} value={builder.id}>{builder.name}</option>
                ))}
              </Select>
            </label>
          </ActionForm>
        </Card>
      ) : null}

      {list.length ? (
        <ul className="flex flex-col gap-3">
          {list.map((builder) => (
            <li key={builder.id}>
              <Card className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {builder.name}{" "}
                    <span className="font-normal text-text-muted">· {projectCount.get(builder.id) ?? 0} project(s)</span>
                  </p>
                  <span className="flex gap-2">
                    {builder.user_id ? <Badge>Has an account</Badge> : null}
                    {builder.is_active ? (
                      <Link className="text-sm text-brand underline" href={`/builders/${builder.slug}`}>Public page</Link>
                    ) : (
                      <Badge tone="archived">Hidden</Badge>
                    )}
                  </span>
                </div>
                <details>
                  <summary className="cursor-pointer text-sm text-brand">Edit</summary>
                  <div className="mt-3">
                    <BuilderForm builder={builder} />
                  </div>
                </details>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No builders yet" />
      )}
    </div>
  );
}

function BuilderForm({ builder }: { builder?: BuilderRow }) {
  return (
    <ActionForm action={saveBuilder} submitLabel={builder ? "Save builder" : "Add builder"} resetOnSuccess={!builder}>
      <input type="hidden" name="id" value={builder?.id ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="name" required>
          <TextInput name="name" defaultValue={builder?.name} maxLength={120} id={builder ? `name-${builder.id}` : "name"} />
        </Field>
        <Field label="Website" name="website">
          <TextInput name="website" type="url" placeholder="https://" defaultValue={builder?.website ?? ""} id={builder ? `website-${builder.id}` : "website"} />
        </Field>
        <Field label="Logo image address" name="logoUrl" hint="An https link to the logo.">
          <TextInput name="logoUrl" type="url" placeholder="https://" defaultValue={builder?.logo_url ?? ""} id={builder ? `logo-${builder.id}` : "logoUrl"} />
        </Field>
        <Field label="Contact email" name="contactEmail">
          <TextInput name="contactEmail" type="email" defaultValue={builder?.contact_email ?? ""} id={builder ? `email-${builder.id}` : "contactEmail"} />
        </Field>
        <Field label="Contact phone" name="contactPhone">
          <TextInput name="contactPhone" type="tel" defaultValue={builder?.contact_phone ?? ""} id={builder ? `phone-${builder.id}` : "contactPhone"} />
        </Field>
      </div>
      <Field label="About the builder" name="description">
        <TextArea name="description" rows={3} maxLength={4000} defaultValue={builder?.description ?? ""} id={builder ? `about-${builder.id}` : "description"} />
      </Field>
      <Checkbox name="isActive" label="Show publicly" defaultChecked={builder?.is_active ?? true} />
    </ActionForm>
  );
}
