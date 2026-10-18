import { ENQUIRY_STATUS_LABEL, ENQUIRY_STATUSES, formatDateTime, utcToZonedLocal } from "@fyh/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { addEnquiryNote, updateEnquiryAsTeam } from "@/app/actions/admin-enquiries";
import { ActionForm } from "@/components/action-form";
import { Loading } from "@/components/loading";
import { Badge, Card, Field, PageHeader, Select, TextArea, TextInput } from "@/components/ui";
import { requireEnquiryTeam } from "@/lib/auth";
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

async function AdminEnquiry({ id }: { id: string }) {
  await requireEnquiryTeam(`/admin/enquiries/${id}`);
  const supabase = await createUserClient();
  const [settings, { data: enquiry }, { data: notes }, { data: team }] = await Promise.all([
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
    supabase.rpc("enquiry_team"),
  ]);
  if (!enquiry) notFound();
  const fmt = { locale: settings.default_locale, timeZone: settings.default_timezone };
  const listing = enquiry.listing;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${enquiry.kind === "visit_request" ? "Visit request" : "Enquiry"} from ${enquiry.name}`}
        description={`Received ${formatDateTime(enquiry.created_at, fmt)}`}
        actions={<Link href="/admin/enquiries" className="text-sm text-brand underline">All enquiries</Link>}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={enquiry.status === "new" ? "pending_review" : "published"}>{ENQUIRY_STATUS_LABEL[enquiry.status]}</Badge>
              {enquiry.kind === "visit_request" ? <Badge>{`visit ${enquiry.visit_status}`}</Badge> : null}
            </div>
            <p className="whitespace-pre-wrap">{enquiry.message}</p>
            {enquiry.requested_visit_at ? (
              <p className="text-sm">
                Wants to visit: <strong>{formatDateTime(enquiry.requested_visit_at, { locale: settings.default_locale, timeZone: enquiry.requested_timezone ?? settings.default_timezone })}</strong>{" "}
                ({enquiry.requested_timezone})
              </p>
            ) : null}
            <p className="text-sm text-text-muted">
              Property:{" "}
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
              ) : (
                "removed"
              )}
              {enquiry.lister ? ` · lister: ${enquiry.lister.display_name}` : " · no lister receives this, the team handles it"}
            </p>
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Contact</h2>
            <p className="text-sm">
              {enquiry.name} · {enquiry.email}
              {enquiry.phone ? ` · ${enquiry.phone}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <a className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-muted" href={`mailto:${enquiry.email}?subject=${encodeURIComponent(`About ${listing?.title ?? "your enquiry"}`)}`}>
                Email
              </a>
              {enquiry.phone ? (
                <>
                  <a className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-muted" href={`tel:${enquiry.phone}`}>Call</a>
                  <a className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-muted" href={`https://wa.me/${digits(enquiry.phone)}`} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </a>
                </>
              ) : null}
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Internal notes</h2>
            <p className="text-sm text-text-muted">Only the team sees these, never the lister or the visitor.</p>
            {notes?.length ? (
              <ul className="flex flex-col gap-2">
                {notes.map((note) => (
                  <li key={note.id} className="rounded-lg bg-surface-muted p-3 text-sm">
                    <p className="whitespace-pre-wrap">{note.body}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {note.author?.display_name ?? "Former team member"} · {formatDateTime(note.created_at, fmt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
            <ActionForm action={addEnquiryNote} submitLabel="Add note" variant="secondary">
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
            <Field label="Team owner" name="assignee">
              <Select name="assignee" defaultValue={enquiry.team_assignee ?? ""}>
                <option value="">Not assigned</option>
                {(team ?? []).map((member) => (
                  <option key={member.id} value={member.id}>{member.display_name}</option>
                ))}
              </Select>
            </Field>
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
