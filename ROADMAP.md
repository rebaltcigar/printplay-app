# Kunek — Product Roadmap

> Living document. "Kunek" is the platform. "PrintPlay" is the first business (tenant) running on it.
> Updated: 2026-03-06 (v0.2.2)
>
> Completed version details archived in `memory/release-history.md`.

---

## Merge History

| Version | Branch | Status |
|---------|--------|--------|
| v0.2.2 | `feature/rebrand` | Merged |
| v0.2.1 | `feature/catalog-foundation` | Merged |
| v0.2.0 | `feature/catalog-foundation` | Merged |
| v0.1.32 | `feature/next-dev-2` | Merged |

## Up Next — `feature/invoice-management`

---

## v0.3 — Invoice & Charge Management ← **NEXT**
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

## v0.4 — Retail & Inventory
**Goal**: Proper retail item management with stock tracking.

- Retail tab in POS fully operational
- Stock decrement on checkout when `trackStock: true`
- Low stock indicator on POS tile
- Paper / consumable tracking via transaction `attributes`
- Restock flow in admin (adjust stockCount with reason log)
- Inventory report: current stock levels, sales velocity, low stock list
- Weighted average cost calculation for retail items

---

## v0.5 — Reporting & Analytics
**Goal**: Deeper business intelligence from data already being captured.

- Shift breakdown by service variant (B&W vs Color, etc.)
- Parent-level aggregation in reports ("all Document Printing" combined)
- Paper size consumption report (from transaction attributes)
- Retail vs Service revenue split
- Transaction volume by hour chart
- Invoice aging report (outstanding 0–30d, 31–60d, 60d+)
- Staff performance leaderboard
- Fix remaining Shift Sales vs Total Sales discrepancies

---

## v0.6 — Automated Tests
**Goal**: Regression safety net for the POS. Must pass before every deploy touching POS code.

Full test plan: `memory/pos-test-plan.md`. Covers item grid, tile clicks, variants, qty dialog, manual entry, cart CRUD, checkout (Cash/GCash/Charge), hotkeys, PC Rental tab, tab switching, and end-shift PC rental modes.

**Tooling:** Vitest + React Testing Library (UI/hooks) · Playwright (E2E + Firestore writes)

---

## v0.7 — PC Timer Module
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
- Admin: add / remove / rename PC units (never hardcoded)
- Admin: set hourly rate, minimum session time, rounding rules
- One-time setup: create "PC Rental" catalog service and link in Settings → POS → PC Rental Billing Service
- Once live: remove `pcRentalTotal` manual entry from EndShiftDialog, retire `splitPcRental` math
- `pcRentalMode: 'builtin'` in EndShiftDialog: compute total from `pcSessions`

---

## v0.8 — Payment Methods & POS Polish
**Goal**: Make payment methods fully configurable. Clean up POS power features.

**Payment method configuration:**
- Toggle Cash / GCash / Charge (Pay Later) per tenant
- GCash setup: store name, number, QR code image upload
- QR code displayed in checkout dialog when GCash selected
- Disabled methods disappear from checkout ToggleButtonGroup
- Stored in `settings/config`: `{ gcashEnabled, gcashName, gcashNumber, gcashQrUrl, chargeEnabled }`

**POS Polish:**
- Notes field on cart line items
- Order-level discount (flat ₱ or %) at checkout
- Senior / PWD / Student discount presets at checkout or per line item
- Shift handover: pass shift to another staff without ending
- Keyboard shortcut map (admin-configurable hotkeys per business)

---

## v1.0 — Multi-Tenancy (Kunek SaaS)
**Goal**: Transform the app into a proper multi-tenant SaaS platform. "PrintPlay" becomes `tenantId: "printplay"`.

> Breaking architectural change. Requires data migration and careful planning.

- Data schema: all root collections scoped under `/tenants/{tenantId}/`
- Firestore rules: enforce tenant path boundaries
- `TenantContext` — provides `tenantId` to entire app (URL subdomain or user claim)
- Tenant-aware login (`app.kunek.com/login?tenant=printplay` or subdomain)
- One-time migration script for PrintPlay data (Firestore batch writes, rollback plan required)
- Kunek admin portal: create / suspend / configure tenants, per-tenant feature flags, billing integration
- Verification: create test tenant "DemoCafe", confirm zero data bleed between tenants

---

## Backlog (Unversioned)

| Feature | Notes |
|---------|-------|
| Bundle/Package services | Fixed-price bundles (e.g., Rush ID Package ₱40). System needs to know bundle contents for inventory deduction. |
| Barcode scanner for retail | Scan to add retail item to cart. |
| Customer loyalty tracking | Repeat customer tagging, frequency tracking. |
| Job queue (Canva / Graphic Design) | Job-order services needing a queue/ticket system, not just a cart item. |
| Service-level sales targets | Per-service goals per shift or per day. |
| Biometric staff auth (mobile) | Staff approves sensitive actions via WebAuthn/Passkeys on their phone. |
| Sync strategy refinements | Remove console-spamming retries, manual sync controls, better offline UI. |
| Game Launcher | Integrated game launcher for internet cafe PCs. Ties into PC Timer (v0.7). Admin-managed game library, per-game session tracking. |
| Firestore offline persistence | `enableIndexedDbPersistence` — full offline support + instant cache on reload. Revisit when offline mode becomes a requirement (v0.4+). |

---

## Technical Debt

| Item | Priority |
|------|----------|
| `POS.jsx` is ~1700 lines — decompose into sub-components | Ongoing |
| Standardize all alerts/errors to Snackbar system | Ongoing |
| JSDoc / TypeScript types for Transaction, Shift, Order, Invoice | v0.3+ |
| Unit tests for critical calculations (Payroll, Cart Totals, Invoice Balance) | v0.3+ |
| `localStorage` cache for `services` list — stale-while-revalidate for faster POS tile grid on first paint | v0.4+ |
