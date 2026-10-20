import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase";

// /go/floating and /go/banner:<id>: counts the click, then sends the visitor on. The
// destination comes from the database, never from the request, so this is not an open redirect.
export async function GET(request: NextRequest, { params }: RouteContext<"/go/[key]">) {
  const { key } = await params;
  const visitor = request.cookies.get("fyh_vid")?.value ?? randomUUID();
  const { data: target } = await createPublicClient().rpc("follow_site_link", { p_key: decodeURIComponent(key), p_visitor: visitor });
  const destination = typeof target === "string" && target ? new URL(target, request.nextUrl.origin) : new URL("/", request.nextUrl.origin);
  const response = NextResponse.redirect(destination, 302);
  if (!request.cookies.has("fyh_vid")) {
    response.cookies.set("fyh_vid", visitor, { maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, path: "/" });
  }
  return response;
}
