import { expect, type Page } from "@playwright/test";
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_ADMIN_TOKEN,
  MOCK_ADMIN_STATS,
  makeAdminOrders,
  makeAdminSettings,
  makeAdminUser,
  makeDepositSlips,
  makeProductCatalog,
  makeSupplierStatus,
  type MockAdminProduct,
  type MockAdminSlip,
} from "../../mocks/admin-api";

export interface CapturedAdminApiCall {
  method: string;
  pathname: string;
  body: unknown;
}

export interface AdminApiMockOptions {
  products?: MockAdminProduct[];
  slips?: MockAdminSlip[];
  /** Error message returned with a 401 from POST /api/admin/auth/login. */
  loginError?: string;
}

export interface AdminApiMock {
  /** Every intercepted /api/admin/** browser request, in order. */
  calls: CapturedAdminApiCall[];
  /** Mutable list state — review actions mutate it so polls see the change. */
  products: MockAdminProduct[];
  slips: MockAdminSlip[];
}

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function jsonBody(route: Route, data: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
}

/**
 * Intercept every same-origin `/api/admin/**` request at the browser level
 * (page.route), so no backend and no upstream supplier are ever contacted.
 * All calls are captured for request-shape assertions.
 */
export async function installAdminApiMocks(
  page: Page,
  options: AdminApiMockOptions = {}
): Promise<AdminApiMock> {
  const state: AdminApiMock = {
    calls: [],
    products: options.products ?? makeProductCatalog(),
    slips: options.slips ?? makeDepositSlips(),
  };

  await page.route("**/api/admin/**", async (route) => {
    try {
      const request = route.request();
      const url = new URL(request.url());
      const pathname = url.pathname;
      const method = request.method();

      let body: unknown = null;
      if (method !== "GET" && method !== "HEAD") {
        try {
          body = request.postDataJSON();
        } catch {
          body = request.postData();
        }
      }
      state.calls.push({ method, pathname, body });

      const respond = (data: unknown, status = 200) => jsonBody(route, data, status);
      const segments = pathname.split("/").filter(Boolean);

      // --- Auth ---
      if (pathname === "/api/admin/auth/login" && method === "POST") {
        if (options.loginError) {
          return respond({ ok: false, error: options.loginError }, 401);
        }
        return respond({ ok: true, token: E2E_ADMIN_TOKEN, user: makeAdminUser() });
      }
      if (pathname === "/api/admin/auth/me") {
        return respond({ ok: true, user: makeAdminUser() });
      }
      if (pathname === "/api/admin/auth/logout") {
        return respond({ ok: true });
      }

      // --- Products ---
      if (pathname === "/api/admin/products" && method === "GET") {
        return respond({ ok: true, products: state.products });
      }
      if (segments[2] === "products" && segments.length === 4 && method === "PUT") {
        const productId = segments[3];
        const product = state.products.find((p) => p.id === productId);
        if (product && body && typeof body === "object" && "isActive" in body) {
          product.isActive = Boolean((body as { isActive: unknown }).isActive);
        }
        return respond({ ok: true });
      }

      // --- Supplier ---
      if (pathname === "/api/admin/supplier/status") {
        return respond(makeSupplierStatus());
      }
      if (pathname === "/api/admin/supplier/sync" && method === "POST") {
        return respond({ ok: true, synced: { categories: 2, products: state.products.length } });
      }

      // --- Settings ---
      if (pathname === "/api/admin/settings" && method === "GET") {
        return respond(makeAdminSettings());
      }
      if (pathname === "/api/admin/settings" && method === "PUT") {
        return respond({ ok: true });
      }

      // --- Deposits (wallet top-up slips) ---
      if (pathname === "/api/admin/deposits" && method === "GET") {
        return respond({ ok: true, slips: state.slips });
      }
      if (segments[2] === "deposits" && segments[4] === "review" && method === "POST") {
        const slip = state.slips.find((s) => s.id === segments[3]);
        const action = (body as { action?: string } | null)?.action;
        if (slip && action === "APPROVE") slip.status = "COMPLETED";
        if (slip && action === "REJECT") slip.status = "REJECTED";
        return respond({ ok: true });
      }
      if (segments[2] === "deposits" && segments[4] === "slip-image") {
        return route.fulfill({ status: 200, contentType: "image/png", body: PNG_1PX });
      }
      if (segments[2] === "telegram-file") {
        return route.fulfill({ status: 200, contentType: "image/png", body: PNG_1PX });
      }

      // --- Dashboard ---
      if (pathname === "/api/admin/stats") {
        return respond(MOCK_ADMIN_STATS);
      }
      if (pathname === "/api/admin/orders") {
        return respond(makeAdminOrders());
      }

      // Anything unhandled answers generically so background calls never error.
      return respond({ ok: true });
    } catch (err) {
      console.error("[e2e] admin api mock failed:", err);
      return jsonBody(route, { ok: true });
    }
  });

  return state;
}

/** Wait until an intercepted call matching the predicate has been captured. */
export async function waitForCapturedCall(
  mock: AdminApiMock,
  predicate: (call: CapturedAdminApiCall) => boolean,
  timeout = 5_000
): Promise<CapturedAdminApiCall> {
  await expect
    .poll(() => mock.calls.some(predicate), { timeout, interval: 100 })
    .toBe(true);
  return mock.calls.find(predicate)!;
}

/**
 * Log in through the real login form. All navigation after this must stay
 * client-side (sidebar links) — a full page reload with the session cookie
 * would trigger the SSR auth check through the Nitro proxy, which has no
 * backend behind it in E2E.
 */
export async function loginAsAdminViaUi(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[autocomplete="username"]').fill(E2E_ADMIN_EMAIL);
  await page.locator('input[autocomplete="current-password"]').fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign In to Dashboard" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

/** The sidebar is hidden behind a hamburger on viewports below `lg`. */
export async function openSidebarIfHidden(page: Page): Promise<void> {
  const aside = page.locator("aside");
  if (!(await aside.isVisible())) {
    await page.getByRole("button", { name: "Toggle Navigation" }).click();
  }
  await expect(aside).toBeVisible();
}

/** Navigate client-side via a sidebar link, mirroring real admin usage. */
export async function navigateToAdminPage(
  page: Page,
  linkName: string | RegExp,
  path: string
): Promise<void> {
  await openSidebarIfHidden(page);
  await page.getByRole("link", { name: linkName }).first().click();
  await page.waitForURL((url) => url.pathname === path);
}
