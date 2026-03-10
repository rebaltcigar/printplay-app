# PrintPlay App — Claude Memory

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
