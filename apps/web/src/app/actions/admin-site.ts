"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { canManageContent, getViewer, isAdmin } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";
import { formValues, friendlyDbError, type FormState } from "./types";

// Home banners and the floating button (content managers), feature switches (administrators).
// The database checks the same permissions and validates every link.

const NOT_ALLOWED: FormState = { error: "You don't have permission to do that." };
const LINK = /^(\/([^/\s][^\s]*)?|https:\/\/[^\s]+|tel:\+?[0-9 ()-]{6,20})$/;
const LINK_HINT = "Use a page on this site (starting with /), an https:// address or tel:+91…";

async function contentClient() {
  const viewer = await getViewer();
  return canManageContent(viewer) ? createUserClient() : null;
}

const optionalDate = z.string().trim().refine((value) => value === "" || !Number.isNaN(Date.parse(value)), "Choose a valid date and time.");

const bannerInput = z.object({
  id: z.union([z.uuid(), z.literal("")]),
  title: z.string().trim().min(1, "Add a title.").max(80),
  subtitle: z.string().trim().max(160),
  imageUrl: z.union([z.url({ protocol: /^https?$/ }), z.literal("")]),
  ctaLabel: z.string().trim().max(30),
  targetUrl: z.string().trim().max(500).refine((value) => value === "" || LINK.test(value), LINK_HINT),
  audience: z.enum(["all", "web", "app"]),
  startsAt: optionalDate,
  endsAt: optionalDate,
  sortOrder: z.coerce.number().int().min(-100).max(100),
  isActive: z.boolean(),
  timeZone: z.string().trim().max(64),
});

export async function saveBanner(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await contentClient();
  if (!supabase) return NOT_ALLOWED;
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const parsed = bannerInput.safeParse({
    id: text("id"),
    title: text("title"),
    subtitle: text("subtitle"),
    imageUrl: text("imageUrl"),
    ctaLabel: text("ctaLabel"),
    targetUrl: text("targetUrl"),
    audience: text("audience") || "all",
    startsAt: text("startsAt"),
    endsAt: text("endsAt"),
    sortOrder: text("sortOrder") || "0",
    isActive: formData.get("isActive") === "on",
    timeZone: text("timeZone"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, values: formValues(formData) };
  }
  const values = parsed.data;
  const { data: settings } = await supabase.from("site_settings").select("default_timezone").single();
  const { zonedLocalToUtc } = await import("@fyh/shared");
  const toUtc = (local: string) => (local ? zonedLocalToUtc(local.slice(0, 16), settings?.default_timezone ?? "UTC") : null);
  const row = {
    title: values.title,
    subtitle: values.subtitle || null,
    image_url: values.imageUrl || null,
    cta_label: values.ctaLabel || null,
    target_url: values.targetUrl || null,
    audience: values.audience,
    starts_at: toUtc(values.startsAt),
    ends_at: toUtc(values.endsAt),
    sort_order: values.sortOrder,
    is_active: values.isActive,
  };
  const { error } = values.id ? await supabase.from("banners").update(row).eq("id", values.id) : await supabase.from("banners").insert(row);
  if (error) return { error: friendlyDbError(error), values: formValues(formData) };
  updateTag("banners");
  refresh();
  return { ok: true, message: values.id ? "Banner saved." : "Banner added." };
}

export async function deleteBanner(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await contentClient();
  if (!supabase) return NOT_ALLOWED;
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Unknown banner." };
  const { error } = await supabase.from("banners").delete().eq("id", id.data);
  if (error) return { error: friendlyDbError(error) };
  updateTag("banners");
  refresh();
  return { ok: true, message: "Banner deleted." };
}

const floatingInput = z.object({
  isActive: z.boolean(),
  icon: z.enum(["whatsapp", "phone", "chat", "calendar", "home", "offer", "video"]),
  label: z.string().trim().min(1, "Add a label.").max(40),
  targetUrl: z.string().trim().max(500).refine((value) => value === "" || LINK.test(value) || /^https:\/\/wa\.me\//.test(value), LINK_HINT),
  position: z.enum(["right", "left"]),
});

export async function saveFloatingAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const supabase = await contentClient();
  if (!supabase) return NOT_ALLOWED;
  const parsed = floatingInput.safeParse({
    isActive: formData.get("isActive") === "on",
    icon: formData.get("icon"),
    label: String(formData.get("label") ?? ""),
    targetUrl: String(formData.get("targetUrl") ?? ""),
    position: formData.get("position"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the button details.", values: formValues(formData) };
  if (parsed.data.isActive && !parsed.data.targetUrl) return { error: "Add a link to switch the button on.", values: formValues(formData) };
  const { error } = await supabase
    .from("floating_action")
    .update({
      is_active: parsed.data.isActive,
      icon: parsed.data.icon,
      label: parsed.data.label,
      target_url: parsed.data.targetUrl || null,
      position: parsed.data.position,
    })
    .eq("id", true);
  if (error) return { error: friendlyDbError(error), values: formValues(formData) };
  updateTag("floating-action");
  refresh();
  return { ok: true, message: "Floating button saved." };
}

export async function setFeatureFlag(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) return NOT_ALLOWED;
  const parsed = z
    .object({ key: z.string().regex(/^[a-z_]{2,40}$/), enabled: z.enum(["1", "0"]) })
    .safeParse({ key: formData.get("key"), enabled: formData.get("enabled") });
  if (!parsed.success) return { error: "Unknown switch." };
  const supabase = await createUserClient();
  const { error } = await supabase.from("feature_flags").update({ enabled: parsed.data.enabled === "1" }).eq("key", parsed.data.key);
  if (error) return { error: friendlyDbError(error) };
  updateTag("feature-flags");
  refresh();
  return { ok: true, message: parsed.data.enabled === "1" ? "Switched on." : "Switched off." };
}
