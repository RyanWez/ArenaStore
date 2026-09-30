# Tests

## Layout

- `unit/` — pure domain logic: money, price, stock, parsers, state transitions
- `integration/` — database repositories, API routes, supplier client with mock HTTP server
- `e2e/` — admin dashboard and customer journey flows once apps exist
- `fixtures/` — synthetic catalog/order/payment fixtures only
- `mocks/` — upstream API and payment provider mock responses

## Current browser coverage

`e2e/catalog-api.spec.ts` verifies that the server-side catalog route fails closed without an upstream key. `e2e/products-demo.spec.ts` verifies catalog search/filter, local selling-settings saves, the compact desktop icon rail/mobile drawer width and alignment, and deduplicated rapid product-status feedback. `e2e/sandbox-preview.spec.ts` verifies that opening a product's selling settings works inside the same kind of sandboxed iframe used by Arena preview.

The Playwright configuration intentionally runs a production `next build` + `next start` server. Next.js development mode blocks client chunks requested from an opaque sandbox iframe, which would otherwise create a visible but non-interactive preview.

## Rules

- Mirror application feature names in test filenames.
- Use `*.test.ts` for Vitest tests and `*.spec.ts` for Playwright E2E tests.
- Never include real token values, real customer information, or actual delivery credentials.
- Any change to pricing, stock, order status, payment handling, or supplier client needs a matching test update.
