# 01 — Database Schema

## Status

Schema designed and implemented via Drizzle ORM in `packages/db`. Core entities support both upstream partner mapping and the **Prepaid Wallet Architecture**.

## Primary Entities

| Entity | Purpose | Key Fields |
|---|---|---|
| `users` | Telegram customers and admin staff | `id`, `telegramId`, `username`, `firstName`, `role`, `status`, `createdAt` |
| `wallets` | Customer live prepaid MMK wallet balances | `id`, `userId`, `balanceMmk`, `totalDepositedMmk`, `totalSpentMmk`, `updatedAt` |
| `topup_requests` | Wallet deposit slip submissions | `id`, `userId`, `amountMmk`, `reference`, `paymentMethod` (KPAY/WAVEPAY), `slipFileId`, `status` (PENDING/SUBMITTED/APPROVED/REJECTED), `approvedAt` |
| `wallet_ledger` | Immutable audit trail of all credits and debits | `id`, `walletId`, `amountMmk`, `type` (TOPUP_CREDIT/ORDER_DEBIT/REFUND_CREDIT), `referenceId`, `createdAt` |
| `categories` | Arena Store product categories | `id`, `name`, `cleanName`, `emojiId`, `sortOrder`, `active` |
| `products` | Local sellable products mapped to upstream | `id`, `categoryId`, `upstreamProductId`, `name`, `cleanName`, `emojiId`, `retailPriceMmk`, `stockLimit`, `active` |
| `product_supplier_snapshots` | Latest read-only supplier catalog state | `id`, `productId`, `supplierPriceUsd`, `supplierStock`, `deliveryType`, `syncedAt` |
| `orders` | Customer product purchases (Wallet-funded) | `id`, `publicOrderNo`, `userId`, `totalMmk`, `status` (DELIVERED/PROCESSING/CANCELLED/REFUNDED), `paymentSource` (WALLET), `externalOrderId`, `createdAt` |
| `order_items` | Products and quantities inside an order | `id`, `orderId`, `productId`, `quantity`, `unitPriceMmk`, `subtotalMmk` |
| `order_deliveries` | Encrypted digital credentials delivered | `id`, `orderId`, `encryptedCredentials` (AES-256-GCM), `deliveryType`, `deliveredAt` |
| `stock_reservations` | Real-time stock availability locks | `id`, `productId`, `quantity`, `expiresAt` |
| `audit_logs` | Immutable admin audit trail | `id`, `actorId`, `action`, `entityType`, `entityId`, `payload`, `createdAt` |

## Money & Valuation Rules

1. **Integer MMK:** All local currency amounts are stored strictly as integer Kyats (e.g. `3900`, `50000`), never JavaScript floating-point numbers.
2. **Decimal USD:** Upstream USD supplier prices are stored as decimal strings (e.g. `"0.69"`).
3. **Atomic Wallet Transactions:** Order purchases perform atomic balance checks and deductions (`balanceMmk >= totalMmk`) within database transactions to completely prevent double-spending or negative balances.

## Stock Calculation Rule

```text
customer_sellable_stock = min(
  supplier_stock,
  wallet_affordable_units,
  product_local_limit
) - active_reserved_units
```
Implementation clamps at `0` and verifies availability in real-time prior to order placement.
