import { expect, test } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "../mocks/admin-api";
import {
  installAdminApiMocks,
  loginAsAdminViaUi,
  openSidebarIfHidden,
  sidebarLogoutButton,
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
    // Accessible names carry a PrimeIcons glyph before the label, so avoid
    // exact matching (and "Product Orders" also contains "Product").
    await expect(
      page.locator("aside:visible").getByRole("link", { name: "Products" }).first()
    ).toBeVisible();
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
    await sidebarLogoutButton(page).click();

    await page.waitForURL((url) => url.pathname === "/login");
    await waitForCapturedCall(
      mock,
      (c) => c.method === "POST" && c.pathname === "/api/admin/auth/logout"
    );
    await expect(page.getByRole("button", { name: "Sign In to Dashboard" })).toBeVisible();
  });
});
