import Link from "next/link";
import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireEnquiryTeam } from "@/lib/auth";
import { getSiteSettings } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

// Team calendar: property visits, confirmed photo shoots and callbacks, day by day.

const KIND: Record<string, { label: string; tone: string }> = {
  visit: { label: "Visit", tone: "published" },
  shoot: { label: "Shoot", tone: "pending_review" },
  callback: { label: "Callback", tone: "draft" },
};

function googleLink(event: { title: string; details: string | null; starts_at: string; ends_at: string }) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", event.title);
  url.searchParams.set("dates", `${stamp(event.starts_at)}/${stamp(event.ends_at)}`);
  url.searchParams.set("details", event.details ?? "");
  return url.toString();
}

export default function CalendarPage({ searchParams }: PageProps<"/admin/calendar">) {
  return (
    <Suspense fallback={<Loading />}>
      {searchParams.then((params) => (
        <TeamCalendar weeks={params.weeks === "8" ? 8 : 2} />
      ))}
    </Suspense>
  );
}

async function TeamCalendar({ weeks }: { weeks: number }) {
  await requireEnquiryTeam("/admin/calendar");
  const supabase = await createUserClient();
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + weeks * 7 * 86_400_000);
  const [settings, { data: events, error }] = await Promise.all([
    getSiteSettings(),
    supabase.rpc("team_calendar", { p_from: from.toISOString(), p_to: to.toISOString() }),
  ]);
  const timeZone = settings.default_timezone;
  const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone });
  const days = new Map<string, NonNullable<typeof events>>();
  for (const event of events ?? []) {
    const key = dayKey(event.starts_at);
    days.set(key, [...(days.get(key) ?? []), event]);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Calendar"
        description={`Property visits, confirmed photo shoots and callbacks for the next ${weeks} weeks.`}
        actions={
          <ButtonLink href={weeks === 2 ? "/admin/calendar?weeks=8" : "/admin/calendar"} variant="secondary">
            {weeks === 2 ? "Show 8 weeks" : "Show 2 weeks"}
          </ButtonLink>
        }
      />
      {error ? <p className="text-danger">{error.message}</p> : null}
      {days.size ? (
        <div className="flex flex-col gap-4">
          {[...days.entries()].map(([day, items]) => (
            <Card key={day} className="flex flex-col gap-3">
              <h2 className="font-semibold">
                {new Date(`${day}T12:00:00Z`).toLocaleDateString(settings.default_locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
              </h2>
              <ul className="flex flex-col gap-2">
                {items.map((event) => (
                  <li key={event.uid} className="flex flex-wrap items-center gap-3 border-t border-border pt-2 text-sm first:border-0 first:pt-0">
                    <span className="w-16 font-mono">{new Date(event.starts_at).toLocaleTimeString(settings.default_locale, { hour: "2-digit", minute: "2-digit", timeZone })}</span>
                    <Badge tone={KIND[event.kind]?.tone}>{KIND[event.kind]?.label ?? event.kind}</Badge>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{event.title}</span>
                      {event.details ? <span className="block text-text-muted">{event.details}</span> : null}
                    </span>
                    <span className="flex gap-3">
                      {event.kind === "shoot" ? (
                        <Link href="/admin/boosts" className="text-brand underline">Open</Link>
                      ) : (
                        <Link href={`/admin/enquiries/${event.link_id}`} className="text-brand underline">Open</Link>
                      )}
                      <a href={googleLink(event)} target="_blank" rel="noopener noreferrer" className="text-brand underline">
                        Add to Google Calendar
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="Nothing planned">Visit requests, confirmed shoots and callbacks with a time show here.</EmptyState>
      )}
      <p className="text-sm text-text-muted">
        Want everything in Google Calendar automatically? An administrator can make a private calendar link in Admin → Integrations →
        Team calendar.
      </p>
    </div>
  );
}
