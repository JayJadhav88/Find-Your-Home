import { expect, test, type Page } from "@playwright/test";

async function expectAccessibleForm(page: Page) {
  const problems = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("body [id]")].map((element) => element.id);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const unlabeled = [...document.querySelectorAll("main input:not([type=hidden]), main select, main textarea")]
      .filter(
        (element) =>
          !(element.id && document.querySelector(`label[for="${element.id}"]`)) &&
          !element.closest("label") &&
          !element.getAttribute("aria-label"),
      )
      .map((element) => element.getAttribute("name"));
    return { duplicateIds, unlabeled };
  });
  expect(problems).toEqual({ duplicateIds: [], unlabeled: [] });
}

test.describe("public site", () => {
  test("home page shows the search form and recent listings", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Search" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recently listed" })).toBeVisible();
    await expect(page.locator("article").first()).toBeVisible();
  });

  test("search filters by purpose, sorts by price and keeps filters in the URL", async ({ page }) => {
    await page.goto("/search?purpose=rent&sort=price_asc");
    await expect(page.getByRole("heading", { name: /Showing \d+ home/ })).toBeVisible();
    const purposes = await page.locator("article .rounded-full").allTextContents();
    expect(purposes.filter((text) => text === "For sale")).toHaveLength(0);
    const prices = (await page.locator("article p.text-lg").allTextContents())
      .filter((text) => !text.includes("request"))
      .map((text) => Number(text.replace(/[^\d.]/g, "")));
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    await expect(page.getByRole("link", { name: "Price: low to high" })).toHaveAttribute("aria-current", "true");
    await expectAccessibleForm(page);
  });

  test("a search with no matches explains what to do", async ({ page }) => {
    await page.goto("/search?q=zzzzzz-no-such-home");
    await expect(page.getByText("No homes match these filters")).toBeVisible();
    await expect(page.getByRole("link", { name: "Clear all filters" })).toBeVisible();
  });

  test("listing page has facts, structured data and a canonical URL", async ({ page }) => {
    await page.goto("/search");
    const firstListing = page.locator("article h3 a").first();
    const href = await firstListing.getAttribute("href");
    await firstListing.click();
    await page.waitForURL(`**${href}`);
    await expect(page.getByRole("heading", { name: "Key facts" })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${href}$`));
    const jsonLd = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
    expect(jsonLd["@type"]).toBe("RealEstateListing");
    await expect(page.getByRole("heading", { name: "Contact the lister" })).toBeVisible();
  });

  test("an outdated listing slug redirects to the canonical URL", async ({ page }) => {
    await page.goto("/search");
    const href = (await page.locator("article h3 a").first().getAttribute("href"))!;
    const reference = href.split("/")[2]!;
    await page.goto(`/properties/${reference}/old-title`);
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });

  test("unknown pages show a helpful 404", async ({ page }) => {
    const response = await page.goto("/properties/FYH-999999/nothing-here");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("private areas send visitors to sign in and keep the destination", async ({ page }) => {
    await page.goto("/account/listings");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount%2Flistings/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fadmin/);
  });

  test("robots.txt and sitemap exclude private areas and list published homes", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toContain("Disallow: /account");
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("/properties/FYH-");
    expect(sitemap).not.toContain("/admin");
  });

  test("CSV exports are refused without an administrator session", async ({ request }) => {
    const response = await request.get("/admin/export/enquiries", { maxRedirects: 0 });
    expect([302, 303, 307, 403]).toContain(response.status());
  });

  test("sign-in and sign-up forms are labelled", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expectAccessibleForm(page);
    await page.goto("/sign-up");
    await expect(page.getByLabel("Your name")).toBeVisible();
    await expectAccessibleForm(page);
  });
});
