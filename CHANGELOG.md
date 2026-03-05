# Changelog

> All notable changes are documented here. For planned features, see [ROADMAP.md](ROADMAP.md).

## Format Rules

- **Version header**: `## [X.Y.Z] — YYYY-MM-DD`
- **Sections** (in this order, only include sections that have entries):
  `### Added` | `### Changed` | `### Fixed` | `### Removed` | `### Infrastructure`
- **Entries**: `- **Feature Name** — Description ending with a period.`
- **Infrastructure**: Firestore schema changes, new collections, indexes, security rules.
- No roadmap content — belongs in ROADMAP.md.

---

## [0.1.32] — 2026-03-05

### Fixed

- **Login flash on page refresh** — App now waits for Firebase auth state to resolve before rendering routes. Protected pages show an "Initializing…" loader on refresh instead of flashing the wrong page.

---

## [0.1.31] — 2026-03-05

### Added

- **Staff scheduling** — New Schedule tab in the admin panel. Week-view calendar with shift templates as rows and staff chips per cell. Supports add, edit, mark absent, assign coverage, and copy last week.
- **Shift templates** — Manage templates (name, start/end time) in Settings → Shift Templates. Templates can be disabled but not deleted; the last active template cannot be disabled. Seeds Morning, Afternoon, and Evening defaults on first load.
- **Multi-staff clock-in** — A second staff member can log in while a cashier's shift is active. They see a clock-in confirmation and are routed to a minimal dashboard (My Schedule, My Paystubs, Clock Out) with no POS access. Clock-in time is logged to `payroll_logs`.
- **Coverage flow** — Admin can mark staff absent and assign a covering staff member. Status tracks `absent` → `covered` with the covering staff's email and name recorded.
- **Copy last week** — One-click schedule copy to the current week with statuses reset to `scheduled`.
- **Login page redesign** — Full-screen dark layout with animated grid lines, rising particle canvas, and a glassmorphism card. Logo and store name shown at top of card. Four-phase flow: credentials → shift confirm / fallback / clock-in.
- **Loading screen shimmer** — Message text in `LoadingScreen` now uses an animated shimmer effect.

### Changed

- **Admin login bypass** — Admin and owner accounts are no longer blocked by the shift lock and always go straight to the admin dashboard.
- **Staff profile read-only** — Name and role fields in My Account are display-only; changes must go through an administrator.
- **Login loads immediately** — The app no longer shows an "Initializing…" screen before rendering the login page.

### Fixed

- **Paystubs blank on staff POS** — Corrected Firestore index from composite to single-field `fieldOverrides` for the `paystubs` collectionGroup query on `staffEmail`.

### Infrastructure

- New collections: `schedules`, `shiftTemplates`.
- New Firestore rules: `schedules`, `shiftTemplates`, `payroll_logs` (staff may update their own `clockOut`).
- Updated indexes: `paystubs` single-field collectionGroup index on `staffEmail`.

---

## [0.1.28] — 2026-03-05

### Changed

- **Payroll expanded row** — Moved the per-staff detail panel outside the `TableContainer` so it renders at full card width, eliminating horizontal scroll from the 9-column sub-table overflowing the 6-column outer table.
- **Payroll expanded row scroll** — Added `maxHeight: 60vh` with vertical scroll on the detail panel so tall content (many shifts, deductions) scrolls within the panel instead of overflowing.
- **Payroll single expand** — `expanded` state changed from a map to a single ID string; only one staff row can be expanded at a time, consistent with the full-width panel.
- **Paystub drawer** — Converted `PaystubDialog` from a full MUI Dialog to `DetailDrawer` (width 800). Staff selector stays on the left, paystub content on the right. Removed broken print CSS that was Dialog-specific.

### Removed

- **`RunDialog.jsx`** — Deleted; its content was inlined into `RunPayroll.jsx` in v0.1.27 and the file was no longer imported anywhere.

---

## [0.1.27] — 2026-03-05

### Added

