import { expect, test } from "@playwright/test";

// Runs in the "mobile" project (Pixel 7 viewport).

for (const path of ["/", "/search", "/sign-in", "/about"]) {
  test(`${path} fits a phone screen without sideways scrolling`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("listing page works on a phone", async ({ page }) => {
  await page.goto("/search");
  await page.locator("article h3 a").first().click();
  await expect(page.getByRole("heading", { name: "Key facts" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const button = page.getByRole("button", { name: /Send message/ });
  const box = await button.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});
