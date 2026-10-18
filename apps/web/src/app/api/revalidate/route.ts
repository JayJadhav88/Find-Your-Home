import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

// Called by the process-jobs worker after it publishes or removes listing photos, so cached
// public pages pick up the new photos immediately. Protected by REVALIDATE_SECRET.

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

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
