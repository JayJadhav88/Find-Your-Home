"use server";

import { ENQUIRY_STATUSES, LISTING_STATUSES, type EnquiryStatus } from "@fyh/shared";
import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { canManageContent, canSeeLeads, getViewer, isAdmin, isStaff } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";
import { friendlyDbError, type FormState } from "./types";

// Bulk actions for admin lists. Each runs the same database function as the single-item
// button, once per selected item, so permissions, rules and the audit log are unchanged.
// The result says how many worked and groups the ones that were skipped by reason.

const MAX_ITEMS = 500;
const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };

type Client = Awaited<ReturnType<typeof createUserClient>>;
type DbError = { code?: string; message?: string; details?: string | null } | null;

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

function selectedIds(formData: FormData): string[] {
  return [...new Set(formData.getAll("ids").filter((value): value is string => typeof value === "string" && value.length <= 64))];
}

/** "Approved 30 listings." plus "Skipped 16: <reason> (A, B, …)" lines. */
function summary(doneLabel: string, noun: [string, string], ok: number, failures: Array<{ label: string; error: string }>): FormState {
  const lines = [`${doneLabel} ${ok} ${ok === 1 ? noun[0] : noun[1]}.`];
  const byReason = new Map<string, string[]>();
  for (const failure of failures) byReason.set(failure.error, [...(byReason.get(failure.error) ?? []), failure.label]);
  for (const [reason, labels] of byReason) {
    const shown = labels.slice(0, 8).join(", ") + (labels.length > 8 ? ` and ${labels.length - 8} more` : "");
    lines.push(`Skipped ${labels.length}: ${reason} (${shown})`);
  }
  refresh();
  return ok === 0 && failures.length ? { error: lines.slice(1).join("\n") } : { ok: true, message: lines.join("\n") };
}

async function runEach<T>(items: T[], label: (item: T) => string, run: (item: T) => PromiseLike<{ error: DbError }>) {
  let ok = 0;
  const failures: Array<{ label: string; error: string }> = [];
  for (const item of items) {
    const { error } = await run(item);
    if (error) {
      const message = friendlyDbError(error);
      failures.push({
        label: label(item),
        error: message === "Listing is incomplete" ? "incomplete: check it has a cover photo, area and price (or price on request)" : message,
      });
    } else ok++;
  }
  return { ok, failures };
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------
const LISTING_ACTIONS = ["approve", "reject", "suspend", "reinstate", "feature", "unfeature", "delete"] as const;
const ADMIN_ONLY_LISTING_ACTIONS: readonly string[] = ["feature", "unfeature", "delete"];

async function listingIdsForFilter(supabase: Client, formData: FormData): Promise<string[]> {
  const status = text(formData, "filter_status");
  const q = text(formData, "filter_q");
  const batch = text(formData, "filter_batch");
  let query = supabase.from("listings").select("id").limit(MAX_ITEMS);
  if ((LISTING_STATUSES as readonly string[]).includes(status)) query = query.eq("status", status as (typeof LISTING_STATUSES)[number]);
  if (/^[0-9a-f-]{36}$/.test(batch)) query = query.eq("import_batch_id", batch);
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    query = query.or(`title.ilike.%${safe}%,reference_code.ilike.%${safe}%`);
  }
  const { data } = await query;
  return (data ?? []).map((row) => row.id);
}

export async function bulkListings(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!isStaff(viewer)) return NOT_ALLOWED;
  const action = z.enum(LISTING_ACTIONS).safeParse(formData.get("bulkAction"));
  if (!action.success) return { error: "Choose an action." };
  if (ADMIN_ONLY_LISTING_ACTIONS.includes(action.data) && !isAdmin(viewer)) return { error: "Only super admins can do that." };
  const reason = text(formData, "reason");
  if ((action.data === "reject" || action.data === "suspend") && !reason) return { error: "Write a reason; owners see it." };

  const supabase = await createUserClient();
  const ids = text(formData, "scope") === "all" ? await listingIdsForFilter(supabase, formData) : selectedIds(formData);
  if (!ids.length) return { error: "Tick at least one listing." };
  if (ids.length > MAX_ITEMS) return { error: `Select at most ${MAX_ITEMS} at a time.` };

  const { data: rows } = await supabase.from("listings").select("id, reference_code").in("id", ids);
  const listings = rows ?? [];
  const { ok, failures } = await runEach(
    listings,
    (listing) => listing.reference_code,
    (listing) => {
      switch (action.data) {
        case "feature":
        case "unfeature":
          return supabase.rpc("set_listing_featured", { p_listing_id: listing.id, p_featured: action.data === "feature" });
        case "delete":
          return supabase.rpc("admin_delete_listing", { p_listing_id: listing.id, p_confirm_reference: listing.reference_code });
        default:
          return supabase.rpc("moderate_listing", {
            p_listing_id: listing.id,
            p_decision: action.data,
            p_reason: reason || undefined,
            p_reason_visible_to_owner: true,
          });
      }
    },
  );

  updateTag("listings");
  for (const listing of listings) updateTag(`listing:${listing.reference_code}`);
  const verbs = {
    approve: "Approved and published",
    reject: "Rejected",
    suspend: "Suspended",
    reinstate: "Reinstated",
    feature: "Featured",
    unfeature: "Stopped featuring",
    delete: "Deleted",
  };
  return summary(verbs[action.data], ["listing", "listings"], ok, failures);
}

