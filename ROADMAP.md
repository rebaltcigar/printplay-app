# Kunek — Product Roadmap

> Living document. "Kunek" is the platform. "PrintPlay" is the first business (tenant) running on it.
> Updated: 2026-03-10 (v0.6.1)
>
> Completed version details archived in `memory/release-history.md`.

---

## Merge History

| Version | Branch | Status |
|---------|--------|--------|
| v0.7.2 | `main` | Released |
| v0.7.1 | `main` | Released |
| v0.7.0 | `main` | Released |
| v0.6.1 | `feature/reporting-analytics` | Released |
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

## v0.8 — Automated Tests ← **NEXT**
**Goal**: Regression safety net for the POS. Must pass before every deploy touching POS code.
**Goal**: Regression safety net for the POS. Must pass before every deploy touching POS code.

Full test plan: `memory/pos-test-plan.md`. Covers item grid, tile clicks, variants, qty dialog, manual entry, cart CRUD, checkout (Cash/GCash/Charge), hotkeys, PC Rental tab, tab switching, and end-shift PC rental modes.

**Tooling:** Vitest + React Testing Library (UI/hooks) · Playwright (E2E + Firestore writes)

---

## v0.9 — Bundle/Package Services
**Goal**: Support fixed-price service bundles where the system knows the contents — enabling proper inventory deduction and clear cashier UX.

- New `bundle` concept in the service catalog: a parent item with a fixed total price and a defined list of included services/items
- Example: Rush ID Package ₱40 = 1 ID print + lamination + 1 piece bond paper
- POS: selecting a bundle adds all included items to the cart as a single grouped line
- Admin: bundle builder in Service Catalog — define included items and quantities
- Inventory: bundle checkout decrements stock for each included retail/consumable item
- Reporting: bundles tracked as their own line in shift reports; contents visible on receipt

---

## v0.10 — Biometric Staff Auth
**Goal**: Physical fingerprint reader identifies which staff member is present — enabling fast staff switching, sensitive action approval, and clock-in/out without shared Windows Hello.

**Approach — custom Windows companion app:**
- Dedicated USB fingerprint reader at the counter
- Lightweight Windows tray app listens for scans and maps each fingerprint to a specific named staff profile
- On match: sends the identified `staffEmail` to the Kunek web app via a local WebSocket or HTTP endpoint
- Kunek web app receives the identity and acts on it accordingly

---

## v0.11 — PC Timer Module
**Goal**: Dedicated PC session management integrated into POS as a new tab. Replaces the current "PC Rental as a manual line item" workaround.

---

## v1.0 — Multi-Tenancy (Kunek SaaS)
**Goal**: Transform the app into a proper multi-tenant SaaS platform. "PrintPlay" becomes `tenantId: "printplay"`.

---

## Backlog (Unversioned)

| Feature | Notes |
|---------|-------|
| Barcode scanner for retail | Scan to add retail item to cart. |
| Customer loyalty tracking | Repeat customer tagging, frequency tracking. |
| Job queue (Canva / Graphic Design) | Job-order services needing a queue/ticket system. |
| Sync strategy refinements | Remove console-spamming retries, better offline UI. |

---

## Technical Debt

| Item | Priority |
|------|----------|
| `POS.jsx` is ~1400 lines — decompose into sub-components | v0.7 (Critical for Polish) |
| Standardize all alerts/errors to Snackbar system | v0.7 (Standardized in POS/Shifts) |
| JSDoc / TypeScript types for Transaction, Shift, Order, Invoice | v0.7+ |
| Unit tests for critical calculations (Payroll, Cart Totals, Invoice Balance) | v0.8+ |
| `localStorage` cache for `services` list — stale-while-revalidate | v0.7+ |
| Update `brandingService.js` to handle non-Google URLs better | v0.7 (Standardization) |
