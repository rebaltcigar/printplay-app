# Kunek — Product Roadmap

> Living document. "Kunek" is the platform. "PrintPlay" is the first business (tenant) running on it.
> Updated: 2026-03-06

---

## Currently On (Branch: feature/next-dev-2)

---

## v0.2 — POS Foundation

### v0.2.0 — Catalog Foundation
**Goal**: Flexible, fully admin-managed service catalog. No hardcoded services anywhere in code.

**Schema additions to `services` (all backward-compatible):**
- `hasVariants: boolean` — marks a container item (not sold directly, opens picker)
- `variantGroup: string` — section header within the picker (e.g., "Text Only", "Resume", "Size")
- `priceType: 'fixed' | 'variable'` — replaces ambiguous `price: 0`
- `pricingNote: string` — cashier hint for variable items (e.g., "₱5–₱20")
- `posLabel: string` — short tile name inside picker (falls back to serviceName)
- `posIcon: string` — icon key from a preset admin-selectable list
- `attributes: []` — optional trackable tags per transaction that don't affect price (e.g., paper size for inventory analytics)

**ServiceCatalog admin UI updates:**
- "Has Variants" toggle in add/edit form
- `variantGroup`, `priceType`, `pricingNote`, `posLabel`, `posIcon` fields (conditional)
- `attributes` builder (key, label, options list, required toggle)
- Table: child count badge on parent rows

**Hook updates:**
- `usePOSServices` restructured: returns `directItems`, `variantParents`, `variantMap`, `retailItems`
- `useServiceList` extended to expose variant relationships

### v0.2.1 — POS Redesign
**Goal**: Faster cashier workflow. Tile grid replaces dropdown. Tabbed workspace.

- Replace hardcoded quick-action strip with dynamic admin-configured tile grid
- VariantPicker component (bottom sheet, sections from `variantGroup`)
- Optional attribute selector after variant pick (e.g., paper size tag — no price impact)
- Category filter chips on the tile grid
- Tabbed POS workspace: **Services** | **Retail** | *(future: PC Timers)*
- Transaction Log + Order History panel collapse state persisted to `localStorage`
- New transaction fields: `serviceId`, `parentServiceId`, `variantGroup`, `variantLabel`, `attributes`
  *(forward-only — old transactions unaffected)*
- Begin breaking `POS.jsx` (~1700 lines) into focused sub-components

### v0.2.2 — Kunek Rebranding
**Goal**: Platform shell says "Kunek". Business branding is 100% dynamic from tenant settings. Zero hardcoded brand strings in code.

- Rename `package.json`, `index.html` title, window/tab title to "Kunek"
- Replace favicon/manifest with Kunek platform assets
- Audit and remove all hardcoded "PrintPlay" / "Print+Play" references in JSX/JS
- `Login.jsx`, `Dashboard.jsx`, `POS.jsx` — branding strictly from `settings/config`
- `storeName`, `logoUrl` fallback to "Kunek" defaults (not "PrintPlay")
- This sets the stage for multi-tenancy — all branding is already data-driven

---

## v0.3 — Invoice & Charge Management
**Goal**: Replace the crude `New Debt` / `Paid Debt` system with proper receivables — invoices, charge accounts, payment tracking.

**Why urgent**: The current debt system loses detail, has no status tracking, and doesn't support partial payments or invoice documents.

**New concept: Charge / Invoice**
- At checkout, cashier can choose: **Pay Now** (existing flow) or **Charge to Account** (creates an invoice)
- Invoices have status: `Draft → Sent → Partial → Paid → Overdue`
- Invoices linked to a customer
- Partial payments can be recorded against an invoice
- Invoice document (extends existing `ServiceInvoice` component)

**Data model: new `invoices` collection**
```
invoices/{id}
  orderId: string              // source order
  customerId: string
  customerName: string
  items: []                    // same as order items
  subtotal: number
  total: number
  amountPaid: number           // running total of payments received
  balance: number              // total - amountPaid
  status: 'draft'|'sent'|'partial'|'paid'|'overdue'
  dueDate: timestamp
  notes: string
  createdAt: timestamp
  staffEmail: string
  shiftId: string
  payments: []                 // payment history log
    { amount, method, date, staffEmail, note }
```

**Features:**
- POS checkout: "Charge to Account" option creates invoice instead of direct payment
- Customer profile: invoice history, outstanding balance
- Admin: Invoice list with status filters, bulk actions
- Record payment against invoice (full or partial)
- Invoice PDF / print (builds on ServiceInvoice)
- Dashboard widget: total outstanding receivables
- Deprecate `New Debt` / `Paid Debt` — migrate to invoice system
  *(old debt transactions remain readable, new flow uses invoices)*

---

## v0.4 — Retail & Inventory
**Goal**: Proper retail item management with stock tracking.

