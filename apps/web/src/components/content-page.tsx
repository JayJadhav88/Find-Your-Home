import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getContentPage, getSiteSettings } from "@/lib/public-data";
import { SimpleMarkdown } from "./simple-markdown";
import { Alert } from "./ui";

export async function contentMetadata(slug: string, fallbackTitle?: string): Promise<Metadata> {
  const page = await getContentPage(slug);
  if (page?.body_markdown || (fallbackTitle && !page)) return { title: page?.title ?? fallbackTitle };
  return { title: page?.title ?? "Page", robots: { index: false } };
}

/**
 * A page written in Admin → Pages. Pages that also carry their own content (e.g. the contact
 * form) pass `fallbackTitle`, so they still work before the admin has published any text.
 */
export async function ContentPage({ slug, fallbackTitle, children }: { slug: string; fallbackTitle?: string; children?: ReactNode }) {
  const [found, settings] = await Promise.all([getContentPage(slug), getSiteSettings()]);
  const page = found ?? (fallbackTitle ? { title: fallbackTitle, body_markdown: "" } : null);
  if (!page) notFound();
  // A page the team rebuilt in HTML is shown by the sandboxed HTML page view.
  if (found?.format === "html") redirect(`/pages/${slug}`);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold">{page.title}</h1>
      <div className="mt-6">
        {page.body_markdown ? (
          <SimpleMarkdown source={page.body_markdown} />
        ) : children ? null : (
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
      {children ? <div className="mt-8">{children}</div> : null}
    </div>
  );
}
