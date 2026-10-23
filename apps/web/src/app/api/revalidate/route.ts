import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { secretMatches } from "@/lib/shared-secret";

// Called by the process-jobs worker after it publishes or removes listing photos, so cached
// public pages pick up the new photos immediately. Protected by REVALIDATE_SECRET.

export async function POST(request: NextRequest) {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected || expected.length < 32) {
    return NextResponse.json({ error: "REVALIDATE_SECRET is not configured" }, { status: 503 });
  }
  if (!secretMatches(request.headers.get("x-revalidate-secret") ?? "", expected)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Expire immediately (webhook pattern): the next visitor gets fresh data.
  revalidateTag("listings", { expire: 0 });
  return NextResponse.json({ revalidated: ["listings"] });
}
