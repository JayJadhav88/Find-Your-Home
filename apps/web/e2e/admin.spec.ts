import { expect, test } from "@playwright/test";
import { DEMO, signIn } from "./support/helpers";

test.describe("administration and permissions", () => {
  test("administrator sees users with emails and roles", async ({ page }) => {
    await signIn(page, DEMO.admin, DEMO.password, "/admin/users");
    await expect(page.getByText(DEMO.owner, { exact: false })).toBeVisible();
    await expect(page.getByText("Demo Admin (you)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Suspend Demo Buyer" })).toBeVisible();
  });

  test("administrator saves settings and invalid values are explained", async ({ page }) => {
    await signIn(page, DEMO.admin, DEMO.password, "/admin/settings");
    const timeZone = page.getByLabel("Time zone");
    const original = await timeZone.inputValue();

    await timeZone.fill("Mars/Olympus");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Unknown time zone: Mars/Olympus")).toBeVisible();

    await timeZone.fill(original);
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();
  });

  test("administrator adds an amenity that listers can then choose", async ({ page }) => {
    const name = `E2E amenity ${Date.now()}`;
    await signIn(page, DEMO.admin, DEMO.password, "/admin/taxonomy");
    await page.getByLabel("New amenity").fill(name);
    await page.getByRole("button", { name: "Add amenity" }).click();
    await expect(page.getByRole("button", { name: `Save ${name}` })).toBeVisible();

    // Deactivate it again so test runs don't clutter the amenity list.
    const row = page.locator("form", { has: page.getByRole("button", { name: `Save ${name}` }) });
    await row.getByLabel("Active").uncheck();
    await row.getByRole("button", { name: `Save ${name}` }).click();
    await expect(row.getByText("Saved.")).toBeVisible();
  });

  test("CSV exports work for administrators and are audited", async ({ page }) => {
    await signIn(page, DEMO.admin, DEMO.password, "/admin");
    const csv = await page.evaluate(async () => {
      const response = await fetch("/admin/export/listings");
      return { status: response.status, type: response.headers.get("content-type"), firstLine: (await response.text()).split("\r\n")[0] };
    });
    expect(csv.status).toBe(200);
    expect(csv.type).toContain("text/csv");
    expect(csv.firstLine).toContain("reference_code");

    await page.goto("/admin/audit");
    await expect(page.getByText("export.listings").first()).toBeVisible();
  });

  test("moderators cannot open administrator-only pages or exports", async ({ page }) => {
    await signIn(page, DEMO.moderator, DEMO.password, "/admin");
    await page.goto("/admin/settings");
    await expect(page).toHaveURL(/\/admin\?denied=admin-only/);
    await expect(page.getByText("That section is for administrators only.")).toBeVisible();
    const status = await page.evaluate(async () => (await fetch("/admin/export/enquiries")).status);
    expect(status).toBe(403);
  });

  test("buyers cannot open the admin panel", async ({ page }) => {
    await signIn(page, DEMO.buyer, DEMO.password, "/account");
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/account\?denied=admin/);
  });
});
