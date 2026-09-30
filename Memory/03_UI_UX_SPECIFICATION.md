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

The dashboard should feel polished and calm when it becomes functional:

- Sidebar collapse/expand, page navigation, sheets, dialogs, menu states, filters, and saved changes must transition smoothly rather than abruptly replacing the interface.
- Keep transition timing consistent and purposeful. Respect `prefers-reduced-motion`.
- Do not make a visible control appear usable if it has no behavior. Until a feature exists, disable it and explain the upcoming action where useful.
- A completed interaction includes the click/tap behavior, responsive/mobile behavior, keyboard access, loading state, empty state, error state, and success feedback. Repeated taps must not stack duplicate state changes or toast messages.
- Build and verify interactions incrementally instead of enabling a whole screen of unfinished controls at once.

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
