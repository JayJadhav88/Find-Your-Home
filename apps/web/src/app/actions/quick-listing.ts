"use server";

import { AREA_UNITS, FURNISHINGS, listingFormSchema, listingFormToRow, parseVideoUrl, splitLinks } from "@fyh/shared";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canList, getViewer } from "@/lib/auth";
import { getSiteSettings, getTaxonomy } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";
import { formValues, friendlyDbError, type FormState } from "./types";

// The quick "List your property" flow: contact details → property → photos & video → extras.
// It writes the same listings as the full form, so owners can add full details later.

const START = "/list-your-property/start";

const contactInput = z.object({
  name: z.string().trim().min(2, "Enter your name").max(100),
  phone: z
    .string()
    .trim()
    .max(32)
    .refine((value) => value.replace(/\D/g, "").length >= 10 && value.replace(/\D/g, "").length <= 15, "Enter a 10-digit mobile number"),
});

/** Step 1: name and mobile number (required), and listing turned on for the account. */
export async function saveQuickContact(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${START}`);
  const parsed = contactInput.safeParse({ name: formData.get("name"), phone: formData.get("phone") });
  if (!parsed.success) {
    return { fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])), values: formValues(formData) };
  }
  const supabase = await createUserClient();
  const { error } = await supabase.from("profiles").update({ display_name: parsed.data.name, phone: parsed.data.phone }).eq("id", viewer.id);
  if (error) return { error: friendlyDbError(error), values: formValues(formData) };
  if (!canList(viewer)) {
    const owner = await supabase.rpc("become_owner");
    if (owner.error) return { error: friendlyDbError(owner.error), values: formValues(formData) };
  }
  redirect(`${START}?step=2`);
}

const propertyInput = z.object({
  listingId: z.preprocess((value) => (value ? value : undefined), z.uuid().optional()),
  purpose: z.enum(["sale", "rent"], { message: "Choose sell or rent" }),
  propertyTypeId: z.uuid({ message: "Choose the property type" }),
  bedrooms: z.preprocess((value) => (value === "" || value == null ? undefined : Number(value)), z.number().int().min(0).max(20).optional()),
  areaValue: z.preprocess((value) => Number(value), z.number({ message: "Enter the area" }).positive("Enter the area").max(9_999_999)),
  areaUnit: z.enum(AREA_UNITS),
  priceAmount: z.preprocess((value) => Number(String(value ?? "").replace(/[,\s]/g, "")), z.number({ message: "Enter the price" }).positive("Enter the price").max(999_999_999_999)),
  cityId: z.uuid({ message: "Choose the city" }),
  localityId: z.preprocess((value) => (value ? value : undefined), z.uuid().optional()),
  furnishing: z.preprocess((value) => (value ? value : undefined), z.enum(FURNISHINGS).optional()),
  description: z.preprocess((value) => value ?? "", z.string().trim().max(5000)),
});

const AREA_WORDS: Record<string, string> = { sq_ft: "sq ft", sq_m: "sq m", acre: "acres", hectare: "hectares" };

function rupees(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

/** Step 2: the property basics. Title and a starter description are written for the owner. */
export async function saveQuickProperty(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${START}`);
  if (!canList(viewer)) redirect(START);

  const parsed = propertyInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])),
      values: formValues(formData),
      error: "Please check the highlighted fields.",
    };
  }
  const input = parsed.data;
  const [taxonomy, settings] = await Promise.all([getTaxonomy(), getSiteSettings()]);
  const byId = new Map(taxonomy.locations.map((location) => [location.id, location]));
  const city = byId.get(input.cityId);
  const locality = input.localityId ? byId.get(input.localityId) : undefined;
  if (!city) return { fieldErrors: { cityId: "Choose the city" }, values: formValues(formData) };
  if (locality && locality.parent_id !== city.id) return { fieldErrors: { localityId: "Choose a locality in this city" }, values: formValues(formData) };
  // A city sits under a region (state) or directly under a country.
  const parent = city.parent_id ? byId.get(city.parent_id) : undefined;
  const region = parent?.level === "region" ? parent : undefined;
  const country = parent?.level === "country" ? parent : region?.parent_id ? byId.get(region.parent_id) : undefined;
  const type = taxonomy.propertyTypes.find((item) => item.id === input.propertyTypeId);
  if (!type) return { fieldErrors: { propertyTypeId: "Choose the property type" }, values: formValues(formData) };

  const place = locality ? `${locality.name}, ${city.name}` : city.name;
  const bhk = input.bedrooms ? `${input.bedrooms} BHK ` : "";
  const title = `${bhk}${type.name} for ${input.purpose === "rent" ? "rent" : "sale"} in ${place}`.slice(0, 140);
  const starter = `${title}. ${input.areaValue} ${AREA_WORDS[input.areaUnit] ?? input.areaUnit}, ${input.purpose === "rent" ? `rent ${rupees(input.priceAmount)} a month` : `price ${rupees(input.priceAmount)}`}. Posted directly by the owner: no brokerage.`;
  const description = input.description.length >= 30 ? input.description : `${input.description ? `${input.description}\n\n` : ""}${starter}`;

  const values = listingFormSchema.safeParse({
    title,
    description,
    category: input.purpose === "rent" ? "rental" : "resale",
    propertyTypeId: input.propertyTypeId,
    priceAmount: String(input.priceAmount),
    currency: settings.default_currency,
    pricePeriod: input.purpose === "rent" ? "per_month" : "total",
    countryId: country?.id ?? "",
    regionId: region?.id ?? "",
    cityId: city.id,
    localityId: locality?.id ?? "",
    areaUnit: input.areaUnit,
    areaValue: String(input.areaValue),
    bedrooms: input.bedrooms === undefined ? "" : String(input.bedrooms),
    furnishing: input.furnishing ?? "",
    contactViaForm: "on",
    showPhone: "on",
    amenityIds: [],
  });
  if (!values.success) return { error: values.error.issues[0]?.message ?? "Please check the details.", values: formValues(formData) };

  const supabase = await createUserClient();
  let listingId = input.listingId;
  if (listingId) {
    const { data, error } = await supabase.from("listings").update(listingFormToRow(values.data)).eq("id", listingId).select("id").maybeSingle();
    if (error) return { error: friendlyDbError(error), values: formValues(formData) };
    if (!data) return { error: "This property can't be changed right now.", values: formValues(formData) };
  } else {
    const { data, error } = await supabase
      .from("listings")
      .insert({ ...listingFormToRow(values.data), owner_id: viewer.id, slug: "draft" })
      .select("id")
      .single();
    if (error || !data) return { error: friendlyDbError(error), values: formValues(formData) };
    listingId = data.id;
  }
  redirect(`${START}?step=3&id=${listingId}`);
}

