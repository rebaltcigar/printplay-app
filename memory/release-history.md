# Kunek — Release History

Completed versions archived from ROADMAP.md. CHANGELOG.md has the authoritative diff-level record; this file preserves design decisions, schema changes, and rationale.

---
 
 ## v0.5 — Retail & Inventory (2026-03-08)
 Branch: `feature/retail-inventory`
 
 **Goal**: Comprehensive stock management, recursive material deduction, and sales velocity forecasting.
 
 **Why**: Manually tracking consumables like paper and ink was prone to error. Business owners needed to know when to reorder stock and ensure they never sold a service they couldn't fulfill.
 
 **New Infrastructure:**
 - **Centralized `inventoryService.js`**: Atomic management of stock levels, Weighted Average Cost (WAC), and transactional logging.
 - **Linked Consumables**: Services can now be mapped to multiple retail items with specific consumption ratios.
 - **Audit Logs (`inventory_logs`)**: Immutable event stream of every restock, adjustment, and sale decrement.
 - **Analytics Hook (`useInventoryAnalytics.js`)**: Real-time sales velocity calculation over a rolling 30-day window.
 
 **Features:**
 - **Smart Inventory Dashboard**: Unified view with KPIs (`SummaryCards`), audit history (`DetailDrawer`), and forecasting columns (Avg Sales/Day, Stock Life).
 - **POS Effective Stock**: Product tiles automatically look up material dependencies. If "Doc Paper" is out, "Printing" turns red and disables.
 - **Recursive Deduction**: Checkout flow identifies linked items and decrements all within one Firestore batch.
 - **Order Reversion**: Snapshot-based stock restoration ensures deleted orders return materials accurately, even if the service link has changed.
 
## v0.4.0 — Basic CRM Foundation (2026-03-07)
Branch: `feature/basic-crm`
 
**Goal**: Unified customer profiles to speed up checkout and prepare for PC rentals.
 
**Why**: Existing orders had only text names, leading to data fragmentation. We needed a single source of truth for customer identities, balances, and spend history.
 
**New `customers` collection:**
```javascript
customers/{id}
  fullName: string
  email: string
  phone: string
  tin: string
  address: string
  lifetimeValue: number
  outstandingBalance: number
  createdAt: timestamp
  updatedAt: timestamp
```
 
**Features:**
- **Unified Smart Form**: POS drawer handles both search and registration in one fluid UI.
- **Centralized Service**: All Firestore interactions moved to `customerService.js`.
- **Admin Hub**: New `/admin/customers` module for CRM lifecycle management.
- **Shared UI**: `CustomerForm.jsx` ensures consistency between Admin and POS.
- **POS Modernization**: Minimalist 'Walk-in' display with dedicated selection drawer.
- **Cleanup**: Stripped dead code from `POS.jsx` (~100 lines removed).
 
---


## v0.3.0 — Invoice & Charge Management (2026-03-07)
Branch: `feature/invoice-management`

**Goal**: Replace the crude `New Debt` / `Paid Debt` system with proper receivables — invoices, charge accounts, and payment tracking.

**Why**: The current debt system loses detail, has no status tracking, and doesn't support partial payments or invoice documents.

**New concept: Charge / Invoice**
- At checkout, cashier chooses: **Pay Now** (existing flow) or **Charge to Account** (creates an invoice)
- Invoices have status: `Draft → Sent → Partial → Paid → Overdue`
- Invoices linked to a customer; partial payments supported

**New `invoices` collection:**
```
invoices/{id}
  orderId: string
  customerId: string
  customerName: string
  items: []
  subtotal, total, amountPaid, balance: number
  status: 'draft'|'sent'|'partial'|'paid'|'overdue'
  dueDate: timestamp
  notes: string
  createdAt: timestamp
  staffEmail: string
  shiftId: string
  payments: [{ amount, method, date, staffEmail, note }]
```

