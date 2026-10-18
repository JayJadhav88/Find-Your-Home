"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { mediaChanged } from "@/app/actions/listings";
import { getBrowserClient } from "@/lib/supabase-browser";
import { Alert, Button } from "./ui";

// Uploads go straight from the browser to the private "listing-uploads" bucket under a
// random name; storage policies only allow the listing's owner while it is editable. The
// database records type and size from the stored object, not from this component.

export interface MediaItem {
  id: string;
  upload_key: string;
  alt_text: string | null;
  is_cover: boolean;
  sort_order: number;
}

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function PhotoManager({
  listingId,
  initial,
  editable,
  isLive,
  maxImages,
  maxBytes,
  allowedTypes,
}: {
  listingId: string;
  initial: MediaItem[];
  editable: boolean;
  isLive: boolean;
  maxImages: number;
  maxBytes: number;
  allowedTypes: string[];
}) {
  const supabase = getBrowserClient();
  const [items, setItems] = useState(() => [...initial].sort((a, b) => a.sort_order - b.sort_order));
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "danger" | "success" | "warning"; text: string } | null>(null);
  const [busy, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const missing = items.filter((item) => !previews[item.id]);
    if (!missing.length) return;
    supabase.storage
      .from("listing-uploads")
      .createSignedUrls(missing.map((item) => item.upload_key), 600)
      .then(({ data }) => {
        if (!data) return;
        setPreviews((current) => {
          const next = { ...current };
          missing.forEach((item, index) => {
            const url = data[index]?.signedUrl;
            if (url) next[item.id] = url;
          });
          return next;
        });
      });
  }, [items, previews, supabase]);

  function done(text: string) {
    setMessage({ tone: "success", text: isLive ? `${text} Photo changes send a live listing back to review.` : text });
    void mediaChanged(listingId);
  }

  function upload(files: FileList | null) {
    if (!files?.length) return;
    setMessage(null);
    startTransition(async () => {
      let next = [...items];
      for (const file of Array.from(files)) {
        if (next.length >= maxImages) {
          setMessage({ tone: "warning", text: `You can add up to ${maxImages} photos.` });
          break;
        }
        if (!allowedTypes.includes(file.type) || !EXTENSIONS[file.type]) {
          setMessage({
            tone: "danger",
            text: `${file.name}: use JPEG, PNG or WebP. (iPhone HEIC photos: export as JPEG first, or use our mobile app.)`,
          });
          continue;
        }
        if (file.size > maxBytes) {
          setMessage({ tone: "danger", text: `${file.name} is larger than ${Math.round(maxBytes / 1048576)} MB.` });
          continue;
        }
        const key = `${listingId}/${crypto.randomUUID()}.${EXTENSIONS[file.type]}`;
        const uploaded = await supabase.storage.from("listing-uploads").upload(key, file, { contentType: file.type, upsert: false });
        if (uploaded.error) {
          setMessage({ tone: "danger", text: `${file.name} could not be uploaded. Please try again.` });
          continue;
        }
        const { data, error } = await supabase
          .from("listing_media")
          .insert({
            listing_id: listingId,
            upload_key: key,
            kind: "image",
            is_cover: !next.some((item) => item.is_cover),
            sort_order: next.length ? Math.max(...next.map((item) => item.sort_order)) + 1 : 0,
            alt_text: null,
          })
          .select("id, upload_key, alt_text, is_cover, sort_order")
          .single();
        if (error || !data) {
          await supabase.storage.from("listing-uploads").remove([key]);
          setMessage({ tone: "danger", text: error?.message ?? `${file.name} could not be saved.` });
          continue;
        }
        next = [...next, data];
        setItems(next);
      }
      if (fileInput.current) fileInput.current.value = "";
      if (next.length !== items.length) done("Photos uploaded.");
    });
  }

  function remove(item: MediaItem) {
    startTransition(async () => {
      const { error } = await supabase.from("listing_media").delete().eq("id", item.id);
      if (error) {
        setMessage({ tone: "danger", text: "That photo could not be removed." });
        return;
      }
      await supabase.storage.from("listing-uploads").remove([item.upload_key]);
      let next = items.filter((other) => other.id !== item.id);
      if (item.is_cover && next[0]) {
        await supabase.from("listing_media").update({ is_cover: true }).eq("id", next[0].id);
        next = next.map((other, index) => ({ ...other, is_cover: index === 0 }));
      }
      setItems(next);
      done("Photo removed.");
    });
  }

  function makeCover(item: MediaItem) {
    startTransition(async () => {
      const current = items.find((other) => other.is_cover);
      if (current) await supabase.from("listing_media").update({ is_cover: false }).eq("id", current.id);
      const { error } = await supabase.from("listing_media").update({ is_cover: true }).eq("id", item.id);
      if (error) {
        setMessage({ tone: "danger", text: "Could not change the cover photo." });
        return;
      }
      setItems(items.map((other) => ({ ...other, is_cover: other.id === item.id })));
      setMessage({ tone: "success", text: "Cover photo updated." });
      void mediaChanged(listingId);
    });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    const a = items[index];
    const b = items[target];
    if (!a || !b) return;
    startTransition(async () => {
      await Promise.all([
        supabase.from("listing_media").update({ sort_order: b.sort_order }).eq("id", a.id),
        supabase.from("listing_media").update({ sort_order: a.sort_order }).eq("id", b.id),
      ]);
      const next = [...items];
      next[index] = { ...b, sort_order: a.sort_order };
      next[target] = { ...a, sort_order: b.sort_order };
      setItems(next);
      void mediaChanged(listingId);
    });
  }

  function saveAlt(item: MediaItem, altText: string) {
    if ((item.alt_text ?? "") === altText) return;
    startTransition(async () => {
      const { error } = await supabase.from("listing_media").update({ alt_text: altText || null }).eq("id", item.id);
      if (!error) {
        setItems(items.map((other) => (other.id === item.id ? { ...other, alt_text: altText || null } : other)));
        setMessage({ tone: "success", text: "Description saved." });
        void mediaChanged(listingId);
      }
    });
  }

  return (
    <section aria-labelledby="photos-heading" className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="photos-heading" className="text-lg font-semibold">
          Photos ({items.length}/{maxImages})
        </h2>
        {editable ? (
          <>
            <input
              ref={fileInput}
              id="photo-upload"
              type="file"
              accept={allowedTypes.join(",")}
              multiple
              className="sr-only"
              onChange={(event) => upload(event.target.files)}
            />
            <label
              htmlFor="photo-upload"
              className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong has-[:focus-visible]:outline"
            >
              {busy ? "Working…" : "Add photos"}
            </label>
          </>
        ) : null}
      </div>
      <div aria-live="polite">{message ? <Alert tone={message.tone}>{message.text}</Alert> : null}</div>
      {!editable ? <p className="text-sm text-text-muted">Photos can't be changed while the listing is awaiting review or closed.</p> : null}
      {items.length === 0 ? (
        <p className="text-sm text-text-muted">Add at least one photo. The first one becomes the cover.</p>
      ) : (
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <li key={item.id} className="flex flex-col gap-2 rounded-lg border border-border p-2">
              <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-surface-muted">
                {previews[item.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL preview
                  <img src={previews[item.id]} alt={item.alt_text ?? ""} className="size-full object-cover" />
                ) : null}
                {item.is_cover ? (
                  <span className="absolute left-2 top-2 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white">Cover</span>
                ) : null}
              </div>
              <label className="text-xs font-medium" htmlFor={`alt-${item.id}`}>
                Describe this photo (for screen readers)
              </label>
              <input
                id={`alt-${item.id}`}
                defaultValue={item.alt_text ?? ""}
                maxLength={250}
                disabled={!editable}
                onBlur={(event) => saveAlt(item, event.target.value.trim())}
                className="min-h-10 rounded-md border border-border px-2 text-sm"
                placeholder="e.g. Living room with large windows"
              />
              {editable ? (
                <div className="flex flex-wrap gap-1">
                  <Button type="button" variant="ghost" className="min-h-9 px-2" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={`Move photo ${index + 1} earlier`}>
                    ↑
                  </Button>
                  <Button type="button" variant="ghost" className="min-h-9 px-2" disabled={busy || index === items.length - 1} onClick={() => move(index, 1)} aria-label={`Move photo ${index + 1} later`}>
                    ↓
                  </Button>
                  {!item.is_cover ? (
                    <Button type="button" variant="ghost" className="min-h-9 px-2" disabled={busy} onClick={() => makeCover(item)}>
                      Make cover
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-9 px-2 text-danger"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Remove this photo?")) remove(item);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
