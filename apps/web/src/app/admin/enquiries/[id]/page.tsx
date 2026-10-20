import {
  CALL_OUTCOME_LABEL,
  CALL_OUTCOMES,
  ENQUIRY_STATUS_LABEL,
  ENQUIRY_STATUSES,
  formatDateTime,
  LEAD_INTEREST_LABEL,
  LEAD_SOURCE_LABEL,
  LOST_REASONS,
  utcToZonedLocal,
  type CallOutcome,
  type EnquiryStatus,
  type LeadInterest,
  type LeadSource,
} from "@fyh/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { addEnquiryNote, logContactAttempt, updateEnquiryAsTeam } from "@/app/actions/admin-enquiries";
import { ActionForm } from "@/components/action-form";
import { Loading } from "@/components/loading";
import { Alert, Badge, Card, Field, PageHeader, Select, TextArea, TextInput } from "@/components/ui";
import { canManageEnquiries, requireEnquiryTeam } from "@/lib/auth";
import { listingPath } from "@/lib/listing-format";
import { getSiteSettings } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

export default function AdminEnquiryPage({ params }: PageProps<"/admin/enquiries/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      {params.then(({ id }) => (
        <AdminEnquiry id={id} />
      ))}
    </Suspense>
  );
}

const digits = (phone: string) => phone.replace(/[^\d]/g, "");
const button = "rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-muted";

type HistoryItem = { at: string; who: string | null; text: string };

