import Link from "next/link";
import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { Alert, ButtonLink, Card, PageHeader } from "@/components/ui";
import { isAdmin, requireTeam } from "@/lib/auth";
import { getSiteSettings } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";
import { daysAgoIso } from "@/lib/time";

export default function AdminDashboardPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<Loading />}>
      {searchParams.then((params) => (
        <Dashboard denied={params.denied === "admin-only" || params.denied === "permission"} />
      ))}
    </Suspense>
  );
}

async function Dashboard({ denied }: { denied: boolean }) {
  const viewer = await requireTeam("/admin");
  const supabase = await createUserClient();
  const settings = await getSiteSettings();
  const weekAgo = daysAgoIso(7);
  const count = (query: PromiseLike<{ count: number | null }>) => query.then((result) => result.count ?? 0);

  const [pending, published, enquiriesWeek, newEnquiries, users, outboxPending, outboxFailed, jobsFailed, openRequests] =
    await Promise.all([
      count(supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "pending_review")),
      count(supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "published")),
      count(supabase.from("enquiries").select("id", { count: "exact", head: true }).gte("created_at", weekAgo)),
      count(supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("status", "new")),
      isAdmin(viewer) ? count(supabase.from("profiles").select("id", { count: "exact", head: true })) : Promise.resolve(null),
      isAdmin(viewer) ? count(supabase.from("notification_outbox").select("id", { count: "exact", head: true }).eq("status", "pending")) : Promise.resolve(null),
      isAdmin(viewer) ? count(supabase.from("notification_outbox").select("id", { count: "exact", head: true }).eq("status", "failed")) : Promise.resolve(null),
      isAdmin(viewer) ? count(supabase.from("job_queue").select("id", { count: "exact", head: true }).eq("status", "failed")) : Promise.resolve(null),
      isAdmin(viewer) ? count(supabase.from("data_requests").select("id", { count: "exact", head: true }).in("status", ["pending", "in_progress"])) : Promise.resolve(null),
    ]);

  const tiles: Array<[string, number | null, string]> = [
    ["Awaiting review", pending, "/admin/listings?status=pending_review"],
    ["Live listings", published, "/admin/listings?status=published"],
    ["Enquiries this week", enquiriesWeek, "/admin/enquiries"],
    ["Unhandled enquiries", newEnquiries, "/admin/enquiries?status=new"],
    ["Members", users, "/admin/customers"],
    ["Open privacy requests", openRequests, "/admin/data-requests"],
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description={`Signed in as ${viewer.displayName} (${viewer.roles.filter((role) => role !== "buyer").join(", ")})`} />
      {denied ? <Alert tone="warning">Your team role doesn&rsquo;t include that section. Ask a super admin if you need access.</Alert> : null}
      {!settings.default_currency ? (
        <Alert tone="warning" title="Setup needed">
          No default currency is set. <Link className="underline" href="/admin/settings">Open settings</Link> to enable your currency.
        </Alert>
      ) : null}
      {outboxFailed || jobsFailed ? (
        <Alert tone="danger" title="Background work needs attention">
          {outboxFailed ? `${outboxFailed} email(s) failed to send. ` : ""}
          {jobsFailed ? `${jobsFailed} photo publishing job(s) failed. ` : ""}
          See docs/07-operations.md.
        </Alert>
      ) : null}
      {outboxPending && outboxPending > 20 ? (
        <Alert tone="warning">{outboxPending} emails are waiting to be sent. Check that the email worker is scheduled and configured.</Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles
          .filter(([, value]) => value !== null)
          .map(([label, value, href]) => (
            <Card key={label}>
              <p className="text-sm text-text-muted">{label}</p>
              <p className="text-3xl font-semibold">{value}</p>
              <Link href={href} className="text-sm text-brand underline">
                Open
              </Link>
            </Card>
          ))}
      </div>
      {pending ? <ButtonLink href="/admin/listings?status=pending_review" className="self-start">Review {pending} listing{pending === 1 ? "" : "s"}</ButtonLink> : null}
    </div>
  );
}
