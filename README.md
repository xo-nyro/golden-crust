# Golden Crust — Bakery POS & Management (prototype)

*Freshly baked. Beautifully managed.*

Golden Crust is a desktop-first point of sale and back-office app for an independent bakery. It is built with
plain HTML, CSS and JavaScript ES modules. There is no framework, no build step and no backend. All data is
stored in the browser's `localStorage`.

> **This is a demonstration.** It isn't suitable as the only financial system for a live bakery. A production
> version needs a secure backend, user accounts and permissions, reliable backups, and production-grade
> transaction handling. Payments are *recorded*, not processed, and refunds are recordkeeping only.

## Running it

ES modules don't load from `file://`, so serve the folder over HTTP:

- **VS Code:** right-click `index.html` → *Open with Live Server*.
- **Node:** `npx serve .` (or `npx http-server .`) from this folder.
- **Python:** `python -m http.server 8000`, then open <http://localhost:8000>.

Fonts (Newsreader and Manrope) load from Google Fonts when you're online. Offline, the app falls back to
system fonts, and everything else still works because charts are plain DOM and CSS.

## What's included

| Area | Highlights |
| --- | --- |
| **Overview** | Date filter (today, yesterday, 7 or 30 days, custom), KPIs with period comparison, an hourly or daily revenue chart with tooltips, best sellers, recent transactions, stock alerts and quick actions |
| **Point of Sale** | Search by name or SKU (Enter adds an exact SKU match; `/` focuses search), category chips, stock-aware product cards, cart with quantity limits, fixed or % discounts, cash, transfer or card checkout with change due, receipt preview and printing |
| **Products** | Search, filters, sorting, pagination, add and edit form with validation (prices, unique SKU), image URL with initials fallback, deactivate, and safe delete (products with sales history can't be deleted) |
| **Inventory** | Restock, adjust (set a count or add/remove units), record waste, set thresholds, filterable movement history with CSV export |
| **Transactions** | Search, filters, sorting, detail view built from item snapshots, receipt reprint, recorded refunds or cancellations with an optional, explicit return to stock |
| **Reports** | Gross sales, refunds, net sales, orders, average order value, discounts, estimated gross profit, revenue by day, product, category and payment method, refunds and cancellations, stock movements, expenses, plus the formulas used |
| **Expenses** | Add, edit and delete with categories, date and category filters, totals and CSV export |
| **Help & tutorials** | Welcome screen on the first visit, an 18-step guided tour of the real screens, 6 short task tutorials, a searchable in-app manual, and a downloadable or printable user manual. Press `?` to open Help |
| **Settings** | Business details (used on receipts), currency, locale, date and time formats, POS defaults, storage usage, JSON backup export and import, reset to demo data or start empty, recent activity log |

## Onboarding and help

- **First visit:** a welcome screen offers three choices: take the guided tour, download the user manual, or explore alone. It appears once per browser and is remembered in `gc_ui_v1`.
- **Guided tour:** 18 steps that move through the real pages and highlight each feature. Use Next and Back, or ← → and Esc on a keyboard. On phones, the explanation sits at the bottom of the screen.
- **Tutorials:** short tours for single tasks: making a sale, products, inventory, refunds, reports, and backups. Completed ones are ticked.
- **Manual:** 15 topics, searchable on the Help page. **Download manual** saves a self-contained, styled HTML file that opens in any browser and prints cleanly to PDF. **Print / save as PDF** prints the manual directly.
- **To change the manual,** edit the `MANUAL` array in `js/help.js`. The Help page and the downloaded file both update.

## Screen sizes

| Width | Layout |
| --- | --- |
| Desktop (over 1080px) | Full sidebar (collapsible to icons), side-by-side POS cart, full tables |
| Tablet (761–1080px) | Icon-only sidebar. The POS cart stays beside the products down to 900px, then becomes a bottom sheet opened from a "View sale" bar |
| Phone (760px and under) | Menu button opens a slide-in navigation drawer, search opens from an icon, and the POS cart is a bottom sheet |

On phones, KPI cards sit two per row and tables turn into labelled cards. Dialogs open as bottom sheets, and form inputs use 16px text so iOS doesn't zoom in when a field is focused. On touch screens, buttons, chips and quantity controls get larger tap targets.

## Project structure

```
index.html          App shell: sidebar, top bar, icon sprite, main container
css/styles.css      Design tokens and every component style, including print CSS for receipts
js/app.js           Start-up, hash router, top bar (search, alerts, profile menu), sidebar collapse
js/config.js        Storage keys, categories, status labels, default settings
js/storage.js       The only module that touches localStorage: validation, data operations, checkout, rollback
js/seed.js          Demo data: 20 products, 30 days of sales, stock movements and expenses
js/metrics.js       Shared business definitions used by the dashboard, reports and exports
js/chart.js         Dependency-free bar charts
js/ui.js            Modals, confirmations, toasts, form fields, table helpers
js/utils.js         Safe DOM builder, formatting (Intl.NumberFormat), date ranges, CSV
js/tour.js          Guided-tour engine (spotlight, keyboard and touch support) and the tutorial definitions
js/help.js          User manual content (single source for the Help page and the download), welcome screen
js/dashboard.js, pos.js, products.js, inventory.js, transactions.js, reports.js, expenses.js, settings.js
assets/icons/       Favicon
assets/images/      Optional product images (reference them as assets/images/…)
```

## Data and safeguards

- **Keys:** `gc_products_v1`, `gc_transactions_v1`, `gc_inventory_v1` (stock movements), `gc_expenses_v1`,
  `gc_settings_v1` and `gc_audit_v1`. Layout preferences live in `gc_ui_v1`, and the in-progress cart is kept in
  `sessionStorage`.
- **Seeding** happens only for a key that doesn't exist yet, so refreshing never recreates sample data. Unreadable
  data is copied to a `…_backup_<timestamp>` key before that store is reset, and you get a warning when this happens.
- **Checkout** validates everything against the stored data before writing. The transaction, the stock deductions
  and the movements are written together. If any `localStorage` write fails (for example, the quota is exceeded),
  the previous values are restored. A checkout token per checkout, together with an in-flight guard, stops a
  double-submit from deducting stock twice. This is a prototype safeguard against synchronous failures, not a
  guarantee of database-grade atomicity.
- **History is immutable:** each sale stores the item's name, SKU, unit price and unit cost. Editing a product never
  changes past receipts. Cancellations and refunds are recorded with a reason and are never deleted. Stock goes back
  only for the quantities you explicitly mark as returned to saleable stock.
- **Safety:** user-entered text is inserted with text nodes, never as HTML. CSV cells are escaped, and text that
  starts with `=`, `+`, `-`, `@`, a tab or a carriage return is prefixed with `'` to block spreadsheet formula
  injection. No passwords or payment credentials are stored.

## Definitions (shared by the dashboard and reports)

- **Gross sales:** totals after discounts of non-cancelled sales made in the period.
- **Refunds:** refund amounts recorded in the period. **Net sales** = gross sales − refunds.
- **Estimated gross profit** = net sales − (item costs stored on each sale − cost of items returned to stock).
- **Orders:** non-cancelled sales. Revenue minus recorded expenses is shown as *indicative only*, never as net profit.

## Demo data

Seed records are tagged **Demo** in the interface and carry `sample: true` in storage. Sales are generated relative
to the first launch date, so the dashboard has a realistic last 30 days. The current stock includes some low-stock
items, some out-of-stock items, an inactive product and a product whose stock isn't tracked. To get fresh demo data
or an empty workspace, use **Settings → Data management → Reset**.
