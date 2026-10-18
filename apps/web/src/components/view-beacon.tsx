"use client";

import { useEffect } from "react";
import { recordView } from "@/app/actions/extras";

const KEY = "fyh.visitor";

/** Counts one view per browser per day for the owner's insights (no cookies, no tracking). */
export function ViewBeacon({ listingId }: { listingId: string }) {
  useEffect(() => {
    let visitor = "";
    try {
      visitor = localStorage.getItem(KEY) ?? "";
      if (!visitor) {
        visitor = crypto.randomUUID();
        localStorage.setItem(KEY, visitor);
      }
    } catch {
      visitor = crypto.randomUUID();
    }
    void recordView(listingId, visitor);
  }, [listingId]);
  return null;
}
