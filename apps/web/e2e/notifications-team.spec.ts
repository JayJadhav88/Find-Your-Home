import { expect, test } from "@playwright/test";
import { DEMO, runWorkers, signIn } from "./support/helpers";

// Phase 3b: notifications, saved searches, reports, team pages and broadcasts.

test.describe("notifications, saved searches and team tools", () => {
  test("a member saves a search and manages its alerts", async ({ page }) => {
    await signIn(page, DEMO.buyer, DEMO.password, "/search?category=rental");
    const name = `E2E rentals ${Date.now()}`;
    await page.getByPlaceholder("e.g. 2BHK in Pune").fill(name);
    await page.getByRole("button", { name: "Save search & get alerts" }).click();
    await expect(page.getByText("Saved. We'll tell you when new homes match.")).toBeVisible();

    await page.goto("/account/saved-searches");
    await expect(page.getByRole("link", { name })).toBeVisible();
    await page.getByRole("button", { name: `Pause alerts for ${name}` }).click();
    await expect(page.getByRole("button", { name: `Turn on alerts for ${name}` })).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: `Delete ${name}` }).click();
    await expect(page.getByRole("link", { name })).toHaveCount(0);
  });

  test("WhatsApp needs a number with country code and keeps what was typed", async ({ page }) => {
    await signIn(page, DEMO.buyer, DEMO.password, "/account/notifications");
    const consent = page.getByLabel(/I agree to receive messages about my account/);
    await consent.check();
    await page.getByLabel("WhatsApp number").fill("98765 43210");
    await page.getByRole("button", { name: "Save notification settings" }).click();
    await expect(page.getByText("Enter the number with country code")).toBeVisible();
    await expect(consent).toBeChecked();
    await expect(page.getByLabel("WhatsApp number")).toHaveValue("98765 43210");

    await consent.uncheck();
    await page.getByLabel("WhatsApp number").fill("");
    await page.getByRole("button", { name: "Save notification settings" }).click();
    await expect(page.getByText("Notification settings saved.")).toBeVisible();
  });

  test("a visitor reports a listing and moderators see it with warnings", async ({ page }) => {
    await page.goto("/search?category=rental");
    await page.getByRole("link", { name: /\[DEMO\] Studio for rent/ }).first().click();
    await page.getByText("Report this listing").click();
    await page.getByLabel("What's wrong?").selectOption("wrong_info");
    await page.getByLabel("Details (optional)").fill("E2E: photos don't match.");
    await page.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByText("Thank you. Our moderators will take a look.")).toBeVisible();

    await signIn(page, DEMO.moderator, DEMO.password, "/admin/reports");
    await expect(page.getByText("E2E: photos don't match.").first()).toBeVisible();
    await page.getByRole("link", { name: /\[DEMO\] Studio for rent/ }).first().click();
    await expect(page.getByText("Check before approving")).toBeVisible();
  });

  test("the admin menu follows each team role", async ({ page }) => {
    await signIn(page, DEMO.moderator, DEMO.password, "/admin");
    const menu = page.getByRole("navigation", { name: "Admin" });
    await expect(menu.getByRole("link", { name: "Reports" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Enquiries" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Integrations" })).toHaveCount(0);
    await expect(menu.getByRole("link", { name: "Send a message" })).toHaveCount(0);
    await page.goto("/admin/integrations");
    await expect(page).toHaveURL(/\/admin\?denied=/);
  });

  test("an administrator sends a message to the team and it reaches the inbox", async ({ page }) => {
    await signIn(page, DEMO.admin, DEMO.password, "/admin/broadcasts");
    const title = `E2E team note ${Date.now()}`;
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Message").fill("Checking that broadcasts arrive.");
    await page.getByLabel("Audience").selectOption("team");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText(/Sending now/)).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveValue("");

    await runWorkers();
    await page.goto("/account/notifications");
    await expect(page.getByText(title)).toBeVisible();
  });

  test("integrations and enquiries pages load for the administrator", async ({ page }) => {
    await signIn(page, DEMO.admin, DEMO.password, "/admin/integrations");
    await expect(page.getByRole("heading", { name: "Email (Resend)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "WhatsApp (Meta WhatsApp Cloud API)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Google Sheets (enquiries)" })).toBeVisible();
    await page.getByRole("button", { name: "Send a test email to me" }).click();
    await expect(page.getByText(/Test queued for your email/)).toBeVisible();

    await page.goto("/admin/enquiries");
    await expect(page.getByRole("heading", { name: "Enquiries" })).toBeVisible();
    await expect(page.getByText("Follow-up due")).toBeVisible();
  });
});
