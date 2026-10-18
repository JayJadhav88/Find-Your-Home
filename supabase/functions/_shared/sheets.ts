// Copies enquiries to a Google Sheet through the owner's Apps Script web app (see
// docs/10-notifications-and-team.md for the script). Pure TypeScript (fetch only).

export interface SheetEnquiry {
  id: string;
  created_at: string;
  status: string;
  kind: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  requested_visit_at: string | null;
  requested_timezone: string | null;
  follow_up_at: string | null;
  listing_title: string | null;
  reference: string | null;
  category: string | null;
  city: string | null;
  team_owner: string | null;
}

export const SHEET_WEBHOOK = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{10,200}\/exec$/;

/**
 * Spreadsheets treat text starting with = + - @ as a formula. Visitor-supplied text is
 * prefixed with an apostrophe so it always shows as plain text (no formula injection).
 */
export function sheetText(value: string | null | undefined): string {
  const text = (value ?? "").replace(/\r\n?/g, "\n").slice(0, 5000);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** One row, keyed by column header. The first column (Enquiry ID) identifies the row. */
export function sheetRow(enquiry: SheetEnquiry, siteUrl: string): Record<string, string> {
  return {
    "Enquiry ID": enquiry.id,
    Received: enquiry.created_at,
    Status: enquiry.status.replace(/_/g, " "),
    Type: enquiry.kind === "visit_request" ? "Visit request" : "Enquiry",
    Name: sheetText(enquiry.name),
    Email: sheetText(enquiry.email),
    Phone: sheetText(enquiry.phone),
    Message: sheetText(enquiry.message),
    "Visit time": enquiry.requested_visit_at ? `${enquiry.requested_visit_at} (${enquiry.requested_timezone ?? "UTC"})` : "",
    Property: sheetText(enquiry.listing_title),
    Reference: sheetText(enquiry.reference),
    Category: enquiry.category?.replace(/_/g, " ") ?? "",
    City: sheetText(enquiry.city),
    "Team owner": sheetText(enquiry.team_owner),
    "Follow-up": enquiry.follow_up_at ?? "",
    "Admin link": new URL(`/admin/enquiries/${enquiry.id}`, siteUrl).toString(),
  };
}

export type SheetResult = { ok: true } | { ok: false; retryable: boolean; error: string };

export async function postToSheet(
  webhookUrl: string,
  secret: string,
  row: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<SheetResult> {
  if (!SHEET_WEBHOOK.test(webhookUrl)) return { ok: false, retryable: false, error: "Not a Google Apps Script web app address" };
  let response: Response;
  try {
    // Apps Script answers with a redirect to script.googleusercontent.com; fetch follows it.
    response = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, enquiry: row }),
    });
  } catch (error) {
    return { ok: false, retryable: true, error: `Network error: ${(error as Error).message}` };
  }
  const text = await response.text().catch(() => "");
  let body: { ok?: boolean; error?: string } = {};
  try {
    body = JSON.parse(text);
  } catch {
    // An HTML page usually means the script isn't deployed for "Anyone" or the URL is wrong.
  }
  if (response.ok && body.ok) return { ok: true };
  if (body.error === "forbidden") return { ok: false, retryable: false, error: "The sheet rejected the secret: paste the current secret into the script" };
  return {
    ok: false,
    retryable: response.status === 429 || response.status >= 500 || (response.ok && !text),
    error: response.ok ? "The script did not confirm. Check it is deployed as a web app for “Anyone”." : `Google ${response.status}`,
  };
}