**Features:**
- POS checkout: "Charge to Account" option creates invoice instead of direct payment
- Customer profile: invoice history, outstanding balance
- Admin: invoice list with status filters, bulk actions
- Record payment against invoice (full or partial)
- Invoice PDF / print (extends existing `ServiceInvoice` component)
- Dashboard widget: total outstanding receivables
- Deprecate `New Debt` / `Paid Debt` — old transactions remain readable, new flow uses invoices

---

## v0.2.2 — Kunek Rebranding (2026-03-06)
Branch: `feature/rebrand`

**Goal**: Platform shell says "Kunek". Business branding 100% dynamic from `settings/config`.

- Renamed `package.json` (`print-play-app` → `kunek`), `index.html` title to "Kunek"
- Removed all hardcoded "PrintPlay" / "Print+Play" strings from JSX/JS
- `storeName`, `logoUrl` fallback to "Kunek" everywhere; no hardcoded business name in code
- `settings/config` fetched once in `App.jsx`, logo preloaded before gate opens, passed as `appSettings` prop — eliminates per-component fetches and branding flash
- `staffDisplayName` extracted from user doc already fetched in auth bootstrap (no extra read in POS)
- `shiftStartTime` extracted from shift doc already fetched in auth bootstrap; timer initialises synchronously on first render

---

## v0.2.1 — POS Redesign (2026-03-06)
Branch: `feature/catalog-foundation`

**Goal**: Faster cashier workflow. Tile grid replaces dropdown. Tabbed workspace.

- Classic / Grid view toggle — chip in POS header, persisted to `localStorage`, defaults to Classic
- Classic view: full-width single-column, Add to Order form pinned above cart, no split panel
- Grid view: dynamic tile grid with category filter chips (All / Services / Retail), 65/35 split
- Variant drilldown — parent tile opens variant tiles grouped by Variant Group; back button returns
- Shift+click quantity dialog on leaf tiles
- Tab transition loader (280ms CircularProgress) when switching Sale ↔ PC Rental tabs
- Checkout hotkey (F10 default), configurable in Admin → Settings → Hardware
- PC Rental settings in Admin → Settings → POS: toggle, external/built-in mode, catalog service link
- "Logs" rename (was "History")
- Fixed: `toLocalInput` / `toTimestamp` ReferenceError in Shifts.jsx edit dialog
- New transaction fields (forward-only): `serviceId`, `parentServiceId`, `variantGroup`, `variantLabel`, `attributes`

---

## v0.2.0 — Catalog Foundation (2026-03-06)
Branch: `feature/catalog-foundation`

**Goal**: Flexible, fully admin-managed service catalog. No hardcoded services in code.

**Schema additions to `services` (all backward-compatible):**
- `hasVariants: boolean` — marks a container item (not sold directly, opens picker)
- `variantGroup: string` — section header within the picker
- `variantGroups: string[]` — canonical ordered array on parent; variants select from this list
- `priceType: 'fixed' | 'variable'` — replaces ambiguous `price: 0`
- `pricingNote: string` — cashier hint for variable items (e.g., "₱5–₱20")
- `posLabel: string` — short tile name (falls back to serviceName)
- `posIcon: string` — icon key from admin-selectable preset list
- `attributes: []` — optional trackable tags per transaction (no price impact)

**Admin UI:**
- Catalog editor upgraded to full-screen dialog (was side drawer)
- Simple items: compact single-column dialog; variant parents: wide two-pane dialog
- Inline variant management — variants created/edited inside parent dialog
- Variant groups are a managed list — dropdown prevents typo duplicates; delete guard if variants assigned
- Visual icon picker (actual MUI icon buttons, not text dropdown)
- Child count badge on parent rows in the catalog table

**Hook changes:**
- `usePOSServices`: added `posItems`, `variantMap` outputs; existing `serviceList`, `expenseTypes` unchanged
- `useServiceList`: added `variantChildren` output

---

## v0.1.32 and earlier
See CHANGELOG.md for full diff history. Key milestones:
- v0.1.x: initial POS, shift management, payroll, debt system, order management, staff scheduling