- Retail tab in POS fully operational
- Stock decrement on checkout when `trackStock: true`
- Low stock indicator on POS tile
- Paper / consumable tracking via transaction `attributes` (e.g., paper size analytics)
- Restock flow in admin (adjust stockCount with reason log)
- Inventory report: current stock levels, sales velocity, low stock list
- Weighted average cost calculation for retail items

---

## v0.5 — Reporting & Analytics
**Goal**: Deeper business intelligence from the data already being captured.

- Shift breakdown by service variant (B&W vs Color, Text vs Image, etc.)
- Parent-level aggregation in reports ("all Document Printing" combined)
- Paper size consumption report (from transaction attributes)
- Retail vs Service revenue split
- Transaction volume by hour chart
- Invoice aging report (outstanding 0–30d, 31–60d, 60d+)
- Staff performance leaderboard (tied to shift data)
- Fix remaining Shift Sales vs Total Sales discrepancies

---

## v0.6 — PC Timer Module
**Goal**: Dedicated PC session management integrated into POS as a new tab. Replaces the current "PC Rental as a manual line item" workaround.

**New collections:**
- `pcUnits/{id}` — admin-configured PC stations (name, number, notes)
- `pcSessions/{id}` — timer sessions (pcUnitId, startTime, endTime, duration, billed, cartItemRef)

**Features:**
- PC tab in POS: real-time status board (Available / Active / Reserved)
- Start / Stop / Extend session per station
- Configurable billing: postpaid (charge on stop) or prepaid (charge on start)
- Auto-billing: session end creates a cart item linked to the PC Rental catalog service
- Session history per station
- Admin: add / remove / rename PC units (never hardcoded count or names)
- Admin: set hourly rate, minimum session time, rounding rules

---

## v0.7 — POS Polish & Power Features

- Notes field on cart line items (stores in transaction)
- Order-level discount (flat ₱ or %) at checkout
- Focus Mode: single-column POS, logs panel hidden
- Keyboard shortcut map (admin-configurable hotkeys per business)
- Senior / PWD / Student discount presets at checkout or per line item
- Shift handover: pass shift to another staff without ending
- Mobile companion app groundwork (time-in/time-out)

---

## v1.0 — Multi-Tenancy (Kunek SaaS)
**Goal**: Transform the app into a proper multi-tenant SaaS platform. "PrintPlay" becomes `tenantId: "printplay"`.

> This is a breaking architectural change. Requires data migration and careful planning.

**Architecture changes:**
- Data schema: `/users` → `/tenants/{tenantId}/users` (all root collections scoped)
- Firestore rules: enforce tenant path boundaries
- `TenantContext` — provides `tenantId` to entire app (derived from URL subdomain or user claim)
- Authentication: tenant-aware login (URL-based: `app.kunek.com/login?tenant=printplay` or subdomain)

**Verification:**
- Create test tenant "DemoCafe"
- Log in as DemoCafe staff — their data must not bleed into PrintPlay
- PrintPlay staff must not see DemoCafe data

**Migration:**
- Existing PrintPlay data migrated to `/tenants/printplay/...`
- One-time migration script (Firestore batch writes)
- Rollback plan required before execution

**Tenant management (Kunek admin portal):**
- Create / suspend / configure tenants
- Per-tenant feature flags (e.g., PC Timers enabled/disabled per plan)
- Billing integration (subscription per tenant)

---

## Backlog (Unversioned)

| Feature | Notes |
|---------|-------|
| Bundle/Package services | Rush ID Packages at flat ₱40 are fixed-price bundles. Need a bundle concept where the system knows what's inside (for inventory deduction). |
| Barcode scanner for retail | Scan to add retail item to cart. |
| Customer loyalty tracking | Repeat customer tagging, frequency tracking. |
| Canva Resume / Graphic Design job queue | These are job-order services needing a queue/ticket system, not just a cart item. |
| Service-level sales targets | Per-service goals per shift or per day. |
| Biometric staff auth (mobile) | Staff approves sensitive actions from their phone via WebAuthn/Passkeys. |
| Sync strategy refinements | Remove console-spamming retries, manual sync controls, better offline UI. |
| **Game Launcher** | Integrated game launcher for internet cafe PCs. Ties into the PC Timer module (v0.6.0). Admin-managed game library, per-game session tracking. Scope to be designed alongside v0.6.0 PC Timer work. |

---

## Technical Debt

| Item | Priority |
|------|----------|
| `POS.jsx` is ~1700 lines — decompose into sub-components | Do during v0.2.1 |
| Standardize all alerts/errors to Snackbar system | Ongoing |
| JSDoc / TypeScript types for Transaction, Shift, Order, Invoice | v0.3+ |
| Unit tests for critical calculations (Payroll, Cart Totals, Invoice Balance) | v0.3+ |
