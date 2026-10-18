import { describe, expect, it, vi } from "vitest";
import { postToSheet, sheetRow, sheetText, type SheetEnquiry } from "./sheets";

const enquiry: SheetEnquiry = {
  id: "6f1c9a52-0000-4000-8000-000000000001",
  created_at: "2026-10-18T10:00:00Z",
  status: "visit_scheduled",
  kind: "visit_request",
  name: "=IMPORTXML(\"https://evil.example\",\"//a\")",
  email: "asha@example.test",
  phone: "+91 98765 43210",
  message: "Is it available?",
  requested_visit_at: "2026-10-20T08:30:00Z",
  requested_timezone: "Asia/Kolkata",
  follow_up_at: null,
  listing_title: "Sunny flat",
  reference: "FYH-000123",
  category: "new_project",
  city: "Pune",
  team_owner: "Support Sam",
};

const URL_OK = "https://script.google.com/macros/s/AKfycbxTEST1234567890/exec";

describe("sheet rows", () => {
  it("never lets visitor text run as a formula", () => {
    expect(sheetText("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(sheetText("+91 98765 43210")).toBe("'+91 98765 43210");
    expect(sheetText("-5")).toBe("'-5");
    expect(sheetText("@home")).toBe("'@home");
    expect(sheetText("Hello")).toBe("Hello");
    expect(sheetText(null)).toBe("");
  });

  it("builds readable columns with a link back to the admin page", () => {
    const row = sheetRow(enquiry, "https://findyourhome.example");
    expect(Object.keys(row)[0]).toBe("Enquiry ID");
    expect(row.Name.startsWith("'=")).toBe(true);
    expect(row.Type).toBe("Visit request");
    expect(row.Status).toBe("visit scheduled");
    expect(row.Category).toBe("new project");
    expect(row["Visit time"]).toContain("Asia/Kolkata");
    expect(row["Admin link"]).toBe(`https://findyourhome.example/admin/enquiries/${enquiry.id}`);
  });
});

describe("postToSheet", () => {
  const respond = (status: number, body: string) => vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;

  it("sends the secret with the row and accepts the script's confirmation", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{"ok":true}', { status: 200 }));
    const result = await postToSheet(URL_OK, "s3cret", { "Enquiry ID": "1" }, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: true });
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)).toEqual({ secret: "s3cret", enquiry: { "Enquiry ID": "1" } });
  });

  it("only posts to Apps Script web apps", async () => {
    const fetchImpl = respond(200, '{"ok":true}');
    expect(await postToSheet("https://evil.example/exec", "s", {}, fetchImpl)).toMatchObject({ ok: false, retryable: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("explains a wrong secret and does not keep retrying it", async () => {
    expect(await postToSheet(URL_OK, "s", {}, respond(200, '{"ok":false,"error":"forbidden"}'))).toMatchObject({
      ok: false,
      retryable: false,
    });
  });

  it("treats a login page as a deployment problem and server errors as temporary", async () => {
    expect(await postToSheet(URL_OK, "s", {}, respond(200, "<html>Sign in</html>"))).toMatchObject({ ok: false, retryable: false });
    expect(await postToSheet(URL_OK, "s", {}, respond(503, ""))).toMatchObject({ ok: false, retryable: true });
  });
});
