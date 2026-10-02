import { expect, test } from "@playwright/test";
import {
  installAdminApiMocks,
  loginAsAdminViaUi,
  navigateToAdminPage,
  waitForCapturedCall,
  type AdminApiMock,
} from "./helpers/mock-admin-api";

test.describe("deposit slips review", () => {
  let mock: AdminApiMock;

  test.beforeEach(async ({ page }) => {
    mock = await installAdminApiMocks(page);
    await loginAsAdminViaUi(page);
    await navigateToAdminPage(page, /Deposit Slips/, "/payments");
  });

  test("renders deposit slips with statuses, amounts and actions", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Wallet Deposit Slips & Verification" })
    ).toBeVisible();

    const pendingRow = page.locator("tbody tr", { hasText: "TOP-7001" });
    await expect(pendingRow).toBeVisible();
    await expect(pendingRow.getByText("Aung Aung")).toBeVisible();
    await expect(pendingRow.getByText("+10,000 Ks")).toBeVisible();
    await expect(pendingRow.getByText("Review", { exact: true })).toBeVisible();
    await expect(pendingRow.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(pendingRow.getByRole("button", { name: "Reject" })).toBeVisible();

    await expect(
      page.locator("tbody tr", { hasText: "TOP-7002" }).getByText("Approved", { exact: true })
    ).toBeVisible();
    await expect(
      page.locator("tbody tr", { hasText: "TOP-7003" }).getByText("Rejected", { exact: true })
    ).toBeVisible();
  });

  test("approves a submitted slip and captures the review call", async ({ page }) => {
    const pendingRow = page.locator("tbody tr", { hasText: "TOP-7001" });
    await expect(pendingRow.getByText("Review", { exact: true })).toBeVisible();

    await pendingRow.getByRole("button", { name: "Approve" }).click();

    const reviewCall = await waitForCapturedCall(
      mock,
      (c) => c.method === "POST" && c.pathname === "/api/admin/deposits/DEP-7001/review"
    );
    expect(reviewCall.body).toMatchObject({ action: "APPROVE" });

    await expect(pendingRow.getByText("Approved", { exact: true })).toBeVisible();
    await expect(page.getByText("Wallet Credited")).toBeVisible();
  });

  test("rejects a submitted slip with the default reason", async ({ page }) => {
    const pendingRow = page.locator("tbody tr", { hasText: "TOP-7001" });
    await expect(pendingRow.getByText("Review", { exact: true })).toBeVisible();

    await pendingRow.getByRole("button", { name: "Reject" }).click();

    await expect(page.getByText("Reject Deposit Slip")).toBeVisible();
    await page.getByRole("button", { name: "Confirm Rejection" }).click();

    const reviewCall = await waitForCapturedCall(
      mock,
      (c) => c.method === "POST" && c.pathname === "/api/admin/deposits/DEP-7001/review"
    );
    expect(reviewCall.body).toMatchObject({
      action: "REJECT",
      rejectReason: "ပြေစာ လွဲမှားနေပါသည် ခင်ဗျာ။",
    });

    await expect(pendingRow.getByText("Rejected", { exact: true })).toBeVisible();
  });

  test("renders the slip proof image from the mocked slip endpoint", async ({ page }) => {
    const pendingRow = page.locator("tbody tr", { hasText: "TOP-7001" });

    const slipImage = pendingRow.locator('img[alt="Slip preview"]');
    await expect(slipImage).toBeVisible();
    await expect(slipImage).toHaveAttribute("src", "/api/admin/deposits/DEP-7001/slip-image");

    await waitForCapturedCall(mock, (c) => c.pathname === "/api/admin/deposits/DEP-7001/slip-image");
  });
});
