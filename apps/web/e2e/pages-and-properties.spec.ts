import { expect, test } from "@playwright/test";
import { DEMO, signIn } from "./support/helpers";

// Show/hide password, the team's own HTML pages (sandboxed), and super admin property tools.

test("the password field has a Show / Hide button", async ({ page }) => {
  await page.goto("/sign-in");
  const password = page.locator("input[name=password]");
  await password.fill("Secret12345");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(password).toHaveAttribute("type", "password");
});

test("a super admin publishes an HTML page whose scripts run but cannot read sign-ins", async ({ page }) => {
  const title = `E2E Offer ${Date.now()}`;
  await signIn(page, DEMO.admin, DEMO.password, "/admin/content");
  await page.getByPlaceholder("Home loans").fill(title);
  await page.getByLabel("Type").selectOption("html");
  await page.getByRole("button", { name: "Add page" }).click();
  await expect(page).toHaveURL(/\/admin\/content\/e2e-offer-/);
  const slug = page.url().split("/").pop()!;

  await page.getByLabel("HTML", { exact: true }).fill(
    '<h1 class="big">Festive offer</h1><p id="out">waiting</p>' +
      "<style>.big{color:rgb(200, 0, 0)}</style>" +
      '<script>var r=["ran"];try{r.push("cookie:"+document.cookie)}catch(e){r.push("cookie blocked")}' +
      'document.getElementById("out").textContent=r.join(" | ")</script>',
  );
  await page.getByLabel("Published").check();
  await page.getByLabel("Link in the footer").check();
  await page.getByRole("button", { name: "Save page" }).click();
  await expect(page.getByText("Page saved.")).toBeVisible();

  // Visitors see it inside the site layout, linked from the footer.
  await page.context().clearCookies();
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(new RegExp(`/pages/${slug}$`));
  const frame = page.frameLocator(`iframe[title="${title}"]`);
  await expect(frame.getByRole("heading", { name: "Festive offer" })).toHaveCSS("color", "rgb(200, 0, 0)");
  await expect(frame.locator("#out")).toHaveText("ran | cookie blocked");

  // Clean up.
  await signIn(page, DEMO.admin, DEMO.password, `/admin/content/${slug}`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete page" }).click();
  await expect(page).toHaveURL(/\/admin\/content$/);
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);
});

test("standard pages cannot be deleted", async ({ page }) => {
  await signIn(page, DEMO.admin, DEMO.password, "/admin/content/about");
  await expect(page.getByRole("button", { name: "Delete page" })).toHaveCount(0);
  await expect(page.getByText("can't be deleted")).toBeVisible();
});

test("super admins get Add property, Edit details and Delete permanently", async ({ page }) => {
  await signIn(page, DEMO.admin, DEMO.password, "/admin/listings?status=published");
  await expect(page.getByRole("link", { name: "Add property" })).toHaveAttribute("href", "/account/listings/new");
  await page.locator("tbody tr").first().getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: "Delete permanently" })).toBeVisible();
  await page.getByRole("link", { name: "Edit details and photos" }).click();
  await expect(page.getByText("Editing as a super admin")).toBeVisible();
  await expect(page.getByRole("button", { name: /Save/ }).first()).toBeVisible();
});

test("moderators do not get the delete or edit tools", async ({ page }) => {
  await signIn(page, DEMO.moderator, DEMO.password, "/admin/listings?status=published");
  await expect(page.getByRole("link", { name: "Add property" })).toHaveCount(0);
  await page.locator("tbody tr").first().getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: "Delete permanently" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Edit details and photos" })).toHaveCount(0);
});