- **Payroll 2-step wizard** — Removed redundant confirmation step. Flow is now Setup → Review & Post. "Post Payroll" opens a small inline confirmation dialog.
- **Payroll summary cards in Review step** — Replaced 8 cramped StatChips with a `SummaryCards` row showing Staff, Hours, Gross, Additions, Deductions, and Net.
- **Payroll All Runs — edit button** — Draft and approved runs now have an Edit button that switches to the Run Payroll tab with that run pre-loaded.
- **Payroll All Runs — summary cards** — Added KPI row above the runs table (Total Runs, Posted, Draft/Approved, Total Net Paid).
- **Payroll All Runs — drawer summary cards** — Replaced manual chips in the run detail drawer with `SummaryCards`.
- **Order Management summary cards** — Added KPI row above the orders table (Total Orders, Revenue, Unpaid/Charge count, Voided count).
- **Order details drawer** — Order details now open in a right-side `DetailDrawer` (width 620) with items table, payment info, void/edit history, and Receipt/Invoice print buttons in the footer.
- **Order edit drawer** — Edit order form now lives in the same `DetailDrawer` with `disableClose` during save to prevent accidental dismissal.

### Changed

- **Payroll simplified table** — Main staff table reduced from 11 columns to 6 (Expand, Staff, Hours, Gross, Additions, Net). Rate/hour editing and deduction breakdown moved into the expandable row.
- **Payroll Load Existing Run removed** — Draft and approved runs are opened from the All Runs tab instead of a setup-form dropdown.
- **Order state consolidation** — 6 separate dialog state variables replaced with a single `orderDrawer = { open, mode, order, saving }` object.

### Fixed

- **Order Management `user.email` crash** — `ReferenceError` in `confirmRestore` fixed by using `auth.currentUser?.email`.
- **Order Management import errors** — Removed unused `onSnapshot` import and fixed broken interleaved `const currency = fmtCurrency` between ESM imports.

---

## [0.1.26] — 2026-03-04

### Changed

- **Admin UI standardization** — Standardized internal admin tools to use `SummaryCards` and `DetailDrawer` components: Inventory Management, Service Catalog, and Expense Settings. Standardized page headers and icon usage across all admin modules.

---

## [0.1.25] — 2026-03-04

### Added

- **Inventory and POS synchronization** — Real-time stock deduction for retail items on checkout. Items with `trackStock: true` have their `stockCount` decremented atomically via Firestore on each completed checkout.
- **COGS tracking** — Standardized transaction schema to use `unitCost` across POS and P&L reports so Cost of Goods Sold is accurately tracked in the Profit & Loss statement.

### Fixed

- **Inventory legacy query** — Fixed a remaining query in `InventoryManagement.jsx` still filtering on `'Debit'` instead of `'Sale'`.

---

## [0.1.24] — 2026-03-04

### Removed

- **Data migration tool** — Removed Settings → Data Migration panel and `migrateCategoryValues.js` after successful production migration. The `services` collection category values are permanently updated (`'Debit'` → `'Sale'`, `'Credit'` → `'Expense'`).

---

## [0.1.23] — 2026-03-04

### Added

- **Data migration tool** — Admin panel for running one-time Firestore data migrations. Features a live progress bar, real-time timestamped log console with colour-coded levels (INFO / WARN / ERROR / DEBUG), debug toggle for per-document details, clipboard log export, idempotency warning, and a result summary card. Retry and re-run supported after success or failure.
- **COGS expense sub-type** — Added "COGS (Cost of Goods Sold)" as a third `financialCategory` option in Expense Types settings alongside OPEX and CAPEX.

### Changed

- **Service catalogue category values** — Renamed `category` field values in the `services` collection from accounting jargon (`'Debit'` / `'Credit'`) to plain English (`'Sale'` / `'Expense'`). All reads, writes, and filters updated across `ServiceCatalog`, `ExpenseSettings`, `usePOSServices`, `ExpenseManagement`, and `POS`.
- **Analytics classification** — `classifyTx` in `analytics.js` updated to recognise both new (`'sale'` / `'expense'`) and legacy (`'debit'` / `'credit'`) values for backward compatibility.
- **Shift financials** — `aggregateShiftTransactions` in `shiftFinancials.js` updated to use new category values with legacy fallback.
- **Dashboard KPI** — Expense detection now checks `category === 'expense'` (new) alongside `category === 'credit'` (legacy).
- **P&L report** — Legacy skip-filter updated to exclude both `'expense'` and `'credit'` transactions from the revenue line.