// ---------------------------------------------------------------------------
// Leads and enquiries
// ---------------------------------------------------------------------------
export async function bulkEnquiries(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!canSeeLeads(viewer)) return NOT_ALLOWED;
  const action = z.enum(["status", "assign"]).safeParse(formData.get("bulkAction"));
  if (!action.success) return { error: "Choose an action." };
  const choice = text(formData, "choice");
  const reason = text(formData, "reason");
  if (action.data === "status" && !(ENQUIRY_STATUSES as readonly string[]).includes(choice)) return { error: "Choose a status." };
  if (action.data === "assign" && choice && !z.uuid().safeParse(choice).success) return { error: "Choose a team member." };
  if (action.data === "status" && (choice === "lost" || choice === "unqualified") && !reason) {
    return { error: "Write a reason for lost or unqualified leads." };
  }

  const ids = selectedIds(formData).filter((id) => z.uuid().safeParse(id).success);
  if (!ids.length) return { error: "Tick at least one lead." };
  if (ids.length > MAX_ITEMS) return { error: `Select at most ${MAX_ITEMS} at a time.` };

  const supabase = await createUserClient();
  const { data: rows } = await supabase.from("enquiries").select("id, name, status, team_assignee, follow_up_at, lost_reason").in("id", ids);
  const { ok, failures } = await runEach(
    rows ?? [],
    (lead) => lead.name,
    (lead) =>
      supabase.rpc("admin_update_enquiry", {
        p_enquiry_id: lead.id,
        p_status: action.data === "status" ? (choice as EnquiryStatus) : lead.status,
        // The generated types don't mark these nullable; null means "not assigned" / "no follow-up".
        p_team_assignee: (action.data === "assign" ? choice || null : lead.team_assignee) as string,
        p_follow_up_at: lead.follow_up_at as string,
        p_lost_reason: (action.data === "status" ? reason : lead.lost_reason) || undefined,
      }),
  );
  return summary(action.data === "status" ? "Updated" : "Assigned", ["lead", "leads"], ok, failures);
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
export async function bulkReports(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!isStaff(viewer)) return NOT_ALLOWED;
  const action = z.enum(["resolved", "dismissed", "open"]).safeParse(formData.get("bulkAction"));
  if (!action.success) return { error: "Choose an action." };
  const ids = selectedIds(formData).map(Number).filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return { error: "Tick at least one report." };
  const supabase = await createUserClient();
  const { ok, failures } = await runEach(
    ids,
    (id) => `#${id}`,
    (id) => supabase.rpc("admin_handle_report", { p_report_id: id, p_status: action.data }),
  );
  return summary(action.data === "open" ? "Reopened" : `Marked ${action.data}`, ["report", "reports"], ok, failures);
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
export async function bulkCustomers(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) return NOT_ALLOWED;
  const action = z.enum(["suspended", "active"]).safeParse(formData.get("bulkAction"));
  if (!action.success) return { error: "Choose an action." };
  const ids = selectedIds(formData).filter((id) => z.uuid().safeParse(id).success && id !== viewer!.id);
  if (!ids.length) return { error: "Tick at least one customer (not yourself)." };
  const supabase = await createUserClient();
  const { data: rows } = await supabase.from("profiles").select("id, display_name").in("id", ids);
  const { ok, failures } = await runEach(
    rows ?? [],
    (profile) => profile.display_name,
    (profile) =>
      supabase.rpc("admin_set_account_status", {
        p_user_id: profile.id,
        p_status: action.data,
        p_reason: text(formData, "reason") || undefined,
      }),
  );
  return summary(action.data === "suspended" ? "Suspended" : "Reactivated", ["account", "accounts"], ok, failures);
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------
export async function bulkPages(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!canManageContent(viewer)) return NOT_ALLOWED;
  const action = z.enum(["publish", "unpublish", "delete"]).safeParse(formData.get("bulkAction"));
  if (!action.success) return { error: "Choose an action." };
  const slugs = selectedIds(formData).filter((slug) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug));
  if (!slugs.length) return { error: "Tick at least one page." };
  const supabase = await createUserClient();
  const { ok, failures } = await runEach(
    slugs,
    (slug) => slug,
    async (slug) => {
      if (action.data === "delete") {
        const { data, error } = await supabase.from("content_pages").delete().eq("slug", slug).select("slug");
        return { error: error ?? (data?.length ? null : { code: "PT409", message: "This page can't be deleted" }) };
      }
      const { error } = await supabase
        .from("content_pages")
        .update({ is_published: action.data === "publish", updated_by: viewer!.id })
        .eq("slug", slug);
      return { error };
    },
  );
  updateTag("content");
  const verbs = { publish: "Published", unpublish: "Unpublished", delete: "Deleted" };
  return summary(verbs[action.data], ["page", "pages"], ok, failures);
}
