import { expect, test } from "@playwright/test";
import { DEMO, adminRest, runWorkers, signIn, signOut, testJpeg } from "./support/helpers";

// The core marketplace loop, end to end:
// owner drafts + uploads a photo + submits -> moderator approves -> worker publishes the
// photo -> visitor finds the listing and sends an enquiry -> owner sees it -> owner archives.

test.describe.configure({ mode: "serial" });

const title = `[DEMO] E2E flat ${Date.now()}`;
let listingPath = "";
let listingId = "";

test("owner creates a draft, uploads a photo and submits it", async ({ page }) => {
  await signIn(page, DEMO.owner, DEMO.password, "/account/listings/new");

  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Property type").selectOption({ label: "Apartment" });
  await page.getByLabel("Description").fill("Automated test listing. Bright two-bedroom flat with a balcony near the park.");
  await page.locator("input[name=priceAmount]").fill("199000");
  await page.getByLabel("Country").selectOption({ label: "Demo Country" });
  await page.getByLabel("City").selectOption({ label: "Sampleton" });
  await page.getByLabel("Total area").fill("72");
  await page.getByLabel("Bedrooms").fill("2");
  await page.getByRole("button", { name: "Save draft and add photos" }).click();

  await page.waitForURL(/\/account\/listings\/[0-9a-f-]+\?notice=created/);
  listingId = page.url().split("/").pop()!.split("?")[0]!;
  await expect(page.getByText("Draft saved.")).toBeVisible();

  // Submitting without a photo is refused with the reason.
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("Listing is incomplete: cover photo")).toBeVisible();

  await page.locator("#photo-upload").setInputFiles({ name: "living-room.jpg", mimeType: "image/jpeg", buffer: testJpeg() });
  await expect(page.getByText("Photos uploaded.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Photos (1/30)" })).toBeVisible();
  await page.getByLabel("Describe this photo (for screen readers)").fill("Bright living room");
  await page.getByLabel("Describe this photo (for screen readers)").blur();
  await expect(page.getByText("Description saved.")).toBeVisible();

  // A renamed executable is rejected before upload.
  await page.locator("#photo-upload").setInputFiles({ name: "virus.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") });
  await expect(page.getByText(/virus\.exe: use JPEG, PNG or WebP/)).toBeVisible();

  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText(/Submitted\. Listings are usually reviewed within \d+ (hours|days)/)).toBeVisible();
  await expect(page.getByText("Awaiting review", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw to edit" })).toBeVisible();
  await signOut(page);
});

test("visitors cannot see the listing before approval", async ({ request }) => {
  const rows = await (await request.get(`/search?q=${encodeURIComponent(title.slice(7))}`)).text();
  expect(rows).not.toContain(title);
});

test("moderator approves from the review queue", async ({ page }) => {
  await signIn(page, DEMO.moderator, DEMO.password, "/admin/listings");
  await page.goto("/admin/listings?status=pending_review");
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByText(/image\/jpeg · \d+ KB · not public/)).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await expect(page.getByRole("link", { name: "View live page" })).toBeVisible();
  listingPath = (await page.getByRole("link", { name: "View live page" }).getAttribute("href"))!;
  await signOut(page);
});

test("the worker publishes a metadata-free photo copy", async () => {
  await runWorkers();
  const media = await adminRest<Array<{ public_key: string | null }>>(`listing_media?listing_id=eq.${listingId}&select=public_key`);
  expect(media[0]?.public_key).toBeTruthy();
});

test("a visitor finds the listing, sees the photo and sends an enquiry", async ({ page }) => {
  await page.goto(listingPath);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  const photo = page.getByRole("img", { name: "Bright living room" }).first();
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  await page.getByLabel(/^Name/).fill("E2E Visitor");
  await page.getByLabel(/^Email/).fill("e2e.visitor@example.test");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Please agree so we can pass your message on")).toBeVisible();
  await page.getByText(/I agree that .* passes my name/).click();
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Message sent. The lister will reply by email.")).toBeVisible();
});

test("the owner sees the enquiry and the approval email was sent", async ({ page }) => {
  await signIn(page, DEMO.owner, DEMO.password, "/account/enquiries");
  await page.getByRole("link", { name: new RegExp(title.replace(/[[\]]/g, "\\$&")) }).first().click();
  await expect(page.getByText("e2e.visitor@example.test")).toBeVisible();
  await page.getByRole("button", { name: "Mark as replied" }).click();
  await expect(page.getByText("Updated.")).toBeVisible();

  const outbox = await adminRest<Array<{ status: string }>>(
    `notification_outbox?template=eq.listing_decision&template_data->>listing_id=eq.${listingId}&select=status`,
  );
  expect(outbox[0]?.status).toBe("sent");
});

test("the owner archives the listing and it leaves search", async ({ page }) => {
  await signIn(page, DEMO.owner, DEMO.password, `/account/listings/${listingId}`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("Archived and removed from search.")).toBeVisible();
  await runWorkers();

  await page.goto(listingPath);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
});
