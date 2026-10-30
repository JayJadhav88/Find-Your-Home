"use client";

import { useRef, useState } from "react";
import { EnquiryForm } from "./enquiry-form";
import { Button } from "./ui";

// "Enquire now" and "Schedule a site visit" open the enquiry form in a pop-up, like the big
// property portals, instead of a long form on the page.

export function EnquiryPopup({
  listingId,
  brandName,
  defaultName,
  defaultEmail,
}: {
  listingId: string;
  brandName: string;
  defaultName?: string;
  defaultEmail?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<"enquiry" | "visit_request" | null>(null);
  // A new form each time it opens, so a sent message doesn't stay on screen.
  const [round, setRound] = useState(0);

  function open(next: "enquiry" | "visit_request") {
    setKind(next);
    setRound((value) => value + 1);
    dialog.current?.showModal();
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="accent" onClick={() => open("enquiry")}>
        Enquire now
      </Button>
      <Button type="button" variant="secondary" onClick={() => open("visit_request")}>
        Schedule a site visit
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="enquiry-dialog-title"
        className="m-auto max-h-[92vh] w-[min(100%-2rem,32rem)] overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-text shadow-xl backdrop:bg-black/50"
        onClose={() => setKind(null)}
      >
        {kind ? (
          <div className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="enquiry-dialog-title" className="text-lg font-semibold">
                  {kind === "visit_request" ? "Schedule a site visit" : "Enquire about this property"}
                </h2>
                <p className="text-sm text-text-muted">The lister gets your message and replies to you directly.</p>
              </div>
              <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="rounded-lg px-2 text-xl text-text-muted hover:bg-surface-muted">
                ×
              </button>
            </div>
            <EnquiryForm
              key={round}
              listingId={listingId}
              brandName={brandName}
              defaultName={defaultName}
              defaultEmail={defaultEmail}
              initialKind={kind}
            />
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
