"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";

const input = z.object({ listingId: z.uuid(), save: z.enum(["1", "0"]), returnTo: z.string().startsWith("/") });

export async function toggleFavorite(formData: FormData): Promise<void> {
  const parsed = input.safeParse({
    listingId: formData.get("listingId"),
    save: formData.get("save"),
    returnTo: formData.get("returnTo"),
  });
  if (!parsed.success) return;

  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(parsed.data.returnTo)}`);

  // RLS enforces that users only write their own favorites, and only for published listings.
  const supabase = await createUserClient();
  if (parsed.data.save === "1") {
    await supabase.from("favorites").upsert({ user_id: viewer.id, listing_id: parsed.data.listingId }, { ignoreDuplicates: true });
  } else {
    await supabase.from("favorites").delete().eq("user_id", viewer.id).eq("listing_id", parsed.data.listingId);
  }
  refresh();
}