/** Step 3: YouTube / Instagram links, added to what the property already has. */
export async function addQuickVideoLinks(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${START}`);
  const listingId = z.uuid().safeParse(formData.get("listingId"));
  if (!listingId.success) return { error: "Unknown property." };
  const links = splitLinks(String(formData.get("videoUrls") ?? ""));
  if (!links.length) return { fieldErrors: { videoUrls: "Paste a YouTube or Instagram link" } };
  const parsed = links.map(parseVideoUrl);
  const bad = links.find((_, index) => !parsed[index]);
  if (bad) return { fieldErrors: { videoUrls: `Not a YouTube or Instagram video: ${bad.slice(0, 60)}` }, values: formValues(formData) };

  const supabase = await createUserClient();
  const { data: existing } = await supabase.from("listing_videos").select("provider, video_id, sort_order").eq("listing_id", listingId.data);
  const seen = new Set((existing ?? []).map((video) => `${video.provider}:${video.video_id}`));
  let order = Math.max(-1, ...(existing ?? []).map((video) => video.sort_order)) + 1;
  const rows = parsed
    .filter((video): video is NonNullable<typeof video> => video !== null && !seen.has(`${video.provider}:${video.videoId}`))
    .map((video) => ({ listing_id: listingId.data, provider: video.provider, video_id: video.videoId, instagram_kind: video.instagramKind, sort_order: order++ }));
  if (rows.length) {
    const { error } = await supabase.from("listing_videos").insert(rows);
    if (error) return { error: friendlyDbError(error), values: formValues(formData) };
  }
  refresh();
  return { ok: true, message: rows.length ? "Video added." : "That video is already added." };
}

export async function removeQuickVideoLink(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${START}`);
  const input = z.object({ listingId: z.uuid(), videoId: z.string().min(1).max(100) }).safeParse({ listingId: formData.get("listingId"), videoId: formData.get("videoId") });
  if (!input.success) return { error: "Unknown video." };
  const supabase = await createUserClient();
  const { error } = await supabase.from("listing_videos").delete().eq("listing_id", input.data.listingId).eq("video_id", input.data.videoId);
  if (error) return { error: friendlyDbError(error) };
  refresh();
  return { ok: true, message: "Video removed." };
}

const shootInput = z.object({
  listingId: z.uuid(),
  date: z.iso.date({ message: "Choose a date" }),
  slot: z.enum(["morning", "afternoon", "evening"], { message: "Choose a time of day" }),
  notes: z.preprocess((value) => value ?? "", z.string().trim().max(1000)),
});

/** Step 4 (and the property page in My account): ask for a professional photo/video shoot. */
export async function requestQuickShoot(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${START}`);
  const parsed = shootInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])), values: formValues(formData) };
  }
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("request_shoot", {
    p_listing_id: parsed.data.listingId,
    p_date: parsed.data.date,
    p_slot: parsed.data.slot,
    p_notes: parsed.data.notes || undefined,
  });
  if (error) return { error: friendlyDbError(error), values: formValues(formData) };
  refresh();
  return { ok: true, message: "Shoot requested. Our team will call you to confirm the time." };
}
