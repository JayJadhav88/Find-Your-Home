"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";
import { TextInput } from "./ui";

/** An image address field with an "Upload" button (site-media bucket; content managers only). */
export function ImageUploadField({ name, id, defaultValue }: { name: string; id: string; defaultValue?: string }) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage("Use a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage("Keep images under 5 MB.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const client = getBrowserClient();
    const path = `banners/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
    const { error } = await client.storage.from("site-media").upload(path, file, { contentType: file.type, upsert: false });
    setBusy(false);
    if (error) {
      setMessage("Upload failed. You need the content manager role.");
      return;
    }
    setUrl(client.storage.from("site-media").getPublicUrl(path).data.publicUrl);
    setMessage("Uploaded. Save to use it.");
  }

  return (
    <div className="flex flex-col gap-2">
      <TextInput name={name} id={id} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-brand underline">
        {busy ? "Uploading…" : "Upload an image"}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => upload(event.target.files?.[0])} />
      </label>
      {message ? <p className="text-xs text-text-muted" role="status">{message}</p> : null}
    </div>
  );
}
