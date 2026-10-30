"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";

// Upload, replace or remove a property's PDF brochure. Visitors get it through the lead pop-up
// on the property page (Download brochure).

const MAX_BYTES = 10 * 1024 * 1024;

export function BrochureUpload({ listingId, current }: { listingId: string; current: string | null }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function upload(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf") return setMessage({ tone: "error", text: "Choose a PDF file." });
    if (file.size > MAX_BYTES) return setMessage({ tone: "error", text: "Keep the brochure under 10 MB." });
    setMessage(null);
    startTransition(async () => {
      const client = getBrowserClient();
      const key = `${listingId}/${crypto.randomUUID()}.pdf`;
      const uploaded = await client.storage.from("listing-brochures").upload(key, file, { contentType: "application/pdf", upsert: false });
      if (uploaded.error) return setMessage({ tone: "error", text: "Upload failed. Only the lister and our team can add a brochure." });
      const { error } = await client.rpc("set_listing_brochure", { p_listing_id: listingId, p_key: key });
      if (error) {
        await client.storage.from("listing-brochures").remove([key]);
        return setMessage({ tone: "error", text: error.message });
      }
      if (current) await client.storage.from("listing-brochures").remove([current]);
      setMessage({ tone: "ok", text: "Brochure saved. Visitors can download it after leaving their details." });
      router.refresh();
    });
  }

  function remove() {
    if (!current || !window.confirm("Remove the brochure?")) return;
    startTransition(async () => {
      const client = getBrowserClient();
      const { error } = await client.rpc("set_listing_brochure", { p_listing_id: listingId, p_key: null as unknown as string });
      if (error) return setMessage({ tone: "error", text: error.message });
      await client.storage.from("listing-brochures").remove([current]);
      setMessage({ tone: "ok", text: "Brochure removed." });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-semibold">Brochure (PDF)</h3>
      <p className="text-sm text-text-muted">
        {current
          ? "A brochure is attached. Visitors download it from the property page after leaving their name and phone number."
          : "Add a PDF brochure (up to 10 MB). Visitors download it after leaving their name and phone number, which gives you a lead."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-border bg-surface px-4 text-sm font-semibold hover:bg-surface-muted">
          {pending ? "Saving…" : current ? "Replace brochure" : "Upload brochure"}
          <input type="file" accept="application/pdf" className="sr-only" disabled={pending} onChange={(event) => upload(event.target.files?.[0])} />
        </label>
        {current ? (
          <>
            <a
              href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/listing-brochures/${current}`}
              target="_blank"
              rel="noopener"
              className="text-sm text-brand underline"
            >
              Open
            </a>
            <button type="button" onClick={remove} disabled={pending} className="text-sm text-danger underline">
              Remove
            </button>
          </>
        ) : null}
      </div>
      {message ? (
        <p role="status" className={`text-sm ${message.tone === "ok" ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