---

## [0.1.22] — 2026-03-04

### Added

- **`DetailDrawer` component** — Universal right-side slide panel replacing per-page dialogs across admin views.
- **`SummaryCards` component** — Reusable KPI card row shown above every admin table.
- **`useShiftOptions` hook** — Returns shifts with human-readable `SHIFT-XXXXXX` display IDs.
- **`useStaffList` hook extended** — Now also returns `emailToName`, `idToName`, and `userMap` alias.
- **Transactions page redesign** — Replaced 240px left sidebar with a horizontal filter bar. Table now shows 11 columns: Date, Type, Description, Staff name, Shift display ID, Order #, Amount, Method, Status, Actions. "View Details" opens a `DetailDrawer` with full audit trail.
- **Transactions status filter** — Single dropdown replaces 3 separate checkboxes (All / Active / Deleted / Edited).
- **Transactions summary cards** — KPI row showing Total Sales, Expenses, Net, row count, and live/archive badge.
- **Expense Log redesign** — Removed always-visible left-panel form. "Add Expense" and row editing now open in `DetailDrawer`. Summary cards show Total, OPEX, COGS, CAPEX breakdown.
- **Shift Detail View redesign** — 3-tab layout (Summary, Transactions, Orders) replacing the previous split-screen. Summary tab shows 7 KPIs, sales breakdown, expenses breakdown, and denominations.
- **Payroll wizard** — 3-step inline flow on Run Payroll tab with no modals: Period setup → Staff hours review → Confirm & Post. All Runs "View" opens a `DetailDrawer` with period, status, staff breakdown, and paystub access.

### Changed

- **Payroll state cleanup** — `Payroll.jsx` had 5 unused props and state variables removed.

---

## [0.1.21] — 2026-03-04

### Changed

- **POS checkout total display** — Order total is now the most prominent element in the checkout dialog: large bold display with high-contrast background in the center of the modal.

---

## [0.1.20] — 2026-03-04

### Added

- **Paystub shift detail** — Paystub shift entries now include Time (start/end) and Amount (pay per shift) columns.
- **Paystub regeneration** — "Regenerate Paystubs" button added to payroll run details for already-posted runs, allowing updates to existing paystubs without re-finalizing transactions.
- **Paystub auto-cleanup** — Finalizing a payroll run now automatically deletes previous paystub documents for that run to prevent duplicates.

### Changed

- **Payroll loader** — Replaced custom `Backdrop` / `CircularProgress` loaders in `RunPayroll.jsx` with the universal `LoadingScreen` component.

### Fixed

- **Payroll loading loop** — Resolved `ReferenceError: sumDenominations is not defined` in `payrollHelpers.js` caused by a missing internal import.

---

## [0.1.19] — 2026-03-04

### Added

- **User Management — Add user** — Create new Firebase Auth accounts from the admin panel using a secondary app instance so the admin session is never interrupted. A Firestore user doc is written immediately with name, role, and `suspended: false`.
- **User Management — Edit user** — Update a user's full name and role (Staff / Super Admin). Email is shown read-only as it is tied to Firebase Auth.
- **User Management — Reset password** — Sends a Firebase password-reset email with a single click.
- **User Management — Suspend / Activate** — Toggles a `suspended` field on the Firestore user doc. Suspended staff are blocked at login with a clear error message.
- **User Management — Soft delete** — Marks a user doc `deleted: true`, hiding them from the system. Firebase Auth account removal must be done separately in Firebase Console.
- **User Management — Search and filter** — Client-side search by name or email; role filter by toggle button group (All / Staff / Super Admin).
- **Login guard for suspended accounts** — Login now checks `suspended === true` after the role check and shows a friendly error message.

### Changed

