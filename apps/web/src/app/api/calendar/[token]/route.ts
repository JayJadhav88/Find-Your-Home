import { createPublicClient } from "@/lib/supabase";

// Private calendar feed for Google Calendar / Outlook ("subscribe from URL"):
// /api/calendar/<secret>.ics — made in Admin → Integrations → Team calendar.

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
}

function stamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Lines longer than 75 characters are folded, as the calendar format requires. */
function fold(line: string): string {
  const parts: string[] = [];
  for (let index = 0; index < line.length; index += 73) parts.push((index ? " " : "") + line.slice(index, index + 73));
  return parts.join("\r\n");
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, "");
  if (!/^[0-9a-f]{48}$/.test(token)) return new Response("Not found", { status: 404 });
  const { data, error } = await createPublicClient().rpc("calendar_feed", { p_token: token });
  if (error) return new Response("Not found", { status: 404 });
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const now = stamp(new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Find Your Home//Team calendar//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Find Your Home team",
    ...(data ?? []).flatMap((event) => [
      "BEGIN:VEVENT",
      `UID:${event.uid}@findyourhome`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(event.starts_at)}`,
      `DTEND:${stamp(event.ends_at)}`,
      fold(`SUMMARY:${escapeText(event.title)}`),
      fold(`DESCRIPTION:${escapeText(event.details ?? "")}`),
      ...(event.listing_id ? [fold(`URL:${site}/admin/listings/${event.listing_id}`)] : []),
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" },
  });
}
