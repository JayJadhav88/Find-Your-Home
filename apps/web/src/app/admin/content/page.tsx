import Link from "next/link";
import { Suspense } from "react";
import { createContentPage } from "@/app/actions/admin";
import { ActionForm } from "@/components/action-form";
import { Loading } from "@/components/loading";
import { Alert, Badge, Card, Field, PageHeader, Select, TextInput } from "@/components/ui";
import { isAdmin, requireContentTeam } from "@/lib/auth";
import { pagePath } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

export default function AdminContentPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const viewer = await requireContentTeam("/admin/content");
  const supabase = await createUserClient();
  const { data: pages } = await supabase
    .from("content_pages")
    .select("slug, title, format, is_published, is_system, in_footer, updated_at")
    .order("is_system", { ascending: false })
    .order("sort_order")
    .order("title");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pages"
        description="Add, edit and delete the site's pages. Write them as formatted text, or (super admins) paste your own HTML with styles and scripts."
      />
      <Alert tone="warning" title="Legal pages">
        The privacy policy and terms must be written or reviewed by a qualified professional for the countries you operate in.
        They stay unpublished until you publish them here.
      </Alert>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Add a page</h2>
        <ActionForm action={createContentPage} submitLabel="Add page">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Title" name="title" required>
              <TextInput name="title" maxLength={120} placeholder="Home loans" />
            </Field>
            <Field label="Address" name="slug" hint="Optional. The page opens at /pages/<address>.">
              <TextInput name="slug" maxLength={80} placeholder="home-loans" />
            </Field>
            <Field label="Type" name="format">
              <Select name="format" defaultValue="markdown">
                <option value="markdown">Formatted text</option>
                {isAdmin(viewer) ? <option value="html">HTML (your own code)</option> : null}
              </Select>
            </Field>
          </div>
        </ActionForm>
      </Card>

      <ul className="flex flex-col gap-2">
        {(pages ?? []).map((page) => (
          <li key={page.slug}>
            <Card className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <Link href={`/admin/content/${page.slug}`} className="font-semibold text-brand underline">
                  {page.title}
                </Link>
                <span className="text-sm text-text-muted">{pagePath(page)}</span>
              </div>
              <span className="flex flex-wrap items-center gap-2 text-sm">
                {page.is_published ? <Badge tone="published">published</Badge> : <Badge tone="archived">draft</Badge>}
                <Badge>{page.format === "html" ? "HTML" : "text"}</Badge>
                {page.is_system ? <Badge>standard page</Badge> : page.in_footer ? <Badge>in footer</Badge> : null}
              </span>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
