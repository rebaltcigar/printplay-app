# Kunek — Product Roadmap

> Living document. "Kunek" is the platform. "PrintPlay" is the first business (tenant) running on it.
> Updated: 2026-03-08 (v0.5.1)
>
> Completed version details archived in `memory/release-history.md`.

---

## Merge History

| Version | Branch | Status |
|---------|--------|--------|
| v0.6.0 | `feature/reporting-analytics` | Released |
| v0.5.1 | `main` | Released |
| v0.5 | `feature/retail-inventory` | Released |
| v0.4.5 | `main` | Released |
| v0.4.4 | `main` | Released |
| v0.4.0 | `feature/basic-crm` | Merged |
| v0.3.0 | `feature/invoice-management` | Merged |
| v0.2.2 | `feature/rebrand` | Merged |
| v0.2.1 | `feature/catalog-foundation` | Merged |
| v0.2.0 | `feature/catalog-foundation` | Merged |
| v0.1.32 | `feature/next-dev-2` | Merged |

## v0.7 — Automated Tests ← **NEXT**
**Goal**: Regression safety net for the POS. Must pass before every deploy touching POS code.
**Goal**: Regression safety net for the POS. Must pass before every deploy touching POS code.

Full test plan: `memory/pos-test-plan.md`. Covers item grid, tile clicks, variants, qty dialog, manual entry, cart CRUD, checkout (Cash/GCash/Charge), hotkeys, PC Rental tab, tab switching, and end-shift PC rental modes.

**Tooling:** Vitest + React Testing Library (UI/hooks) · Playwright (E2E + Firestore writes)

---

## v0.8 — Bundle/Package Services
**Goal**: Support fixed-price service bundles where the system knows the contents — enabling proper inventory deduction and clear cashier UX.

- New `bundle` concept in the service catalog: a parent item with a fixed total price and a defined list of included services/items
- Example: Rush ID Package ₱40 = 1 ID print + lamination + 1 piece bond paper
- POS: selecting a bundle adds all included items to the cart as a single grouped line
- Admin: bundle builder in Service Catalog — define included items and quantities
- Inventory: bundle checkout decrements stock for each included retail/consumable item
- Reporting: bundles tracked as their own line in shift reports; contents visible on receipt

---

## v0.9 — Biometric Staff Auth
**Goal**: Physical fingerprint reader identifies which staff member is present — enabling fast staff switching, sensitive action approval, and clock-in/out without shared Windows Hello.

**Approach — custom Windows companion app:**
- Dedicated USB fingerprint reader at the counter
- Lightweight Windows tray app listens for scans and maps each fingerprint to a specific named staff profile (enrolled in the companion app — not Windows Hello)
- On match: sends the identified `staffEmail` to the Kunek web app via a local WebSocket or HTTP endpoint (`localhost:PORT`)
- Kunek web app receives the identity and acts on it accordingly
- No dependency on Windows Hello — each fingerprint is explicitly enrolled and named per staff member

**Use cases:**
- Clock-in / clock-out without typing credentials
- Approve sensitive POS actions (void transaction, apply discount, open drawer) — cashier scans instead of entering a PIN
- Fast cashier handover — scan to switch the active staff on a shared terminal
- Admin: enroll / revoke fingerprints per staff member

**Infrastructure:**
- Companion app: scope TBD (Electron, .NET tray app, or lightweight Python service)
- Kunek side: WebSocket listener in the web app, action dispatcher based on received `staffEmail`

---

## v0.10 — PC Timer Module
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

## v0.11 — Payment Methods & POS Polish
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
| Barcode scanner for retail | Scan to add retail item to cart. |
| Customer loyalty tracking | Repeat customer tagging, frequency tracking. |
| Job queue (Canva / Graphic Design) | Job-order services needing a queue/ticket system, not just a cart item. |
| Service-level sales targets | Per-service goals per shift or per day. |
| Sync strategy refinements | Remove console-spamming retries, manual sync controls, better offline UI. |
| Game Launcher | Integrated game launcher for internet cafe PCs. Ties into PC Timer (v0.9). Admin-managed game library, per-game session tracking. |
| Firestore offline persistence | `enableIndexedDbPersistence` — full offline support + instant cache on reload. Revisit when offline mode becomes a requirement. |

---

## Technical Debt

| Item | Priority |
|------|----------|
| `POS.jsx` is ~1300 lines — decompose into sub-components | v0.4.5 (Partially done) |
| Standardize all alerts/errors to Snackbar system | v0.4.5 (Standardized in POS/Shifts) |
| JSDoc / TypeScript types for Transaction, Shift, Order, Invoice | v0.3+ |
| Unit tests for critical calculations (Payroll, Cart Totals, Invoice Balance) | v0.3+ |
| `localStorage` cache for `services` list — stale-while-revalidate for faster POS tile grid on first paint | v0.4+ |