- **`UserManagement.jsx` redesign** — Replaced the minimal read-only list with a full CRUD interface. Data source switched from one-shot `getDocs` to real-time `onSnapshot`.
- **`firebase.js`** — Now exports `firebaseConfig` to allow the secondary auth app instance used for user creation.
- **`Login.jsx`** — `humanizeAuthError` now maps `auth/account-suspended` to a user-friendly message.

### Fixed

- **Shifts table shortage for GCash / Charge transactions** — The Difference column showed a false shortage equal to the GCash or Charge amount on non-cash PC Rental sessions. Root cause: two code paths in `Shifts.jsx` (table render and CSV export) duplicated the expected-cash formula without calling `computeExpectedCash()`, so `pcNonCashSales` was never deducted. Both replaced with a single `computeExpectedCash(s, agg)` call.

---

## [0.1.18] — 2026-03-04

### Added

- **`useServiceList` hook** — Single Firestore `onSnapshot` subscription for the services collection, replacing three duplicate subscriptions in `Shifts.jsx`, `ShiftDetailView.jsx`, and `Transactions.jsx`.

### Changed

- **`ShiftConsolidationDialog`** — Replaced 7 separate `useMemo` financial calculations with a single `computeShiftFinancials()` call. Cash/GCash/AR breakdown now correctly excludes non-cash PC Rental payments.
- **`ShiftDetailView`** — Replaced 6 separate `useMemo` financial calculations with `computeShiftFinancials()`. Now uses `useServiceList` hook.
- **`Shifts`** — Removed dead users listener and inline services subscription. Now uses `useServiceList`.
- **`Transactions`** — Removed redundant `staffSelectOptions` state. Now uses `useServiceList` for dynamic expense lookups. Fixed missing `useStaffList` import.
- **`ExpenseManagement`** — Replaced 13-line inline CSV blob/anchor creation with a single `downloadCSV()` call.
- **`RunPayroll`** — Parallelized Firestore reads across all four payroll functions using `Promise.all`. Per-shift advance queries in `generatePreview` now run in one batch instead of sequentially.

### Fixed

- **`Transactions` hardcoded Firestore ID** — Removed hardcoded document ID used as expense parent ID; expense sub-services are now looked up dynamically by service name.

---

## [0.1.17] — 2026-03-04

### Added

- **`shiftFinancials.js` utility** — Single source of truth for all shift financial computations. Exports `computeShiftFinancials`, `computeExpectedCash`, `aggregateShiftTransactions`, `sumDenominations`, and `computeDifference`. Used by EndShiftDialog, Shifts admin table, ShiftConsolidationDialog, and payroll.
- **`usePOSServices` hook** — Wraps the Firestore services subscription with POS-standard filtering (active, non-credit, non-adminOnly, PC Rental always first). Replaces duplicate 40-line `useEffect` blocks in `POS.jsx` and `OrderManagement.jsx`.
- **`useStaffList` hook** — Wraps `onSnapshot(users)` returning `{ staffOptions, userMap }`. Replaces 6 duplicate subscriptions across components.

### Changed

- **`payrollHelpers.js`** — `sumDenominations` is now re-exported from `shiftFinancials.js`; the duplicate implementation is removed.
- **`EndShiftDialog`** — Replaced 6 inline financial `useMemo` hooks with a single `computeShiftFinancials()` call.
- **13 components refactored** — `Transactions`, `ExpenseManagement`, `ShiftDetailView`, `POS`, `OrderManagement`, `SimpleReceipt`, `ServiceInvoice`, `EndShiftDialog`, `OrderDetailsDialog`, `Shifts`, `AdminHome`, `FinancialPnL`, and `OrderDetailsDialog` now import from shared utilities instead of defining local copies.

---

## [0.1.16] — 2026-03-04

### Added

- **`formatters.js` utility** — Centralized currency formatting, date helpers (`toDateInput`, `toDatetimeLocal`, `fmtDateTime`), `identifierText`, and `downloadCSV` into a single module, eliminating redundant local definitions.
- **`printHelper.js` utility** — Merged `receiptHelper.js` and `invoiceHelper.js` into a single file with a unified `normalizeOrderData` function and shared print lock. Old export names retained as aliases.

### Changed

