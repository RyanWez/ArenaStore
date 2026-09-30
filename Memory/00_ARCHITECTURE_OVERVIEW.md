# 00 — Architecture Overview

## Purpose

Arena Store is a Telegram-first storefront. Customers browse products and pay in MMK; the backend may fulfil eligible orders through a separately funded upstream partner API priced in USD.

## Planned system

```text
Telegram Customer
      │
      ▼
apps/bot ───────► apps/api ◄────── apps/admin
                      │
              ┌───────┼────────┐
              ▼       ▼        ▼
        PostgreSQL  Redis  Upstream Partner API
```

## Workspace boundaries

| Area | Responsibility |
|---|---|
| `apps/bot` | Telegram menus, customer messages, order flow, support routing |
| `apps/api` | business rules, authentication, orders, pricing, stock, payments, supplier client, jobs |
| `apps/admin` | internal dashboard for products, pricing, orders, payments, customers, settings |
| `packages/db` | schema, migrations, repositories, database types |
| `packages/shared` | shared validation, enums, money helpers, Telegram custom-emoji renderer contracts |
| `packages/ui` | shadcn/ui-based reusable dashboard components only |
| `tests` | unit, integration, e2e, mocks, fixtures |

## Reality-check and research agreement

Before a meaningful technical or product decision, agents must first inspect the local codebase, installed versions, configuration, existing Memory decisions, and tests. When a fact can change over time, agents must also research current information on the web, preferring official documentation and primary provider sources.

Agents must compare viable options against the current project rather than relying only on remembered knowledge. The daily Memory log records the date, sources checked, verified result, decision, and unresolved questions. Assumptions must be labelled; conflicting evidence or material uncertainty must be raised with the user before implementation.

## Core rules

1. The client never accesses the upstream supplier API directly.
2. Arena Store owns all display names, MMK prices, local sales limits, policies, and customer records.
3. The upstream supplier owns upstream USD costs, live supplier stock, and fulfilment delivery data.
4. All order fulfilment is idempotent through an internal order ID plus upstream `externalOrderId`.
5. Initial payment flow should be manual verification before automated payment providers are added.
6. Custom emoji placeholders from supplier text are preserved and transformed only at Telegram rendering time.

## Initial stack decision

- TypeScript / Node.js
- Telegram bot: grammY (TypeScript)
- Backend: Fastify (TypeScript)
- Admin: Nuxt 3 + Tailwind CSS + PrimeVue (v4, Aura theme)
- Database: PostgreSQL + Drizzle ORM
- Jobs/cache: Redis + BullMQ
- Tests: Vitest; Playwright for admin E2E

## Transitional catalog adapter

Until the Fastify-versus-Nest decision is made and `apps/api` is implemented, the Admin Next.js server owns a narrow read-only `GET /api/catalog` adapter. It is server-side only, has no supplier mutation capability, and must move behind Admin authentication before an internet-facing deployment. The eventual `apps/api` supplier client remains the long-term source of truth.

## Not implemented

No live payment, supplier order, persistent local-selling-rule storage, or standalone Arena Store API service has been implemented.
