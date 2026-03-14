# PrintPlay App — Claude Memory

## Prod DB Migration Plan
See [prod-migration-plan.md](prod-migration-plan.md) — 6 phases: Schema setup → Auth migration → Data migration → Backfill fixups → Local-to-prod testing → Go-live.

## Migration Source Map (Firebase → Supabase)
See [migration-source-map.md](migration-source-map.md) — full table/column mapping, JSONB reassembly rules, ID resequencing guide, transactions.csv split logic, and post-migration checklist. Schema v3.1.

## Post-Import Code Fix Plan
See [post-import-code-fix-plan.md](post-import-code-fix-plan.md) — 4 fix blocks across 11 files, to be applied after migration phases 1–6 complete:
- Fix 1: `sequential_id` → `staff_id` (7 locations, idUtils + App + hooks + components)
- Fix 2: `parent_order_number` → `parent_order_id` (3 query sites)
- Fix 3: `covered_by_uid/email/name` → `covered_by_id` (Schedule + App + MyScheduleDrawer)
- Fix 4: Remove `order_id` + `customer_name` from invoiceService insert payload

## Active Fix Plan (legacy dev reference)
See [fix-plan-supabase-migration.md](fix-plan-supabase-migration.md) — 4 phases:
- Phase 1: Auth stuck on loading screen (App.jsx authTimeout bug)
- Phase 2: SQL ALTERs for missing columns (shifts.display_id, schedules.shift_id, expenses.notes, products POS columns)
- Phase 3: Code column mismatches (parent_order_number→id, stockCount→stock_count)
- Phase 4: Supabase RLS SELECT policies for all tables

## Project Overview
- Print shop POS app built with React + MUI + Firebase (Firestore)
- Platform name: **Kunek** (PrintPlay is the first tenant/business)
- Current version: v0.7.4 (main branch)
- Primary working dir: `c:\printplay-app\printplay-app`

## Key Files
- POS screen: `src/components/POS.jsx`
- POS sub-components: `src/components/pos/` (POSHeader, POSCartPanel, POSCartTable, POSEntryPanel)
- Checkout: `src/components/CheckoutDialog.jsx`
- Checkout service: `src/services/checkoutService.js`
- Order service: `src/services/orderService.js`
- Shift financials: `src/utils/shiftFinancials.js` (single source of truth for all financial math)
- Settings (admin): `src/components/admin/StoreSettings.jsx`
- Receipt: `src/components/SimpleReceipt.jsx`
- Service invoice: `src/components/ServiceInvoice.jsx`

## Firestore Collections
- `services` — catalog items (services + retail + expenses)
- `transactions` — individual line items per shift
- `orders` — grouped checkout orders
- `shifts` — shift sessions
- `customers` — customer profiles (CRM, v0.4.0+)
- `invoices` — charge-to-account receivables (v0.3.0+)
- `users` — staff
- `settings/config` — system settings
- `counters` — sequential ID counters

## Platform & Branding Context
- App/platform name: **Kunek** (rebranded from PrintPlay)
- All branding comes from `settings/config` — never hardcoded
- `appSettings` is bootstrapped in `App.jsx` — no per-component Firestore fetches

## Key Architectural Decisions
- `shiftFinancials.js` is the ONLY place financial math should live
- `checkoutService.js` handles new orders; `orderService.js` handles factories + soft-delete
- Soft-delete pattern: `isDeleted: true` on orders + cascade to transactions
- No hardcoded services — admin manages everything in Firestore
- No premature abstractions — minimum complexity for current task

## User Preferences
- Concise responses, no fluff
- No emojis unless asked
- No backwards-compatibility hacks — change the code directly

## Next Major Feature: PC Timer System
Full architecture plan: `memory/pc-timer-system-plan.md`

### Summary
- PC cafe billing/timer system integrated into Kunek
- Client agent: **Electron** app on each PC (Windows Service + watchdog)
- Backend: Firestore real-time listeners + Cloud Functions for billing
- New collections: `stations`, `zones`, `rates`, `packages`, `sessions`, `station_logs`
- Offline: agent keeps local SQLite, counts down locally, reconciles on reconnect

### Current Progress
- ✅ **PC Map UI Overhaul**: High-density "Pondo-style" List View + Refined Station Cards (145x160).
- ✅ **Unified Start/Top-up Dialog**: One dialog for starting sessions and adding time.
- ✅ **Full Checkout Integration**: Digital payment support (GCash/Maya/Bank) and discounts for both sessions and top-ups.
- ✅ **Context Menu Parity**: Right-click context menus on both Grid and List views.

### Critical Architecture Decisions
- Time stored in **minutes** in wallets (not pesos) — decouples price from rate changes
- Session truth lives in **Firestore**; agent is enforcement layer only, never bills itself
- Agent authenticated via per-station Firebase custom token (minimal permissions)
- Lock screen = full-screen Electron window (not killable by user)
