import { formatDateTime } from "@fyh/shared";
import Link from "next/link";
import { Suspense } from "react";
import { updateSavedSearch } from "@/app/actions/extras";
import { ActionForm } from "@/components/action-form";
import { Loading } from "@/components/loading";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { getSiteSettings } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

export default function SavedSearchesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SavedSearches />
    </Suspense>
  );
}

async function SavedSearches() {
  await requireViewer("/account/saved-searches");
  const supabase = await createUserClient();
  const [settings, { data: searches }] = await Promise.all([
    getSiteSettings(),
    supabase.from("saved_searches").select("*").order("created_at", { ascending: false }),
  ]);
  const fmt = { locale: settings.default_locale, timeZone: settings.default_timezone };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Saved searches"
        description="We check each search every hour and tell you when new homes match (in the app, and by phone or email if you allow it)."
      />
      {searches?.length ? (
        <ul className="flex flex-col gap-3">
          {searches.map((search) => (
            <li key={search.id}>
              <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link className="font-medium underline" href={`/search${search.query_string ? `?${search.query_string}` : ""}`}>
                    {search.name}
                  </Link>
                  <p className="text-sm text-text-muted">
                    Saved {formatDateTime(search.created_at, fmt)} · {search.alerts ? <Badge tone="published">alerts on</Badge> : <Badge>alerts off</Badge>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionForm action={updateSavedSearch} submitLabel={search.alerts ? "Pause alerts" : "Turn alerts on"} submitAriaLabel={`${search.alerts ? "Pause" : "Turn on"} alerts for ${search.name}`} variant="secondary" inline>
                    <input type="hidden" name="id" value={search.id} />
                    <input type="hidden" name="action" value={search.alerts ? "alerts-off" : "alerts-on"} />
                  </ActionForm>
                  <ActionForm action={updateSavedSearch} submitLabel="Delete" submitAriaLabel={`Delete ${search.name}`} variant="ghost" inline confirm="Delete this saved search?">
                    <input type="hidden" name="id" value={search.id} />
                    <input type="hidden" name="action" value="delete" />
                  </ActionForm>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No saved searches yet" action={<ButtonLink href="/search">Search homes</ButtonLink>}>
          Search for homes, then choose “Save search &amp; get alerts”.
        </EmptyState>
      )}
    </div>
  );
}
