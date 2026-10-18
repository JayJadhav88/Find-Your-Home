import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContentPage, getSiteSettings } from "@/lib/public-data";
import { SimpleMarkdown } from "./simple-markdown";
import { Alert } from "./ui";

export async function contentMetadata(slug: string): Promise<Metadata> {
  const page = await getContentPage(slug);
  return page?.body_markdown ? { title: page.title } : { title: page?.title ?? "Page", robots: { index: false } };
}

export async function ContentPage({ slug }: { slug: string }) {
  const [page, settings] = await Promise.all([getContentPage(slug), getSiteSettings()]);
  if (!page) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold">{page.title}</h1>
      <div className="mt-6">
        {page.body_markdown ? (
          <SimpleMarkdown source={page.body_markdown} />
        ) : (
          <Alert tone="warning" title="This page hasn't been published yet">
            {slug === "privacy" || slug === "terms"
              ? `${settings.brand_name} is preparing this policy. Please contact us if you have questions in the meantime.`
              : "Please check back soon."}
            {settings.contact_email ? (
              <> You can reach us at <a className="underline" href={`mailto:${settings.contact_email}`}>{settings.contact_email}</a>.</>
            ) : null}
          </Alert>
        )}
      </div>
    </div>
  );
}
