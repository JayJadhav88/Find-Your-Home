import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ListingCard, ListingGrid } from "@/components/listing-card";
import { Loading } from "@/components/loading";
import { EmptyState } from "@/components/ui";
import { getBuilderBySlug, getSiteSettings } from "@/lib/public-data";
import { createPublicClient } from "@/lib/supabase";

type Props = PageProps<"/builders/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const builder = await getBuilderBySlug((await params).slug);
  return builder
    ? { title: `${builder.name}: new projects`, description: builder.description?.slice(0, 160) ?? `New projects by ${builder.name}.` }
    : { title: "Builder not found", robots: { index: false } };
}

export default function BuilderPage({ params }: Props) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Suspense fallback={<Loading />}>
        {params.then(({ slug }) => (
          <Builder slug={slug} />
        ))}
      </Suspense>
    </div>
  );
}

async function Builder({ slug }: { slug: string }) {
  await connection();
  const builder = await getBuilderBySlug(slug);
  if (!builder) notFound();
  const settings = await getSiteSettings();
  const { data: projects } = await createPublicClient().rpc("search_listings", { p_builder_id: builder.id, p_limit: 48 });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-text-muted">Builder</p>
        <h1 className="text-3xl font-semibold">{builder.name}</h1>
        {builder.description ? <p className="max-w-3xl whitespace-pre-wrap">{builder.description}</p> : null}
        {builder.website ? (
          <a href={builder.website} target="_blank" rel="noopener noreferrer nofollow" className="text-sm text-brand underline">
            {builder.website.replace("https://", "")}
          </a>
        ) : null}
      </header>
      <section aria-labelledby="projects-heading">
        <h2 id="projects-heading" className="mb-4 text-xl font-semibold">Projects</h2>
        {projects?.length ? (
          <ListingGrid>
            {projects.slice(0, 48).map((project) => (
              <ListingCard key={project.id} listing={project} locale={settings.default_locale} />
            ))}
          </ListingGrid>
        ) : (
          <EmptyState title="No live projects right now" />
        )}
      </section>
    </div>
  );
}
