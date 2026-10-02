# Arena Store — Agent Operating Rules

This repository is the source of truth for the Arena Store Telegram commerce project. Every agent working here must follow these rules.

## 1. Working principles

- Make the smallest safe change that completes the requested task.
- Read the relevant files in `Memory/` before changing architecture, database, API, UI/UX, deployment, or tests.
- Keep the project production-minded: clear names, typed contracts, validation, error handling, and no duplicated business logic.
- Do not change unrelated files or rewrite existing decisions without documenting why.
- Ask before making irreversible choices, using live payment services, creating upstream purchase orders, or changing product/order data.

## Current reality and research (mandatory)

Do not make architecture, product, UI, deployment, security, payment, Telegram, framework, library, or API decisions solely from remembered knowledge.

Before beginning a meaningful task or choosing an approach:
1. **Inspect the local reality first** — read the relevant source files, package versions, existing configuration, Memory documents, tests, and current implementation status.
2. **Verify changing facts externally** — when a fact may have changed (framework/library APIs, Telegram capabilities, shadcn patterns, hosting/free tiers, payment providers, security guidance, upstream API behavior, etc.), search the web and prefer the official documentation or primary provider source.
3. **Compare options deliberately** — consider practical alternatives, compatibility with the existing project, security, maintainability, cost, and the user's stated goal. Do not adopt a trend just because it is new.
4. **State uncertainty honestly** — separate verified facts, assumptions, and open questions. If evidence conflicts or a decision materially affects the user, pause and ask instead of guessing.
5. **Record the decision** — put the sources checked, the result, and the chosen approach in the dated Memory log. Update the relevant numbered Memory specification when it changes a project decision.

Research does not mean blindly following search results. Treat official docs as primary sources, cross-check important claims, and never expose secrets or customer data while researching.

## 2. Secrets and external APIs

- Never commit, print, paste, log, or place real credentials in source files, documentation, tests, screenshots, or git history.
- Real keys belong only in untracked local `.env` files or the deployment platform's secret manager.
- Use variable names such as `UPSTREAM_PARTNER_API_KEY`; keep `.env.example` value-free.
- The upstream partner API may be used only through the backend. Never expose it to the Telegram client, admin frontend, browser JavaScript, or public API responses.
- Read-only API calls are allowed only when explicitly requested. Never call `POST /orders` unless the user explicitly asks to place a real order.

## 3. Architecture conventions

- Workspace manager: `pnpm`.
- Language: TypeScript with strict mode for all application code.
- Apps: `apps/admin`, `apps/api`, and `apps/bot`.
- Shared code belongs in `packages/*`; do not import one app directly into another app.
- Database schema and migrations belong in `packages/db`.
- The admin UI must use Tailwind CSS and bespoke accessible components following shadcn/ui design conventions. PrimeVue has been replaced to maintain lean bundle performance. Do not introduce a competing component library.
- Telegram custom emoji placeholders in supplier text use the form `{pe:<numeric-id>}`. Preserve the original supplier text for product items and descriptions; render it server-side for Telegram as `<tg-emoji emoji-id="...">fallback</tg-emoji>`. Category names are normalized to clean display names without `{pe:...}` placeholders in database and API responses.

## 4. Data and order safety

- All money calculations use integer minor units or a decimal-safe library; never use JavaScript floating-point arithmetic for order totals.
- Customer-facing MMK prices are owned by Arena Store and must be separate from upstream USD cost.
- An upstream order requires a unique internal order ID and `externalOrderId` for idempotency.
- Do not mark an order delivered until the upstream API has returned a successful completed result and delivery data was securely stored.
- Keep upstream delivery credentials encrypted at rest and never expose them in admin list views or logs.
- Stock shown to customers must be constrained by upstream stock, wallet capacity, reservations, and local sale limits.

## Interaction quality and motion

- The user expects the product to feel calm, polished, and smooth — never abrupt or jumpy.
- Build one complete interaction at a time. An active button, navigation item, or control must either perform its stated action or be visibly disabled with a clear reason; do not ship misleading dead controls.
- Preserve layout where possible during loading, navigation, sidebar collapse, dialogs, filters, and state changes. Prefer short, consistent transitions over sudden content replacement.
- Ordinary buttons must not move up, sideways, or otherwise translate on hover. Use restrained color, shadow, and opacity feedback instead; the icon-only sidebar rail is the only intentionally compact collapsed layout.
- For controls that can be tapped repeatedly, prevent duplicate local state changes while the action settles and coalesce transient feedback into one current message instead of stacking notifications.
- Use the existing shadcn/ui primitives and their accessible behavior for sidebar, sheets, dialogs, menus, tooltips, and focus management.
- Respect `prefers-reduced-motion`; motion should support orientation, not delay work or distract from it.
- Before calling an interaction finished, verify desktop and mobile behavior, loading/empty/error states, keyboard access, and the intended click/tap result.
- For Arena live previews, verify at least one critical interaction inside a sandboxed iframe as well as a normal browser page. Next.js development mode blocks client assets from opaque sandbox origins; use a production build/start preview for this environment instead of weakening origin security broadly.

## 5. Tests

- Add or update tests for any business rule, API route, price calculation, stock calculation, payment-state change, or supplier integration change.
- Test files live under `tests/` and mirror the feature being tested.
- Never use real API keys, real customer data, or real delivery credentials in tests.
- Mock all upstream API and payment-provider calls by default.

## 6. Memory discipline (mandatory)

Before implementation, read the applicable numbered documents under `Memory/`.

After completing a meaningful change:
1. Append one concise entry to `Memory/YYYY-MM-DD.md` using the local project date.
2. Create that date file if it does not exist.
3. Record: changed files/areas, decision made, test status, and any follow-up.
4. Do not overwrite earlier entries in the same date file.
5. Update a numbered Memory specification too if the decision changes its subject.

Do not put credentials, personal data, private delivery content, or secret URLs in Memory files.

## 7. Finish checklist

- [ ] Relevant Memory files read
- [ ] No secret added to tracked files
- [ ] Code style and TypeScript contracts respected
- [ ] Relevant tests added/updated or explicitly noted as not yet applicable
- [ ] Memory daily log appended
- [ ] Documentation/specification updated if a decision changed
