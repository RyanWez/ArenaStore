# 03 — UI / UX Specification

## Status

The technical Admin UI base is initialized. A first dark-mode Dashboard Shell is implemented with a responsive shadcn Sidebar, top bar, fake Overview cards, empty recent-orders table, and an explicit Demo Mode label.

The Products route is a browse-only supplier-catalog workspace. It renders a static shell and reads the normalized snapshot only from the server-owned `GET /api/catalog` adapter; the browser never receives the supplier key. With a configured server key it shows live data; otherwise it shows a conspicuously labelled sample catalog for layout, paging, and navigation tests only. The catalog has search, category/availability filters, sort, 10/20/40 page sizes, numbered paging, a sticky desktop table header/internal body scroll, and normal-scrolling mobile cards. Product links open the separate `/products/[productId]` detail workspace. Supplier cost, stock, and wallet capacity are read-only; the only editable fields are browser-local MMK price, selling limit, and visibility. Manual add, pause, and supplier mutations are intentionally absent. Browser-local rules remain temporary until the database/backend phase is built.

## Visual direction

- Telegram bot experience: concise, button-led, dark-friendly, emoji-rich.
- Admin dashboard: professional, clean, responsive, and built with **Nuxt 3 + PrimeVue v4 (Aura preset)** plus Tailwind CSS.
- Do not copy another store's branding, name, images, or proprietary text verbatim.

## Customer bot navigation

```text
/start
 ├─ 🛍 Buy Products
 │   └─ Category → Product → Detail → Quantity → Payment → Confirmation
 ├─ 📦 My Orders
 ├─ 💰 Wallet
 ├─ 👤 My Profile
 ├─ 🎧 Support
 └─ 📢 Join Channel
```

## Product-detail minimum content

- Product name and custom emoji
- Clear description / redemption or delivery guidance
- MMK customer price
- Quantity selector
- Availability status
- Warranty / replacement terms where applicable
- Buy button and Back button

## Admin dashboard sections

1. Overview — sales, orders, balance, alerts
2. Orders — filters, status, delivery, safe retry controls
3. Products — local price, upstream mapping, limits, active state
4. Categories — name, visibility, sort order
5. Payments — review proof and approve/reject history
6. Customers — orders, wallet, notes, risk/status
7. Promotions — coupons and campaign rules
8. Support — tickets and order context
9. Supplier — connection health, catalog sync, read-only balance/usage
10. Settings — store identity, staff roles, notification thresholds
11. Audit Log — privileged changes

## PrimeVue + Tailwind CSS rule

Use PrimeVue v4 components with the Aura theme preset for dashboard primitives:
- Navigation & Structure: Drawer/Sidebar, Menubar, Toolbar, Card
- Data presentation: DataTable, Column, Paginator, Tag/Badge, Timeline
- Forms & Inputs: InputText, InputNumber, Dropdown/Select, ToggleSwitch, FileUpload
- Overlays & Feedback: Dialog, ConfirmDialog, Toast, Skeleton, Tooltip
- Icons: PrimeIcons (`pi pi-*`)

Tailwind CSS handles layout spacing, flex/grid systems, and custom typography utilities.

## Visual language

- **Font:** Nunito Sans for the rounded Latin UI feel, with Noto Sans Myanmar as the Myanmar-script fallback.
- **Theme:** dark navy surfaces with violet primary actions, indigo focus/active states, emerald Active badges, and amber Paused badges. Avoid a plain black-and-white dashboard.
- **Shape:** use the shared rounded token consistently for cards, menus, inputs, buttons, sheets, and mobile product cards.
- **Responsive products:** use a concise table on desktop and readable product cards on mobile; do not force users to horizontally scroll a dense admin table on a phone.

## Interaction, transitions, and honest controls

The dashboard and storefront must feel polished, calm, and responsive across all phases:

### Mandatory Smooth Transition Rules (Zero-Flicker Architecture)
1. **Global Page-to-Page Navigation:**
   - Nuxt 3 `pageTransition: { name: 'page', mode: 'out-in' }` must remain active for all future views.
   - Timing: 180ms subtle translateY(6px) + opacity fade (`cubic-bezier(0.16, 1, 0.3, 1)`).
2. **Collapsible Navigation & Panels (No Immediate DOM Unmounting):**
   - When elements collapse (e.g. sidebar rail, accordion groups, drawers), text labels, titles, and badges must never be abruptly removed on frame 0 using naked `v-if`.
   - Instead, animate concurrently with width/height using CSS `transition-all duration-300`, `max-w-0 opacity-0 -translate-x-2` to guarantee silky synchronized motion.
3. **Modals, Dialogs & Drawers Standard:**
   - Every overlay must be wrapped in Vue `<Transition name="modal">` (or `<Transition name="drawer">`).
   - Backdrop: Smooth fade-in (`opacity-0` -> `opacity-100`) and fade-out over 200ms.
   - Content: Zoom-in from `scale-96 translateY(8px)` to `scale-100` on open, and smooth scale-down on dismiss/close.
   - Always support closing by clicking outside on the backdrop (`@click.self`) and pressing Escape.
4. **Performance & Multi-Tap Debouncing:**
   - Disable buttons immediately while actions are processing (`:disabled="isProcessing"`, loading spinners) to prevent duplicate transactions, orders, or API sync requests.
   - Coalesce notifications; never spam stacking toast messages.
5. **Customer Telegram Bot Smoothness (Phase 4):**
   - Answer all inline button callback queries immediately (`ctx.answerCallbackQuery()`) to eliminate Telegram loading clocks.
   - Smooth message editing for pagination and quantity updates rather than flooding chat history with new messages.
   - Step-by-step guided conversation flows for checkout and payment slip upload with clear cancel options.
6. **Skeleton Loading Standards (Zero Layout Shift):**
   - Use PrimeVue `<Skeleton>` components during asynchronous data fetching across all dashboard tables, KPI summary cards, and detail modals.
   - Skeletons must precisely mimic the shape and height of final elements (e.g. rounded badges, metric numbers, table columns) to eliminate layout jumps.
7. **Concise Status & Action Terminology:**
   - Maintain compact, clean, single-word status badges and buttons for optimal responsiveness on both mobile and desktop viewports:
     - `Submitted` (replaces verbose `Slip Submitted` or `Payment Submitted`)
     - `Review` (replaces `Review Slip` or `Needs Review`)
     - `Approved` (replaces `Approved & Delivered` or `Approve & Deliver`)
     - `Delivered`, `Cancelled`
8. **Accessibility:**
   - Keep `@media (prefers-reduced-motion: reduce)` active so users with motion sensitivities experience instant, accessible state changes.

## Custom emoji rendering

Supplier placeholder:

```text
{pe:5353054453832368599}🤖 Product Name
```

Telegram HTML target:

```html
<tg-emoji emoji-id="5353054453832368599">✨</tg-emoji>🤖 Product Name
```

Escape all supplier text before injecting validated `tg-emoji` tags. Preserve raw text in the database.
