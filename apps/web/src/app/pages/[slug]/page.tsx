import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { HtmlPageFrame } from "@/components/html-page-frame";
import { Loading } from "@/components/loading";
import { SimpleMarkdown } from "@/components/simple-markdown";
import { Alert } from "@/components/ui";
import { getContentPage } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

type Props = PageProps<"/pages/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await getContentPage((await params).slug);
  return page
    ? { title: page.title, description: page.description ?? undefined, alternates: { canonical: `/pages/${page.slug}` } }
    : { title: "Page", robots: { index: false } };
}

export default function CustomPage({ params }: Props) {
  return (
    <Suspense fallback={<Loading />}>
      {params.then(({ slug }) => (
        <PageBody slug={slug} />
      ))}
    </Suspense>
  );
}

async function PageBody({ slug }: { slug: string }) {
  // Published pages come from the cache. Drafts are visible only to the content team (RLS).
  const published = await getContentPage(slug);
  const page =
    published ??
    (
      await (await createUserClient())
        .from("content_pages")
        .select("slug, title, body_markdown, format, description, full_page, is_system, updated_at")
        .eq("slug", slug)
        .maybeSingle()
    ).data;
  if (!page) notFound();
  if (page.format === "markdown" && page.is_system) redirect(`/${page.slug}`);
  if (page.format === "html" && page.full_page && published) redirect(`/pages/${page.slug}/raw`);

  return (
    <div className={page.format === "html" ? "w-full" : "mx-auto max-w-3xl px-4 py-10"}>
      {!published ? (
        <div className="mx-auto max-w-3xl px-4 pt-6">
          <Alert tone="warning" title="Draft preview">Only the team can see this page until it is published in Admin → Pages.</Alert>
        </div>
      ) : null}
      {page.format === "html" ? (
        <HtmlPageFrame src={`/pages/${page.slug}/raw?embed=1`} title={page.title} />
      ) : (
        <>
          <h1 className="text-3xl font-semibold">{page.title}</h1>
          <div className="mt-6">
            <SimpleMarkdown source={page.body_markdown} />
          </div>
        </>
      )}
    </div>
  );
}
