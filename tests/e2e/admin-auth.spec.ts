import { expect, test } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "../mocks/admin-api";
import {
  installAdminApiMocks,
  loginAsAdminViaUi,
  openSidebarIfHidden,
  waitForCapturedCall,
} from "./helpers/mock-admin-api";

test.describe("admin auth flow", () => {
  test("redirects unauthenticated visitors from the dashboard to the login page", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Sign In to Dashboard" })).toBeVisible();
  });

  test("logs in with valid credentials and reaches the dashboard", async ({ page }) => {
    const mock = await installAdminApiMocks(page);

    await loginAsAdminViaUi(page);

    const loginCall = await waitForCapturedCall(
      mock,
      (c) => c.method === "POST" && c.pathname === "/api/admin/auth/login"
    );
    expect(loginCall.body).toMatchObject({
      email: E2E_ADMIN_EMAIL,
      password: E2E_ADMIN_PASSWORD,
    });

    await openSidebarIfHidden(page);
    await expect(page.getByRole("link", { name: "Products", exact: true })).toBeVisible();
  });

  test("shows an inline error for invalid credentials", async ({ page }) => {
    await installAdminApiMocks(page, {
      loginError: "Invalid credentials. Please try again.",
    });

    await page.goto("/login");
    await page.locator('input[autocomplete="username"]').fill(E2E_ADMIN_EMAIL);
    await page.locator('input[autocomplete="current-password"]').fill("wrong-password");
    await page.getByRole("button", { name: "Sign In to Dashboard" }).click();

    await expect(page.getByText("Invalid credentials. Please try again.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("logs out from the sidebar and returns to the login page", async ({ page }) => {
    const mock = await installAdminApiMocks(page);

    await loginAsAdminViaUi(page);

    await openSidebarIfHidden(page);
    await page.locator('button[title="Sign out of Admin Portal"]').click();

    await page.waitForURL((url) => url.pathname === "/login");
    await waitForCapturedCall(
      mock,
      (c) => c.method === "POST" && c.pathname === "/api/admin/auth/logout"
    );
    await expect(page.getByRole("button", { name: "Sign In to Dashboard" })).toBeVisible();
  });
});