- **Payroll utilities merged** — `payroll_util.js` consolidated into `payrollHelpers.js`.
- **`resolveHourlyRate`** — Now handles both `rateHistory` (old schema) and `effectiveRates` (new schema) field names for safe compatibility during data migrations.
- **ID generator fallback** — Fallback IDs from `idGenerator.js` now include a random suffix to prevent collisions during concurrent Firestore transaction failures.

### Fixed

- **`ExpenseManagement` crash** — Resolved `ReferenceError: showInfo is not defined` when submitting expense forms with missing required fields. All `showInfo` calls replaced with `showSnackbar`.
- **Payroll date timezone bug** — `tsFromYMD` in `payrollHelpers.js` now anchors dates to `+08:00` (PHT) to prevent off-by-8-hour payroll period boundary errors.

### Removed

- **`payroll_util.js`** — Deleted after full merge into `payrollHelpers.js`.
- **`debug_shifts.js`** — Removed leftover dev-only debug script from the project root.

---

## [0.1.15] — 2026-03-04

### Added

- **Expenses — load all** — Added "Load All Filtered" and "Load All Expenses" buttons to fetch wide date ranges or the entire database without pagination. Filters apply correctly to all fetched data.

---

## [0.1.14] — 2026-03-03

### Added

- **Transactions — load all** — Added "Load All Filtered" and "Load All Transactions" buttons to fetch wide date ranges or the entire database without pagination.

---

## [0.1.13] — 2026-02-16

### Removed

- **Migration tool** — Removed the "Fix Data" tool after successful production migration.

---

## [0.1.12] — 2026-02-16

### Added

- **Migration tool** — Added a "Fix Data" tool in the Shifts panel to retroactively calculate cash/GCash/AR totals for accurate payroll shortage calculations.
- **Universal loader** — Full-screen loading overlay implemented for critical actions such as saving expenses.

### Fixed

- **Payroll shortage calculation** — Logic updated to correctly calculate expected cash by excluding GCash and PayLater transactions.
- **Shift consolidation double-count** — Fixed PC Rental transactions being double-counted in the Shift Consolidation view.

---

## [0.1.11] — 2026-02-13

### Added

- **Order Management hub** — Dedicated interface for tracking, searching, and filtering all customer orders with detailed status history.
- **Order and item restoration** — Restore capability for voided orders and individual items with full audit logging of reason and staff details.
- **Staff leaderboard live sync** — Dashboard leaderboard and KPI cards now reflect sales in real time using live transaction aggregation.
- **`PageHeader` component** — Universal standardized header implemented across all admin and reporting views.

### Changed

- **Audit compliance** — Reason tracking mandated for all administrative deletions and edits across Dashboard and Order Management.
- **Leaderboard logic** — Switched from cached shift totals to live transaction sums for immediate accuracy.

### Fixed

- **Transaction display IDs** — New items added to existing orders now correctly generate sequential `TX-XXXXXX` IDs.
- **Leaderboard PC Rental double-count** — Fixed by standardizing aggregation logic across components.

---

## [0.1.10] — 2026-02-13

### Added

- **Shift Audit Debugger** — "Debug Calculations" tool in Shift Detail view to help identify discrepancies between list views and shift receipts.

### Fixed

- **PC Rental double-counting** — PC Rental transactions now excluded from standard services totals (they are added manually at end of shift) while still contributing correctly to payment method breakdowns for expected-cash calculations.
- **Item matching** — Added case-insensitive item normalization for more robust calculation logic across shift views.

---

## [0.1.9] — 2026-02-13

### Added

- **Transaction pagination progress** — `LinearProgress` indicators added to the Transactions table (web and mobile) during background data fetching.
- **Transactions "Load More"** — Load More button at the bottom of the transaction list for both web and mobile views.
- **Settings loading state** — Loading indicator added to Store Settings during long-running tasks such as shift ID backfilling.

### Changed

- **Loading screen aesthetics** — Global `LoadingScreen` progress bar now has a subtle glow effect.
- **Transaction pagination logic** — Refined `attachStream` and `fetchNextPage` for consistent loading states and better "All Time" view support.

### Fixed

