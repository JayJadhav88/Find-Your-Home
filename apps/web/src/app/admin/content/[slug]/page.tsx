import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deleteContentPage, saveContentPage } from "@/app/actions/admin";
import { ActionForm } from "@/components/action-form";
import { Loading } from "@/components/loading";
import { Alert, Card, Checkbox, Field, PageHeader, Select, TextArea, TextInput } from "@/components/ui";
import { isAdmin, requireContentTeam } from "@/lib/auth";
import { pagePath } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

type Props = PageProps<"/admin/content/[slug]">;

export default function EditContentPage({ params }: Props) {
  return (
    <Suspense fallback={<Loading />}>
      {params.then(({ slug }) => (
        <Editor slug={slug} />
      ))}
    </Suspense>
  );
}

async function Editor({ slug }: { slug: string }) {
  const viewer = await requireContentTeam(`/admin/content/${slug}`);
  const admin = isAdmin(viewer);
  const supabase = await createUserClient();
  const { data: page } = await supabase.from("content_pages").select("*").eq("slug", slug).maybeSingle();
  if (!page) notFound();
  const html = page.format === "html";
  const address = pagePath(page);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={page.title}
        description={`Opens at ${address}${page.is_published ? "" : " (draft: only the team can see it)"}.`}
        actions={
          <span className="flex gap-3 text-sm">
            <Link href="/admin/content" className="text-brand underline">All pages</Link>
            <a href={html ? `/pages/${page.slug}` : address} target="_blank" rel="noopener" className="text-brand underline">
              Preview
            </a>
          </span>
        }
      />

      <Card>
        <ActionForm action={saveContentPage} submitLabel="Save page">
          <input type="hidden" name="slug" value={page.slug} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" name="title" required>
              <TextInput name="title" defaultValue={page.title} maxLength={120} />
            </Field>
            <Field label="Search engine description" name="description" hint="Optional, up to 300 characters.">
              <TextInput name="description" defaultValue={page.description ?? ""} maxLength={300} />
            </Field>
          </div>

          {admin ? (
            <Field label="Type" name="format" hint="Switching type keeps both versions; the selected one is shown.">
              <Select name="format" defaultValue={page.format}>
                <option value="markdown">Formatted text</option>
                <option value="html">HTML (your own code)</option>
              </Select>
            </Field>
          ) : null}

          {admin || html ? (
            <Field
              label="HTML"
              name="bodyHtml"
              hint="Paste a whole page (<html>…</html>) or just the content. <style> and <script> work. Scripts run in a sandbox: they cannot use this site's sign-in, cookies or local storage, so build forms that post to other services or link to /contact."
            >
              <TextArea
                name="bodyHtml"
                rows={22}
                defaultValue={page.body_html}
                readOnly={!admin}
                spellCheck={false}
                className="font-mono text-sm"
                placeholder={'<section class="hero">\n  <h1>Home loans</h1>\n</section>\n<style>\n  .hero { padding: 4rem 1rem; }\n</style>'}
              />
            </Field>
          ) : null}
          {admin ? (
            <>
              <input type="hidden" name="fullPageField" value="1" />
              <Checkbox name="fullPage" label="Whole page: show the HTML without the site's header and footer" defaultChecked={page.full_page} />
            </>
          ) : html ? (
            <Alert tone="info">Only super admins can change this page&apos;s HTML.</Alert>
          ) : null}

          {!html || admin ? (
            <Field label="Formatted text" name="body" hint="Used when the type is formatted text. Headings (#), lists (-), **bold** and [links](https://…).">
              <TextArea name="body" rows={12} defaultValue={page.body_markdown} />
            </Field>
          ) : (
            <input type="hidden" name="body" value={page.body_markdown} />
          )}

          <div className="flex flex-wrap gap-6">
            <Checkbox name="published" label="Published" defaultChecked={page.is_published} />
            {page.is_system ? null : <Checkbox name="inFooter" label="Link in the footer" defaultChecked={page.in_footer} />}
          </div>
          {page.is_system ? null : (
            <Field label="Footer order" name="sortOrder" hint="Lower numbers show first.">
              <TextInput name="sortOrder" inputMode="numeric" defaultValue={page.sort_order} className="max-w-32" />
            </Field>
          )}
        </ActionForm>
      </Card>

      {page.is_system ? (
        <p className="text-sm text-text-muted">About, Contact, Privacy and Terms are standard pages and can&apos;t be deleted. Unpublish them instead.</p>
      ) : (
        <Card>
          <h2 className="mb-2 font-semibold">Delete this page</h2>
          <p className="mb-3 text-sm text-text-muted">The address {address} will stop working. This can&apos;t be undone.</p>
          <ActionForm action={deleteContentPage} submitLabel="Delete page" variant="danger" confirm={`Delete “${page.title}”? This can't be undone.`}>
            <input type="hidden" name="slug" value={page.slug} />
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
