import { formatDateTime } from "@fyh/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EnquiryActions } from "@/components/account-forms";
import { Loading } from "@/components/loading";
import { Card, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { listingPath } from "@/lib/listing-format";
import { getSiteSettings } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

export default function EnquiryPage({ params }: PageProps<"/account/enquiries/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      {params.then(({ id }) => (
        <Enquiry id={id} />
      ))}
    </Suspense>
  );
}

async function Enquiry({ id }: { id: string }) {
  const viewer = await requireViewer(`/account/enquiries/${id}`);
  const supabase = await createUserClient();
  const settings = await getSiteSettings();
  const { data: enquiry } = await supabase
    .from("enquiries")
    .select("*, listing:listings(title, reference_code, slug, status)")
    .eq("id", id)
    .maybeSingle();
  // RLS hides enquiries the viewer may not see; treat both cases the same.
  if (!enquiry) notFound();

  const isRecipient = enquiry.sender_user_id !== viewer.id || enquiry.assigned_to === viewer.id;
  const isSender = enquiry.sender_user_id === viewer.id;
  const fmt = { locale: settings.default_locale, timeZone: settings.default_timezone };

  const recipientActions: Array<{ action: string; label: string; variant?: "primary" | "secondary" | "danger" }> = [];
  if (isRecipient) {
    if (enquiry.kind === "visit_request" && enquiry.visit_status === "requested") {
      recipientActions.push({ action: "confirm_visit", label: "Confirm visit", variant: "primary" });
      recipientActions.push({ action: "decline_visit", label: "Decline visit" });
    }
    if (enquiry.status !== "responded") recipientActions.push({ action: "responded", label: "Mark as replied" });
    if (enquiry.status !== "closed") recipientActions.push({ action: "closed", label: "Close" });
    if (enquiry.status !== "spam") recipientActions.push({ action: "spam", label: "Mark as spam", variant: "danger" });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={enquiry.kind === "visit_request" ? "Visit request" : "Enquiry"}
        description={`Received ${formatDateTime(enquiry.created_at, fmt)}`}
      />
      <Card className="flex flex-col gap-3">
        {enquiry.listing ? (
          <p>
            About{" "}
            {enquiry.listing.status === "published" ? (
              <Link className="text-brand underline" href={listingPath(enquiry.listing)}>
                {enquiry.listing.title}
              </Link>
            ) : (
              <span className="font-medium">{enquiry.listing.title}</span>
            )}{" "}
            ({enquiry.listing.reference_code})
          </p>
        ) : null}
        {isRecipient ? (
          <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
            <dt className="text-text-muted">From</dt>
            <dd>{enquiry.name}</dd>
            <dt className="text-text-muted">Email</dt>
            <dd>
              <a className="text-brand underline" href={`mailto:${enquiry.email}`}>
                {enquiry.email}
              </a>
            </dd>
            {enquiry.phone ? (
              <>
                <dt className="text-text-muted">Phone</dt>
                <dd>
                  <a className="text-brand underline" href={`tel:${enquiry.phone}`}>
                    {enquiry.phone}
                  </a>
                </dd>
              </>
            ) : null}
          </dl>
        ) : null}
        {enquiry.kind === "visit_request" && enquiry.requested_visit_at ? (
          <p className="rounded-lg bg-surface-muted p-3 text-sm">
            Requested time:{" "}
            <strong>
              {formatDateTime(enquiry.requested_visit_at, { locale: settings.default_locale, timeZone: enquiry.requested_timezone ?? "UTC" })}
            </strong>{" "}
            ({enquiry.requested_timezone}) — status: <strong>{enquiry.visit_status}</strong>
          </p>
        ) : null}
        <div>
          <h2 className="text-sm font-semibold text-text-muted">Message</h2>
          <p className="mt-1 whitespace-pre-line">{enquiry.message}</p>
        </div>
      </Card>
      {recipientActions.length ? <EnquiryActions enquiryId={enquiry.id} actions={recipientActions} /> : null}
      {isSender && enquiry.kind === "visit_request" && ["requested", "confirmed"].includes(enquiry.visit_status ?? "") ? (
        <EnquiryActions enquiryId={enquiry.id} actions={[{ action: "cancel_visit", label: "Cancel my visit request", variant: "danger" }]} />
      ) : null}
      <Link href="/account/enquiries" className="text-sm text-brand underline">
        Back to enquiries
      </Link>
    </div>
  );
}