- **Transaction loading persistence** — Resolved loading screen not dismissing when fetching wide date ranges.
- **Shift Audit table styling** — Fixed React warning and improved text wrapping for long service names.

---

## [0.1.8] — 2026-02-13

### Fixed

- **POS transaction IDs on order edit** — New items added to existing orders now correctly generate `TX-` IDs.
- **POS checkout flow** — Checkout dialog now closes and change dialog appears correctly after updating an order.
- **POS loading feedback** — Added "Processing…" loading indicator during order updates.
- **ID consistency** — System now consistently uses `TX-` for general transactions/debts and `EXP-` for expenses.
- **POS and Transactions stability** — Fixed `ReferenceError` crashes in both components.

---

## [0.1.7] — 2026-02-12

### Added

- **Universal dark theme** — Consistent dark theme across POS, Admin Dashboard, and all dialogs via centralized `src/theme.js`.
- **Universal `LoadingScreen`** — Replaced legacy `AdminLoading` with a universal component supporting both initial page loads and overlay/busy states.
- **Client-side routing** — Implemented `react-router-dom` with a clear separation between Staff POS (`/pos`) and Admin Console (`/admin`).

### Changed

- **POS integration** — POS now correctly uses the global theme and `LoadingScreen`.
- **Staff shift prompt** — Staff without an active shift are now correctly prompted to "Start Shift" on login instead of entering a redirect loop.

### Fixed

- **Infinite redirect loop** — Staff users without an active shift were trapped in a redirect loop between `/pos` and `/login`.
- **POS theme fallback** — POS now correctly inherits the intended dark/red theme instead of falling back to a lighter scheme.

---

## [0.1.6] — 2026-02-12

### Added

- **Dynamic branding** — Store logo and name fetched from settings and displayed on the login screen, staff dashboard, and admin header.
- **Inter font** — Unified typography across the entire application.
- **Automatic versioning** — Vite configured to pull the version number from `package.json` and display it dynamically on the login page.
- **Logo verification** — "Preview" button and verification UI for logo URLs in Store Settings.

### Changed

- **Settings layout** — Reorganized settings tabs (Profile, POS, Receipt, Security, Hardware, Expenses, Data Core).
- **Admin header** — Store name display refined to white, weight 600, natural case.
- **Sidebar UX** — Toggle button moved to the top of the sidebar.

### Fixed

- **Login imports** — Fixed missing `useEffect` import in the Login component.

---

## [0.1.5] — 2026-02-12

### Added

- **Service Invoice (letter size)** — Full-page 8.5" × 11" service invoice format compliant with RMC No. 77-2024.
- **Store Profile fields** — TIN and Mobile fields added to Store Profile for compliance.
- **Dashboard invoice button** — "INVOICE" button added to the Dashboard for quick printing of active orders.

### Fixed

- **Invoice layout** — Refined header/footer spacing, aligned unit columns, and balanced typography.
- **Invoice pagination** — Robust overflow logic to prevent unnecessary blank pages when printing.
- **Customer data** — Customer dialogs updated to include TIN and Address; Phone field removed to streamline flow.
- **Ad-hoc invoice printing** — Fixed invoices not printing for transactions without a linked POS order.

---

## [0.1.4] — 2026-02-12

### Fixed

- **Double printing** — Receipts were printing twice due to duplicate state triggers.
- **Receipt consistency** — Unified all receipt logic (new orders, history, reprints) to use a single standardized format.
- **Customer data on receipts** — Added support for customer details (Name, Phone, Address, TIN) on receipts.
- **Global print lock** — Window-level lock implemented to prevent concurrent print dialogs.

---

## [0.1.3] — 2026-02-10

### Fixed

- **Payroll deduction scope** — Deductions now restricted to "Salary Advance" only. Manual "Salary" expenses (bonuses) are excluded from deductions.
- **Paystub net pay** — Net Pay calculation on paystubs now matches the actual payout amount.
- **Payroll double-counting** — Prevented double expense entries for additions in payroll runs.
- **Shift sales calculation** — Transactions with unknown categories now default to sales instead of being excluded from shift totals.
