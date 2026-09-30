# 02 — API Specification

## Status

Supplier API was read-only tested on 2026-09-30. The Admin app now has a server-only, read-only catalog adapter at `GET /api/catalog`; it returns a safe configuration error until its server environment variables are set. No order, payment, or supplier mutation endpoint is implemented.

## Upstream Partner API

- Base URL: `http://paid2.daki.cc:4153/api/partner/v1`
- Authentication: `Authorization: Bearer <server-side-secret>`
- Real secret must never be written in this file, source code, tests, or client-side code.

### Verified read-only endpoints

| Method | Path | Actual response notes |
|---|---|---|
| GET | `/balance` | returned `{ ok, balance, currency, userId }` |
| GET | `/catalog/categories` | returned category records in `data` |
| GET | `/catalog/products?inStock=true` | returned product records in `data` |
| GET | `/usage` | returned balance, order/spend count, rate limits |

### Documented endpoints to integrate later

| Method | Path | Use |
|---|---|---|
| GET | `/health` | supplier health check |
| GET | `/catalog/products/{id}` | one product / live stock refresh |
| POST | `/orders` | create supplier order — real money operation |
| GET | `/orders` | supplier order history |
| GET | `/orders/{id}` | order recovery / delivery lookup |

### Important observed response differences

The API documentation example uses `products`, but the live catalog response observed on 2026-09-30 used `data`.

Actual observed product fields include:

```ts
{
  productId: number;
  name: string;
  description: string;
  categoryId: number | null;
  deliveryType: 'TEXT' | 'FILE' | 'LINK' | 'CREDENTIALS' | 'LICENSE';
  price: number;
  yourPrice: number;
  discountPct: number;
  currency: 'USD';
  stock: number;
  inStock: boolean;
}
```

Supplier text contains premium-emoji placeholders such as `{pe:5353054453832368599}`. Preserve raw supplier text. Transform it to Telegram custom-emoji markup only when sending a Telegram message.

## Current Admin catalog read model

`GET /api/catalog` is an interim Admin-server adapter while the standalone `apps/api` framework choice remains open. It uses the configured server-side supplier key and returns normalized catalog/category/wallet availability data; it does not return the key or call any mutation endpoint.

Performance rules for this snapshot:

- Products, categories, and balance are fetched concurrently on a cache miss.
- Next Data Cache TTLs: products 5 minutes, categories 1 hour, wallet 30 seconds.
- The HTTP response is `private, no-store`; upstream cost and wallet capacity must not enter a shared browser/CDN cache.
- USD wallet-capacity math uses integer micro-units, not JavaScript floating point.
- Add Admin authentication before this endpoint is exposed on an internet-facing deployment.

## Arena Store API design principles

- Admin and Bot call the Arena Store backend, never the supplier directly.
- Validate every input with shared schemas.
- All errors use a stable code, a safe customer message, and a trace/request ID in logs.
- Supplier order calls require the internal order state to be payment-confirmed and use a deterministic `externalOrderId`.
- A network retry must reuse the same external order ID.
- Delivery fields are encrypted before persistence and never returned by ordinary admin list endpoints.

## Security baseline

- Secret header injected only by backend runtime environment.
- Timeout supplier requests; retry only safe idempotent reads or idempotent orders.
- Rate-limit public/admin routes.
- Log request IDs and safe error codes, never Authorization headers or delivery credentials.
