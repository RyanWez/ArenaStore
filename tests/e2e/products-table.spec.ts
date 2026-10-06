import { expect, test } from "@playwright/test";
import {
  installAdminApiMocks,
  loginAsAdminViaUi,
  navigateToAdminPage,
  waitForCapturedCall,
  type AdminApiMock,
} from "./helpers/mock-admin-api";

test.describe("products table", () => {
  let mock: AdminApiMock;

  test.beforeEach(async ({ page }) => {
    mock = await installAdminApiMocks(page);
    await loginAsAdminViaUi(page);
    await navigateToAdminPage(page, "Products", "/products");
  });

  test("renders the catalog table with names, prices and stock badges", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Products & Catalog Management" })).toBeVisible();

    const netflixRow = page.locator("tbody tr", { hasText: "Netflix Premium (1 Month)" });
    await expect(netflixRow).toBeVisible();
    await expect(netflixRow.getByText("Streaming")).toBeVisible();
    await expect(netflixRow.getByText("$2.50")).toBeVisible();
    await expect(netflixRow.getByText("15,000 Ks")).toBeVisible();
    await expect(netflixRow.getByText("40 in stock")).toBeVisible();
    await expect(netflixRow.getByText("40 available")).toBeVisible();
    await expect(netflixRow.getByText("Selling", { exact: true })).toBeVisible();

    const spotifyRow = page.locator("tbody tr", { hasText: "Spotify Premium (1 Month)" });
    await expect(spotifyRow.getByText("Paused", { exact: true })).toBeVisible();

    const canvaRow = page.locator("tbody tr", { hasText: "Canva Pro (1 Year)" });
    await expect(canvaRow.getByText("0 available")).toBeVisible();
  });

  test("filters the table with the paused status pill", async ({ page }) => {
    const netflixRow = page.locator("tbody tr", { hasText: "Netflix Premium (1 Month)" });
    const spotifyRow = page.locator("tbody tr", { hasText: "Spotify Premium (1 Month)" });
    await expect(netflixRow).toBeVisible();
    await expect(spotifyRow).toBeVisible();

    await page.getByRole("button", { name: "Paused (1)" }).click();

    await expect(netflixRow).toBeHidden();
    await expect(spotifyRow).toBeVisible();
  });

  test("pauses a product through the confirm dialog and sends the PUT update", async ({ page }) => {
    const netflixRow = page.locator("tbody tr", { hasText: "Netflix Premium (1 Month)" });
    await expect(netflixRow.getByText("Selling", { exact: true })).toBeVisible();

    await netflixRow.locator('button[title="Active on Bot (Click to pause)"]').click();

    await expect(page.getByText("Pause Product from Telegram Store?")).toBeVisible();
    // Non-exact: the button's accessible name carries an icon glyph first.
    await page.getByRole("button", { name: "Pause Product" }).click();

    const putCall = await waitForCapturedCall(
      mock,
      (c) => c.method === "PUT" && c.pathname === "/api/admin/products/PRD-1001"
    );
    expect(putCall.body).toMatchObject({ isActive: false });

    await expect(netflixRow.getByText("Paused", { exact: true })).toBeVisible();
    await expect(
      netflixRow.locator('button[title="Paused on Bot (Click to activate)"]')
    ).toBeVisible();
    await expect(page.getByText("is now PAUSED (hidden from Bot)")).toBeVisible();
  });

  test("syncs the upstream catalog and shows the completion toast", async ({ page }) => {
    await page.getByRole("button", { name: /Sync (All Suppliers|Upstream Catalog)/ }).click();

    await waitForCapturedCall(
      mock,
      (c) =>
        c.method === "POST" &&
        (c.pathname === "/api/admin/supplier/sync" ||
          c.pathname === "/api/admin/suppliers/all/sync")
    );
    await expect(page.getByText(/Catalog synced successfully/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Sync (All Suppliers|Upstream Catalog)/ })).toBeEnabled();
  });
});
