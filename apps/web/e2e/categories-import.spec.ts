import { createServer, type Server } from "node:http";
import { IMPORT_COLUMNS } from "@fyh/shared";
import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { DEMO, runWorkers, signIn, testJpeg } from "./support/helpers";

// Categories (rental / resale / new project), YouTube/Instagram videos and the admin
// Excel import, including image links downloaded by the worker.

const BUILDER = "demo.builder@example.test";
const IMAGE_PORT = 4599;
// The worker runs in Docker; it reaches this machine through host.docker.internal
// (allowed only by the local IMPORT_ALLOWED_PRIVATE_HOSTS setting).
const IMAGE_BASE = `http://host.docker.internal:${IMAGE_PORT}`;

test.describe.configure({ mode: "serial" });

let imageServer: Server;
const stamp = Date.now();
const projectTitle = `[DEMO] E2E import project ${stamp}`;
const rentalTitle = `[DEMO] E2E import rental ${stamp}`;

test.beforeAll(async () => {
  const jpeg = testJpeg();
  imageServer = createServer((request, response) => {
    if (request.url === "/house.jpg") {
      response.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": jpeg.length });
      response.end(jpeg);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => imageServer.listen(IMAGE_PORT, "0.0.0.0", resolve));
});

test.afterAll(async () => {
  await new Promise((resolve) => imageServer.close(resolve));
});

test("navigation offers Rent, Resale and New projects", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Rent" })).toHaveAttribute("href", "/search?category=rental");
  await expect(nav.getByRole("link", { name: "Resale" })).toHaveAttribute("href", "/search?category=resale");
  await expect(nav.getByRole("link", { name: "New projects" })).toHaveAttribute("href", "/search?category=new_project");
  await page.goto("/search?category=rental");
  const badges = await page.locator("article .rounded-full").allTextContents();
  expect(badges.filter((badge) => badge === "Resale" || badge === "New project")).toHaveLength(0);
});

test("only builders can choose New project", async ({ page }) => {
  await signIn(page, DEMO.owner, DEMO.password, "/account/listings/new");
  await expect(page.getByLabel(/^Category/).locator("option")).toHaveText(["Rental", "Resale"]);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/");

  await signIn(page, BUILDER, DEMO.password, "/account/listings/new");
  await expect(page.getByLabel(/^Category/)).toHaveValue("new_project");
  await expect(page.getByLabel(/^Project name/)).toBeVisible();
  await page.getByLabel(/^Title/).fill(`[DEMO] E2E builder draft ${stamp}`);
  await page.getByRole("button", { name: "Save draft and add photos" }).click();
  await expect(page.getByText("Enter the project name")).toBeVisible();

  await page.getByLabel(/^Project name/).fill("E2E Heights");
  await page.getByLabel(/^YouTube or Instagram video links/).fill("https://vimeo.com/123");
  await page.getByRole("button", { name: "Save draft and add photos" }).click();
  await expect(page.getByText(/Not a YouTube or Instagram video/)).toBeVisible();

  await page.getByLabel(/^YouTube or Instagram video links/).fill("https://youtu.be/dQw4w9WgXcQ\nhttps://www.instagram.com/reel/C1a2B3c4D5e/");
  await page.getByRole("button", { name: "Save draft and add photos" }).click();
  await page.waitForURL(/notice=created/);
  await expect(page.getByLabel(/^YouTube or Instagram video links/)).toHaveValue(
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ\nhttps://www.instagram.com/reel/C1a2B3c4D5e/",
  );
});

async function importWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Listings");
  sheet.addRow(IMPORT_COLUMNS.map((column) => column.header));
  const row = (values: Record<string, string | number>) => sheet.addRow(IMPORT_COLUMNS.map((column) => values[column.header] ?? ""));
  const common = {
    "Property type": "Apartment",
    Currency: "USD",
    Country: "Demo Country",
    City: "Sampleton",
    "Area unit": "sq m",
    Description: "Imported by the automated test. Bright homes close to the park and transport.",
  };
  row({
    ...common,
    Category: "New project",
    Title: projectTitle,
    "Project name": "E2E Import Towers",
    Price: 300000,
    Area: 90,
    Bedrooms: 2,
    "Image URLs": `${IMAGE_BASE}/house.jpg`,
    "Video URLs": "https://www.youtube.com/watch?v=dQw4w9WgXcQ\nhttps://www.instagram.com/reel/C1a2B3c4D5e/",
  });
  row({ ...common, Category: "Rental", Title: rentalTitle, Price: 1200, Area: 60, "Image URLs": `${IMAGE_BASE}/missing.jpg` });
  row({ ...common, Category: "Villa", Title: "Bad category row" });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test("administrator downloads the template", async ({ page }) => {
  await signIn(page, DEMO.admin, DEMO.password, "/admin/import");
  const download = await page.evaluate(async () => {
    const response = await fetch("/admin/import/template");
    return { status: response.status, type: response.headers.get("content-type"), size: (await response.arrayBuffer()).byteLength };
  });
  expect(download.status).toBe(200);
  expect(download.type).toContain("spreadsheetml");
  expect(download.size).toBeGreaterThan(5000);
});

test("administrator checks and imports an Excel file", async ({ page }) => {
  await signIn(page, DEMO.admin, DEMO.password, "/admin/import");
  await page.getByLabel("Spreadsheet").setInputFiles({
    name: "listings.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await importWorkbook(),
  });
  await page.getByLabel("Listings belong to").selectOption({ label: `Demo Builder — ${BUILDER} (builder)` });
  await page.getByLabel("Publish complete listings immediately").check();

  await page.getByRole("button", { name: "Check file" }).click();
  await expect(page.getByText("2 of 3 row(s) are ready to import")).toBeVisible();
  await expect(page.getByText('Category "Villa" is not Rental, Resale or New project')).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Import 2 listings" }).click();
  await expect(page.getByText(/Imported 2 of 2 listing\(s\) from listings\.xlsx/)).toBeVisible();
  await expect(page.getByText(/waiting for their images to download/)).toBeVisible();
});

test("the worker downloads images, then publishes or sends to review", async ({ page }) => {
  await runWorkers(); // downloads images, finalises listings
  await runWorkers(); // publishes photos of listings that went live

  await signIn(page, DEMO.admin, DEMO.password, "/admin/import");
  const recent = page.getByRole("table", { name: "Recent imports" }).locator("tbody tr").first();
  await expect(recent).toContainText("1 live");
  await expect(recent).toContainText("1 in review");

  // The rental's image link was broken, so it has no photo and waits for review.
  await page.goto(`/admin/listings?q=${encodeURIComponent(rentalTitle)}`);
  await expect(page.getByRole("row", { name: new RegExp(rentalTitle.replace(/[[\]]/g, "\\$&")) })).toContainText("Awaiting review");
});

test("imported new project shows photo, builder and click-to-play videos", async ({ page }) => {
  await page.goto("/search?category=new_project");
  await page.getByRole("link", { name: projectTitle }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectTitle })).toBeVisible();
  await expect(page.getByText("E2E Import Towers").first()).toBeVisible();
  await expect(page.getByText("Verified builder")).toBeVisible();
  await expect(page.getByText("[DEMO] Example Builders Ltd")).toBeVisible();

  const photo = page.locator("section[aria-label=Photos] img").first();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // Nothing is loaded from YouTube/Instagram until the visitor presses play.
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("button", { name: /Play YouTube video/ }).click();
  await expect(page.locator("iframe")).toHaveAttribute("src", /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  await page.getByRole("button", { name: /Play Instagram video/ }).click();
  await expect(page.locator('iframe[src*="instagram.com/reel/C1a2B3c4D5e/embed"]')).toHaveCount(1);
});

test("administrators see the videos on the review page", async ({ page }) => {
  await signIn(page, DEMO.admin, DEMO.password, "/admin/listings");
  await page.goto(`/admin/listings?q=${encodeURIComponent(projectTitle)}`);
  await page.getByRole("link", { name: projectTitle }).click();
  await expect(page.getByRole("heading", { name: "Videos (2)" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Play YouTube video/ })).toBeVisible();
  await expect(page.getByText("New project", { exact: true }).first()).toBeVisible();
});
