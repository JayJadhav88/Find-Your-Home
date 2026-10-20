import { Suspense } from "react";
import { saveContentPage } from "@/app/actions/admin";
import { ActionForm } from "@/components/action-form";
import { Loading } from "@/components/loading";
import { Alert, Card, Checkbox, Field, PageHeader, TextArea, TextInput } from "@/components/ui";
import { requireContentTeam } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";

export default function AdminContentPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireContentTeam("/admin/content");
  const supabase = await createUserClient();
  const { data: pages } = await supabase.from("content_pages").select("*").order("slug");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Pages" description="Text for About, Contact, Privacy and Terms. Supports headings (#), lists (-), **bold** and [links](https://…)." />
      <Alert tone="warning" title="Legal pages">
        The privacy policy and terms must be written or reviewed by a qualified professional for the countries you operate in.
        They stay unpublished until you publish them here.
      </Alert>
      {(pages ?? []).map((page) => (
        <Card key={page.slug}>
          <ActionForm action={saveContentPage} submitLabel={`Save ${page.slug}`}>
            <input type="hidden" name="slug" value={page.slug} />
            <h2 className="text-lg font-semibold">/{page.slug}</h2>
            <Field label="Title" name={`title-${page.slug}`}>
              <TextInput id={`title-${page.slug}`} name="title" defaultValue={page.title} />
            </Field>
            <Field label="Text" name={`body-${page.slug}`}>
              <TextArea id={`body-${page.slug}`} name="body" rows={10} defaultValue={page.body_markdown} />
            </Field>
            <Checkbox name="published" label="Published" defaultChecked={page.is_published} />
          </ActionForm>
        </Card>
      ))}
    </div>
  );
}
