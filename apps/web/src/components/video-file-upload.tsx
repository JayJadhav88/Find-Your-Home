"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";

// Short walkthrough videos uploaded straight from the phone or computer (up to 3, 50 MB each).
// Longer videos are better on YouTube: paste the link instead.

const MAX_BYTES = 50 * 1024 * 1024;
const TYPES: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };

export function VideoFileUpload({ listingId, files, editable = true }: { listingId: string; files: Array<{ id: string; storage_key: string }>; editable?: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [progress, setProgress] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = pending || progress;

  function upload(file: File | undefined) {
    if (!file) return;
    const ext = TYPES[file.type];
    if (!ext) return setMessage({ tone: "error", text: "Choose an MP4, WebM or MOV video." });
    if (file.size > MAX_BYTES) return setMessage({ tone: "error", text: "Keep the video under 50 MB, or upload it to YouTube and paste the link." });
    setMessage(null);
    setProgress(true);
    startTransition(async () => {
      const client = getBrowserClient();
      const key = `${listingId}/${crypto.randomUUID()}.${ext}`;
      const uploaded = await client.storage.from("listing-videos").upload(key, file, { contentType: file.type, upsert: false });
      if (uploaded.error) {
        setProgress(false);
        return setMessage({ tone: "error", text: "Upload failed. Check your connection and try again." });
      }
      const { error } = await client.from("listing_video_files").insert({ listing_id: listingId, storage_key: key, sort_order: files.length });
      setProgress(false);
      if (error) {
        await client.storage.from("listing-videos").remove([key]);
        return setMessage({ tone: "error", text: error.message });
      }
      setMessage({ tone: "ok", text: "Video added." });
      router.refresh();
    });
  }

  function remove(file: { id: string; storage_key: string }) {
    if (!window.confirm("Remove this video?")) return;
    startTransition(async () => {
      const client = getBrowserClient();
      const { error } = await client.from("listing_video_files").delete().eq("id", file.id);
      if (error) return setMessage({ tone: "error", text: error.message });
      await client.storage.from("listing-videos").remove([file.storage_key]);
      setMessage({ tone: "ok", text: "Video removed." });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {files.length ? (
        <ul className="grid gap-3 sm:grid-cols-3">
          {files.map((file) => (
            <li key={file.id} className="flex flex-col gap-1">
              <video
                src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/listing-videos/${file.storage_key}`}
                controls
                preload="metadata"
                className="aspect-video w-full rounded-lg bg-black"
              />
              {editable ? (
                <button type="button" onClick={() => remove(file)} disabled={busy} className="self-start text-sm text-danger underline">
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {editable && files.length < 3 ? (
        <label className="inline-flex min-h-11 w-fit cursor-pointer items-center rounded-lg border border-border bg-surface px-4 text-sm font-semibold hover:bg-surface-muted">
          {busy ? "Uploading… keep this page open" : "Upload a video file"}
          <input type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" disabled={busy} onChange={(event) => upload(event.target.files?.[0])} />
        </label>
      ) : null}
      <p className="text-xs text-text-muted">Up to 3 short videos (MP4, WebM or MOV, 50 MB each).</p>
      {message ? (
        <p role="status" className={`text-sm ${message.tone === "ok" ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
