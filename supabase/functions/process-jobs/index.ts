// Processes job_queue: copies approved listing photos (metadata stripped) into the public
// bucket on publish, and removes them on unpublish. Invoked by the scheduler.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { extensionFor, ImageRejectedError, sanitizeImage } from "../_shared/image-sanitize.ts";
import { errorMessage, json, rejectUnlessWorker, serviceClient } from "../_shared/worker.ts";

const PRIVATE_BUCKET = "listing-uploads";
const PUBLIC_BUCKET = "listing-public";

interface Job {
  id: number;
  kind: "publish_listing_media" | "unpublish_listing_media";
  listing_id: string;
  attempts: number;
}

Deno.serve(async (request) => {
  const denied = rejectUnlessWorker(request);
  if (denied) return denied;

  const db = serviceClient();
  const { data: jobs, error } = await db.rpc("worker_claim_jobs", { p_limit: 10 });
  if (error) return json({ error: errorMessage(error) }, 500);

  const results = [];
  for (const job of (jobs ?? []) as Job[]) {
    try {
      const outcome =
        job.kind === "publish_listing_media" ? await publish(db, job.listing_id) : await unpublish(db, job.listing_id);
      await finish(db, job.id, true);
      results.push({ id: job.id, kind: job.kind, ok: true, ...outcome });
    } catch (failure) {
      const message = errorMessage(failure);
      console.error(`[process-jobs] job ${job.id} (${job.kind}) failed: ${message}`);
      await finish(db, job.id, false, message);
      results.push({ id: job.id, kind: job.kind, ok: false, error: message });
    }
  }

  return json({ processed: results.length, results });
});

async function finish(db: SupabaseClient, id: number, ok: boolean, error?: string) {
  const { error: finishError } = await db.rpc("worker_finish_job", { p_id: id, p_ok: ok, p_error: error ?? null });
  if (finishError) console.error(`[process-jobs] could not record result of job ${id}: ${finishError.message}`);
}

async function listingStatus(db: SupabaseClient, listingId: string): Promise<string | null> {
  const { data, error } = await db.from("listings").select("status").eq("id", listingId).maybeSingle();
  if (error) throw error;
  return data?.status ?? null;
}

async function publish(db: SupabaseClient, listingId: string) {
  // The listing may have been unpublished again before this job ran.
  if ((await listingStatus(db, listingId)) !== "published") return { skipped: "listing is not published" };

  const { data: media, error } = await db
    .from("listing_media")
    .select("id, upload_key, public_key, mime_type")
    .eq("listing_id", listingId)
    .eq("kind", "image")
    .order("sort_order");
  if (error) throw error;

  let copied = 0;
  const rejected: string[] = [];

  for (const item of media ?? []) {
    if (item.public_key) continue;

    const { data: file, error: downloadError } = await db.storage.from(PRIVATE_BUCKET).download(item.upload_key);
    if (downloadError || !file) throw new Error(`Download failed for ${item.id}: ${downloadError?.message}`);

    let clean;
    try {
      clean = sanitizeImage(new Uint8Array(await file.arrayBuffer()), item.mime_type);
    } catch (failure) {
      if (failure instanceof ImageRejectedError) {
        // Retrying will not fix a bad file; leave it unpublished and report it.
        rejected.push(`${item.id}: ${failure.message}`);
        continue;
      }
      throw failure;
    }

    const publicKey = `${listingId}/${crypto.randomUUID()}.${extensionFor(clean.type)}`;
    const { error: uploadError } = await db.storage
      .from(PUBLIC_BUCKET)
      .upload(publicKey, clean.bytes, { contentType: clean.type, cacheControl: "31536000", upsert: false });
    if (uploadError) throw new Error(`Upload failed for ${item.id}: ${uploadError.message}`);

    const { error: updateError } = await db.from("listing_media").update({ public_key: publicKey }).eq("id", item.id);
    if (updateError) {
      await db.storage.from(PUBLIC_BUCKET).remove([publicKey]);
      throw updateError;
    }
    copied++;
  }

  // Remove public copies of photos that were deleted from the listing.
  const { data: current } = await db.from("listing_media").select("public_key").eq("listing_id", listingId);
  const keep = new Set((current ?? []).map((row) => row.public_key).filter(Boolean));
  const stale = (await listPublicObjects(db, listingId)).filter((key) => !keep.has(key));
  if (stale.length) await db.storage.from(PUBLIC_BUCKET).remove(stale);

  if (rejected.length) console.warn(`[process-jobs] listing ${listingId}: rejected images: ${rejected.join("; ")}`);
  return { copied, removed: stale.length, rejected };
}

async function unpublish(db: SupabaseClient, listingId: string) {
  // Re-approved since the job was queued: keep the public photos.
  if ((await listingStatus(db, listingId)) === "published") return { skipped: "listing is published again" };

  const keys = await listPublicObjects(db, listingId);
  if (keys.length) {
    const { error } = await db.storage.from(PUBLIC_BUCKET).remove(keys);
    if (error) throw error;
  }
  const { error } = await db.from("listing_media").update({ public_key: null }).eq("listing_id", listingId);
  if (error) throw error;
  return { removed: keys.length };
}

async function listPublicObjects(db: SupabaseClient, listingId: string): Promise<string[]> {
  const { data, error } = await db.storage.from(PUBLIC_BUCKET).list(listingId, { limit: 1000 });
  if (error) throw error;
  return (data ?? []).map((object) => `${listingId}/${object.name}`);
}
