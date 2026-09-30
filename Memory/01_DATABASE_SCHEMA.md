# 01 — Database Schema

## Status

Draft domain model. No database migration has been created yet.

## Planned entities

| Entity | Purpose | Key fields |
|---|---|---|
| `users` | Telegram customers and staff identities | telegramId, username, role, status |
| `categories` | Arena Store product groupings | name, slug, sortOrder, active |
| `products` | Local sellable products mapped to upstream products | upstreamProductId, MMK price, limits, active |
| `product_supplier_snapshots` | Latest read-only supplier catalog state | USD cost, supplier stock, deliveryType, syncedAt |
| `orders` | Internal source of truth for customer purchases | publicOrderNo, status, totals, externalOrderId |
| `order_items` | Product, quantity, local price and supplier cost snapshot | productId, quantity, unitPriceMmk |
| `order_deliveries` | Encrypted delivery payload and delivery status | orderId, encryptedPayload, deliveredAt |
| `payment_submissions` | Manual proof / automated provider records | orderId, method, reference, status |
| `wallet_ledger` | Optional customer wallet credits/debits | userId, amountMmk, reason |
| `stock_reservations` | Time-limited held quantity before payment expiry | productId, orderId, quantity, expiresAt |
| `promo_codes` | Discounts and usage limits | code, type, value, startsAt, endsAt |
| `referrals` | Referrer relationship and reward state | referrerId, referredId, status |
| `support_tickets` | Customer support context | userId, orderId, status, assignedTo |
| `audit_logs` | Immutable privileged admin actions | actorId, action, entityType, entityId |
| `app_settings` | Encrypted/controlled system settings | key, value, updatedAt |

## Money rules

- Store MMK in integer kyat units, e.g. `7500`, never `7500.00` JavaScript floats.
- Store USD supplier values in decimal-safe string/decimal fields, never native JavaScript floating-point numbers.
- Copy effective customer price and supplier cost into order item snapshots at checkout.

## Stock rule

```text
customer_sellable_stock = min(
  supplier_stock,
  wallet_affordable_units,
  product_local_limit
) - active_reserved_units
```

The implementation must clamp at zero and recalculate before supplier ordering.

## Required indexes (later)

- unique `users.telegram_id`
- unique `products.upstream_product_id` where relevant
- unique `orders.public_order_no`
- unique `orders.external_order_id`
- unique `order_items(order_id, product_id)` when one line per product is enforced
- index active reservations by `(product_id, expires_at)`
- index order list views by `(status, created_at)`

## Required audit events

Product price changes, local stock-limit changes, payment approval/rejection, wallet adjustments, order retries, delivery resend, role changes, and settings changes.