async function AdminEnquiry({ id }: { id: string }) {
  const viewer = await requireEnquiryTeam(`/admin/enquiries/${id}`);
  const supabase = await createUserClient();
  const manager = canManageEnquiries(viewer);
  const [settings, { data: enquiry }, { data: notes }, { data: events }, { data: team }, { data: duplicates }] = await Promise.all([
    getSiteSettings(),
    supabase
      .from("enquiries")
      .select("*, listing:listings(id, title, reference_code, slug, status), lister:profiles!enquiries_assigned_to_fkey(display_name)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("enquiry_notes")
      .select("id, body, created_at, author:profiles!enquiry_notes_author_id_fkey(display_name)")
      .eq("enquiry_id", id)
      .order("created_at"),
    supabase
      .from("enquiry_events")
      .select("id, kind, from_value, to_value, note, created_at, actor:profiles!enquiry_events_actor_id_fkey(display_name)")
      .eq("enquiry_id", id)
      .order("created_at"),
    manager ? supabase.rpc("enquiry_team") : Promise.resolve({ data: [] as Array<{ id: string; display_name: string }> }),
    supabase.rpc("admin_enquiry_duplicates", { p_enquiry_id: id }),
  ]);
  if (!enquiry) notFound();
  const fmt = { locale: settings.default_locale, timeZone: settings.default_timezone };
  const listing = enquiry.listing;
  const nameOf = (userId: string | null) => (team ?? []).find((member) => member.id === userId)?.display_name ?? "a team member";
  const utm = (enquiry.utm ?? {}) as Record<string, string>;

  const history: HistoryItem[] = [
    ...(events ?? []).map((event): HistoryItem => {
      const who = event.actor?.display_name ?? null;
      switch (event.kind) {
        case "created":
          return { at: event.created_at, who, text: `Lead received (${LEAD_SOURCE_LABEL[event.note as LeadSource] ?? event.note ?? "unknown source"})` };
        case "status":
          return {
            at: event.created_at,
            who,
            text: `Status: ${ENQUIRY_STATUS_LABEL[event.from_value as EnquiryStatus] ?? event.from_value} → ${ENQUIRY_STATUS_LABEL[event.to_value as EnquiryStatus] ?? event.to_value}${event.note ? ` (${event.note})` : ""}`,
          };
        case "assigned":
          return { at: event.created_at, who, text: event.to_value ? `Assigned to ${nameOf(event.to_value)}` : "Unassigned" };
        case "follow_up":
          return { at: event.created_at, who, text: event.to_value ? `Follow-up set for ${formatDateTime(event.to_value, fmt)}` : "Follow-up removed" };
        default:
          return {
            at: event.created_at,
            who,
            text: `Call: ${CALL_OUTCOME_LABEL[event.to_value as CallOutcome] ?? event.to_value}${event.note ? `: ${event.note}` : ""}`,
          };
      }
    }),
    ...(notes ?? []).map((note): HistoryItem => ({ at: note.created_at, who: note.author?.display_name ?? null, text: `Note: ${note.body}` })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const title =
    enquiry.lead_type === "owner"
      ? `Owner lead from ${enquiry.name}`
      : `${enquiry.kind === "visit_request" ? "Visit request" : "Enquiry"} from ${enquiry.name}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={`Received ${formatDateTime(enquiry.created_at, fmt)}${
          enquiry.first_response_at ? ` · first reply ${formatDateTime(enquiry.first_response_at, fmt)}` : " · not replied yet"
        }`}
        actions={<Link href="/admin/enquiries" className="text-sm text-brand underline">All leads</Link>}
      />

      {duplicates?.length ? (
        <Alert tone="warning" title="Possible duplicate">
          The same email or phone number sent {duplicates.length} other lead(s) in the last 90 days:{" "}
          {duplicates.map((other, index) => (
            <span key={other.id}>
              {index ? ", " : ""}
              <Link className="underline" href={`/admin/enquiries/${other.id}`}>
                {other.listing_title ?? "no listing"} ({formatDateTime(other.created_at, fmt)}, {ENQUIRY_STATUS_LABEL[other.status]})
              </Link>
            </span>
          ))}
          . Don&rsquo;t delete either; link them in a note if they&rsquo;re the same person.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={enquiry.status === "new" ? "pending_review" : "published"}>{ENQUIRY_STATUS_LABEL[enquiry.status]}</Badge>
              <Badge>{enquiry.lead_type === "owner" ? "Owner lead" : "Buyer / renter"}</Badge>
              {enquiry.interest ? <Badge>{LEAD_INTEREST_LABEL[enquiry.interest as LeadInterest]}</Badge> : null}
              <Badge>{LEAD_SOURCE_LABEL[enquiry.source as LeadSource] ?? enquiry.source}</Badge>
              {enquiry.kind === "visit_request" ? <Badge>{`visit ${enquiry.visit_status}`}</Badge> : null}
            </div>
            <p className="whitespace-pre-wrap">{enquiry.message}</p>
            {enquiry.requested_visit_at ? (
              <p className="text-sm">
                Wants to visit:{" "}
                <strong>
                  {formatDateTime(enquiry.requested_visit_at, { locale: settings.default_locale, timeZone: enquiry.requested_timezone ?? settings.default_timezone })}
                </strong>{" "}
                ({enquiry.requested_timezone})
              </p>
            ) : null}
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-text-muted">Property</dt>
              <dd>
                {listing ? (
                  <>
                    <Link className="underline" href={`/admin/listings/${listing.id}`}>{listing.title}</Link> ({listing.reference_code})
                    {listing.status === "published" ? (
                      <>
                        {" · "}
                        <Link className="underline" href={listingPath(listing)}>public page</Link>
                      </>
                    ) : null}
                  </>
                ) : enquiry.property_reference ? (
                  `Reference given: ${enquiry.property_reference}`
                ) : (
                  "Not about a specific listing"
                )}
              </dd>
              {enquiry.city ? (
                <>
                  <dt className="text-text-muted">City / locality</dt>
                  <dd>{enquiry.city}</dd>
                </>
              ) : null}
              {enquiry.preferred_contact ? (
                <>
                  <dt className="text-text-muted">Prefers</dt>
                  <dd>{enquiry.preferred_contact === "whatsapp" ? "WhatsApp" : enquiry.preferred_contact === "phone" ? "Phone call" : "Email"}</dd>
                </>
              ) : null}
              {Object.keys(utm).length ? (
                <>
                  <dt className="text-text-muted">Campaign</dt>
                  <dd>{Object.entries(utm).map(([key, value]) => `${key.replace("utm_", "")}: ${value}`).join(" · ")}</dd>
                </>
              ) : null}
              {enquiry.listing_id ? (
                <>
                  <dt className="text-text-muted">Lister</dt>
                  <dd>{enquiry.lister ? enquiry.lister.display_name : "None: the team handles it"}</dd>
                </>
              ) : null}
            </dl>
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Contact</h2>
            <p className="text-sm">
              {enquiry.name}
              {enquiry.email ? ` · ${enquiry.email}` : ""}
              {enquiry.phone ? ` · ${enquiry.phone}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {enquiry.email ? (
                <a className={button} href={`mailto:${enquiry.email}?subject=${encodeURIComponent(`About ${listing?.title ?? "your enquiry"}`)}`}>
                  Email
                </a>
              ) : null}
              {enquiry.phone ? (
                <>
                  <a className={button} href={`tel:${enquiry.phone.replace(/[^\d+]/g, "")}`}>Call</a>
                  <a className={button} href={`https://wa.me/${digits(enquiry.phone)}`} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </a>
                </>
              ) : null}
            </div>
            <ActionForm action={logContactAttempt} submitLabel="Log call" variant="secondary" inline resetOnSuccess>
              <input type="hidden" name="id" value={enquiry.id} />
              <label className="flex flex-col gap-1 text-sm font-medium">
                What happened
                <Select bare name="outcome" defaultValue="contacted">
                  {CALL_OUTCOMES.map((value) => (
                    <option key={value} value={value}>{CALL_OUTCOME_LABEL[value]}</option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Note (optional)
                <TextInput bare name="note" maxLength={500} />
              </label>
            </ActionForm>
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">History and notes</h2>
            <p className="text-sm text-text-muted">Only the team sees these, never the lister or the visitor.</p>
            {history.length ? (
              <ol className="flex flex-col gap-2">
                {history.map((item, index) => (
                  <li key={`${item.at}-${index}`} className="rounded-lg bg-surface-muted p-3 text-sm">
                    <p className="whitespace-pre-wrap">{item.text}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {item.who ?? "System"} · {formatDateTime(item.at, fmt)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : null}
            <ActionForm action={addEnquiryNote} submitLabel="Add note" variant="secondary" resetOnSuccess>
              <input type="hidden" name="id" value={enquiry.id} />
              <Field label="New note" name="body">
                <TextArea name="body" rows={3} maxLength={2000} />
              </Field>
            </ActionForm>
          </Card>
        </div>

        <Card className="h-fit">
          <ActionForm action={updateEnquiryAsTeam} submitLabel="Save">
            <input type="hidden" name="id" value={enquiry.id} />
            <Field label="Status" name="status">
              <Select name="status" defaultValue={enquiry.status}>
                {ENQUIRY_STATUSES.map((value) => (
                  <option key={value} value={value}>{ENQUIRY_STATUS_LABEL[value]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Reason (for Lost or Unqualified)" name="lostReason">
              <Select name="lostReason" defaultValue={enquiry.lost_reason ?? ""}>
                <option value="">—</option>
                {LOST_REASONS.map((reason) => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </Select>
            </Field>
            {manager ? (
              <Field label="Team owner" name="assignee">
                <Select name="assignee" defaultValue={enquiry.team_assignee ?? ""}>
                  <option value="">Not assigned</option>
                  {(team ?? []).map((member) => (
                    <option key={member.id} value={member.id}>{member.display_name}</option>
                  ))}
                </Select>
              </Field>
            ) : (
              <input type="hidden" name="assignee" value={enquiry.team_assignee ?? ""} />
            )}
            <Field label="Follow up on" name="followUp" hint={`In ${settings.default_timezone}. Leave empty for none.`}>
              <TextInput
                name="followUp"
                type="datetime-local"
                defaultValue={enquiry.follow_up_at ? utcToZonedLocal(enquiry.follow_up_at, settings.default_timezone) : ""}
              />
            </Field>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
