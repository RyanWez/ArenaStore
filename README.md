# Arena Store

Telegram-based digital-product storefront with a Myanmar Kyat (MMK) customer experience, an admin dashboard, and a server-side upstream partner API integration.

## Planned workspace

- `apps/admin` — Nuxt 3 + Tailwind CSS + PrimeVue admin dashboard
- `apps/api` — backend API, orders, payments, supplier integration, jobs
- `apps/bot` — Telegram customer bot (grammY)
- `packages/db` — database schema, migrations, repository layer (Drizzle ORM)
- `packages/shared` — shared types, validation, money and domain utilities
- `packages/ui` — shared UI primitives
- `tests` — unit, integration, end-to-end, fixtures, and mocks
- `Memory` — project decisions, specifications, and handover notes for agents

## Rules

Read [`AGENT.md`](./AGENT.md) before modifying the project. Do not place any live secret in this repository.

## Status

Monorepo workspace initialized with pnpm. Dependencies installed across all packages. Implementation roadmap established in `Memory/06_IMPLEMENTATION_ROADMAP.md` covering Phases 1 to 5. Ready for Phase 1 (Database schema & shared core).
