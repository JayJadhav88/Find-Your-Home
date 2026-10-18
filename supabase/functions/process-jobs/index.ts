// Processes job_queue: copies approved listing photos (metadata stripped) into the public
// bucket on publish, removes them on unpublish, imports spreadsheet image links, and copies
// enquiries to the owner's Google Sheet. Invoked by the scheduler.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { extensionFor, ImageRejectedError, sanitizeImage } from "../_shared/image-sanitize.ts";
import { loadIntegrationConfig } from "../_shared/integrations.ts";
import { postToSheet, sheetRow } from "../_shared/sheets.ts";
import { safeFetch } from "../_shared/safe-fetch.ts";
import { errorMessage, json, rejectUnlessWorker, serviceClient } from "../_shared/worker.ts";

const PRIVATE_BUCKET = "listing-uploads";
const PUBLIC_BUCKET = "listing-public";

interface Job {
  id: number;
  kind: "publish_listing_media" | "unpublish_listing_media" | "import_listing_images" | "sync_enquiry_sheet";
  listing_id: string;
  attempts: number;
  payload: { urls?: string[]; publish?: boolean; enquiry_id?: string };
}

const MAX_IMPORT_IMAGE_BYTES = 10 * 1024 * 1024;

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
        job.kind === "publish_listing_media"
          ? await publish(db, job.listing_id)
          : job.kind === "import_listing_images"
            ? await importImages(db, job)
            : job.kind === "sync_enquiry_sheet"
              ? await syncEnquirySheet(db, job)
              : await unpublish(db, job.listing_id);
      await finish(db, job.id, true);
      results.push({ id: job.id, kind: job.kind, ok: true, ...outcome });
    } catch (failure) {
      const message = errorMessage(failure);
      console.error(`[process-jobs] job ${job.id} (${job.kind}) failed: ${message}`);
      await finish(db, job.id, false, message);
      results.push({ id: job.id, kind: job.kind, ok: false, error: message });
    }
  }

  if (results.some((result) => result.ok && result.kind !== "sync_enquiry_sheet")) await refreshWebsiteCache();
  return json({ processed: results.length, results });
});

/** Asks the website to drop cached listing pages so new or removed photos show at once. */
async function refreshWebsiteCache() {
  const url = Deno.env.get("REVALIDATE_URL");
  const secret = Deno.env.get("REVALIDATE_SECRET");
  if (!url || !secret) return; // Optional: pages then refresh on their normal cache schedule.
  try {
    const response = await fetch(url, { method: "POST", headers: { "x-revalidate-secret": secret } });
    if (!response.ok) console.warn(`[process-jobs] website cache refresh returned HTTP ${response.status}`);
  } catch (failure) {
    console.warn(`[process-jobs] website cache refresh failed: ${errorMessage(failure)}`);
  }
}

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

/**
 * Downloads spreadsheet image links into the private bucket (checked and cleaned like any
 * upload), then publishes the listing or sends it to review. Links that fail are reported,
 * not retried: a broken link will not fix itself.
 */
async function importImages(db: SupabaseClient, job: Job) {
  const urls = (job.payload.urls ?? []).slice(0, 30);
  const allowHttp = Deno.env.get("ALLOW_HTTP_IMAGE_IMPORT") === "true";
  const allowedPrivateHosts = (Deno.env.get("IMPORT_ALLOWED_PRIVATE_HOSTS") ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  const { count: existing } = await db
    .from("listing_media")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", job.listing_id);
  let hasCover = Boolean(existing);
  const failed: Array<{ url: string; error: string }> = [];
  let imported = 0;

  for (const [index, url] of urls.entries()) {
    try {
      const download = await safeFetch(url, { maxBytes: MAX_IMPORT_IMAGE_BYTES, allowHttp, allowedPrivateHosts });
      const clean = sanitizeImage(download.bytes, null);
      const key = `${job.listing_id}/${crypto.randomUUID()}.${extensionFor(clean.type)}`;
      const { error: uploadError } = await db.storage
        .from(PRIVATE_BUCKET)
        .upload(key, clean.bytes, { contentType: clean.type, upsert: false });
      if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);
      const { error: insertError } = await db.from("listing_media").insert({
        listing_id: job.listing_id,
        upload_key: key,
        kind: "image",
        mime_type: clean.type,
        bytes: clean.bytes.length,
        is_cover: !hasCover,
        sort_order: index,
      });
      if (insertError) {
        await db.storage.from(PRIVATE_BUCKET).remove([key]);
        throw new Error(insertError.message);
      }
      hasCover = true;
      imported++;
    } catch (failure) {
      failed.push({ url: url.slice(0, 300), error: errorMessage(failure).slice(0, 200) });
    }
  }

  const { data: status, error } = await db.rpc("worker_finalize_import", {
    p_listing_id: job.listing_id,
    p_publish: job.payload.publish === true,
  });
  if (error) throw error;

  await db
    .from("job_queue")
    .update({ payload: { ...job.payload, result: { imported, failed, status } } })
    .eq("id", job.id);
  if (failed.length) console.warn(`[process-jobs] listing ${job.listing_id}: ${failed.length} image link(s) failed`);
  return { imported, failed: failed.length, status };
}

async function listPublicObjects(db: SupabaseClient, listingId: string): Promise<string[]> {
  const { data, error } = await db.storage.from(PUBLIC_BUCKET).list(listingId, { limit: 1000 });
  if (error) throw error;
  return (data ?? []).map((object) => `${listingId}/${object.name}`);
}

// ---------------------------------------------------------------------------
// Google Sheets
// ---------------------------------------------------------------------------
async function syncEnquirySheet(db: SupabaseClient, job: Job) {
  const config = await loadIntegrationConfig(db);
  const secret = config.secrets.sheets_webhook_secret;
  if (!config.sheets_enabled || !config.sheets_webhook_url || !secret) return { skipped: "Google Sheets is not connected" };
  const siteUrl = Deno.env.get("SITE_URL");
  if (!siteUrl) throw new Error("SITE_URL is not configured");

  const { data: enquiry, error } = await db
    .from("enquiries")
    .select(
      "id, created_at, status, kind, name, email, phone, message, requested_visit_at, requested_timezone, follow_up_at, " +
        "listing:listings(title, reference_code, category, city:locations!listings_city_id_fkey(name)), " +
        "owner:profiles!enquiries_team_assignee_fkey(display_name)",
    )
    .eq("id", job.payload.enquiry_id ?? "")
    .maybeSingle();
  if (error) throw new Error(`Could not load the enquiry: ${error.message}`);
  if (!enquiry) return { skipped: "Enquiry no longer exists" };

  type Loaded = {
    id: string; created_at: string; status: string; kind: string; name: string; email: string; phone: string | null;
    message: string; requested_visit_at: string | null; requested_timezone: string | null; follow_up_at: string | null;
    listing: { title: string; reference_code: string; category: string; city: { name: string } | null } | null;
    owner: { display_name: string } | null;
  };
  const row = enquiry as unknown as Loaded;
  const result = await postToSheet(
    config.sheets_webhook_url,
    secret,
    sheetRow(
      {
        ...row,
        listing_title: row.listing?.title ?? null,
        reference: row.listing?.reference_code ?? null,
        category: row.listing?.category ?? null,
        city: row.listing?.city?.name ?? null,
        team_owner: row.owner?.display_name ?? null,
      },
      siteUrl,
    ),
  );
  if (!result.ok) throw new Error(result.error);
  return { synced: row.id };
}
