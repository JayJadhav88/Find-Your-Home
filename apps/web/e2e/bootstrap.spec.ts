import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { strongPassword, uniqueEmail } from "./support/helpers";
import { repoRoot, stack } from "./support/stack";

// The first-admin setup command: a one-time password that must be replaced at first sign-in.
test("first admin signs in with the one-time password and must choose a new one", async ({ page }) => {
  const { apiUrl, secretKey } = stack();
  const email = uniqueEmail("bootstrap");
  const fileName = `e2e-${Date.now()}.txt`;
  const file = path.join(repoRoot, ".secrets", fileName);

  execFileSync("node", ["scripts/admin-bootstrap.mjs", "--create", "--email", email, "--file", fileName], {
    cwd: repoRoot,
    env: { ...process.env, SUPABASE_URL: apiUrl, SUPABASE_SECRET_KEY: secretKey },
    stdio: "ignore",
  });
  const oneTimePassword = readFileSync(file, "utf8").match(/^Password: (.+)$/m)![1]!;
  rmSync(file);

  await page.goto("/sign-in?next=/admin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(oneTimePassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Every account and admin page sends them to choose a password first.
  await expect(page).toHaveURL(/\/reset-password\?required=1/);
  await expect(page.getByText("Choose your own password first")).toBeVisible();
  await page.goto("/admin/team");
  await expect(page).toHaveURL(/\/reset-password\?required=1/);

  const newPassword = strongPassword();
  await page.getByLabel(/^New password/).fill(newPassword);
  await page.getByLabel("Repeat the new password").fill(newPassword);
  await page.getByRole("button", { name: "Save new password" }).click();
  await page.waitForURL(/\/account/);

  await page.goto("/admin/team");
  await expect(page.getByRole("heading", { name: "Team & roles" })).toBeVisible();
  await expect(page.getByText(`${email.split("@")[0]} (you)`)).toBeVisible();

  // The one-time password no longer works.
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(oneTimePassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
});
