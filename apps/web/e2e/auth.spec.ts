import { expect, test } from "@playwright/test";
import { emailLink, signIn, strongPassword, uniqueEmail } from "./support/helpers";

test.describe("accounts", () => {
  test("sign up, confirm by email, then sign in", async ({ page }) => {
    const email = uniqueEmail("e2e.signup");
    const password = strongPassword();

    await page.goto("/sign-up");
    await page.getByLabel("Your name").fill("E2E Sign-up");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("alert")).toContainText("Use at least 10 characters");
    await expect(page.getByLabel("Email")).toHaveValue(email);

    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(`Check ${email} for a confirmation link`)).toBeVisible();

    // Signing in before confirming is refused with a clear message.
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel(/^Password/).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toContainText("confirm your email");

    await page.goto(await emailLink(email, "Confirm"));
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { name: "Hello, E2E Sign-up" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await signIn(page, email, password);
    await expect(page.getByRole("heading", { name: "Hello, E2E Sign-up" })).toBeVisible();
  });

  test("reset a forgotten password", async ({ page }) => {
    const email = uniqueEmail("e2e.reset");
    const password = strongPassword();
    const newPassword = strongPassword();

    await page.goto("/sign-up");
    await page.getByLabel("Your name").fill("E2E Reset");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Almost there")).toBeVisible();
    await page.goto(await emailLink(email, "Confirm"));
    await expect(page).toHaveURL(/\/account$/);
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL((url) => url.pathname === "/");

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("If an account exists for that address")).toBeVisible();

    await page.goto(await emailLink(email, "Reset"));
    await expect(page).toHaveURL(/\/reset-password$/);
    await page.getByLabel(/^New password/).fill(newPassword);
    await page.getByLabel("Repeat the new password").fill("Different12345");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByRole("alert")).toContainText("Passwords do not match");

    await page.getByLabel(/^New password/).fill(newPassword);
    await page.getByLabel("Repeat the new password").fill(newPassword);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page).toHaveURL(/notice=password-updated/);
    await expect(page.getByText("Your password has been changed.")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel(/^Password/).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toContainText("Email or password is incorrect");
    await signIn(page, email, newPassword);
  });

  test("forgot-password does not reveal whether an account exists", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(uniqueEmail("e2e.nobody"));
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("If an account exists for that address")).toBeVisible();
  });
});
