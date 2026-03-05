# Changelog

All notable changes to this project will be documented in this file.

## [0.1.31] - 2026-03-05

### Staff Scheduling, Multi-Staff Login & Login Redesign

#### Added
- **Staff Scheduling**: New Schedule tab in the admin panel. Week-view calendar with shift templates as rows and staff chips per cell. Add, edit, mark absent, assign coverage, copy last week.
- **Shift Templates**: Manage templates (name, start/end time) in Settings → Shift Templates. Disable/enable instead of hard delete. Cannot disable last active template. Seeds Morning / Afternoon / Evening defaults on first load.
- **Multi-staff clock-in**: A second staff member can log in while a cashier's shift is active. Shown a "Clock In" confirmation, then routed to a minimal dashboard (My Schedule, My Paystubs, Clock Out). No POS access. Clock-in time logged to `payroll_logs`.
- **Coverage flow**: Admin can mark staff absent and assign a covering staff member. Status tracks `absent` → `covered` with `coveredByEmail/Name`.
- **Copy Last Week**: One-click schedule copy to current week (status reset to `scheduled`).
- **Login page redesign**: Full-screen dark layout with animated grid lines, rising particle canvas, and glassmorphism card. Logo and store name displayed at top of card. Four-phase flow: credentials → shift confirm / fallback / clock-in.
- **Loading screen shimmer**: Message text in the universal `LoadingScreen` now uses an animated shimmer effect.

#### Changed
- **Admin login bypass**: Admin / owner accounts are no longer blocked by the shift lock — they always go straight to the admin dashboard.
- **Staff profile display-only**: Name and role fields in My Account are read-only; changes must go through an administrator.
- **Login loads immediately**: App no longer shows an "Initializing…" screen before rendering the login page.

#### Fixed
- **Paystubs blank on staff's POS**: Corrected Firestore index from composite to single-field `fieldOverrides` for the `paystubs` collectionGroup query on `staffEmail`.

#### Firestore
- New collections: `/schedules`, `/shiftTemplates`
- New rules: `schedules`, `shiftTemplates`, `payroll_logs` (staff may update their own `clockOut`)
- Updated indexes: `paystubs` single-field collectionGroup index on `staffEmail`

## [0.1.28] - 2026-03-05

### Payroll — Expanded Row & Paystub Fixes

- **Expanded row full-width**: Moved per-staff detail panel outside the `TableContainer`. It now renders at full Card width below the table, eliminating horizontal scroll caused by the 9-column shifts sub-table overflowing the 6-column outer table.
- **Expanded row vertical scroll**: Added `maxHeight: 60vh` + `overflowY: auto` on the detail panel so tall content (many shifts, deductions) scrolls within the panel instead of overflowing.
- **Single expand**: Changed `expanded` state from a map `{ [id]: bool }` to a single ID string — only one staff row can be expanded at a time, consistent with the full-width panel.
- **Paystub — DetailDrawer**: Converted `PaystubDialog` from a full MUI Dialog to `DetailDrawer` (width=800). Staff selector stays on the left, paystub content on the right. Removed broken print CSS (Dialog-specific selectors).
- **Dead code removal**: Deleted `RunDialog.jsx` — its content was inlined into `RunPayroll.jsx` in v0.1.27; the file was no longer imported anywhere.
- **Admin popup audit**: Confirmed all remaining Dialog usages in admin components are small appropriate forms (Shifts add/edit/delete, UserManagement add/edit, RunPayroll confirm dialogs). No further large content dialogs found.

## [0.1.27] - 2026-03-05

### Payroll — UX Rework

- **2-Step Wizard**: Removed redundant Step 2 (Confirm/Summary). Flow is now Setup → Review & Post. "Post Payroll" opens a small confirmation dialog inline.
- **SummaryCards in Review step**: Replaced 8 crammed StatChips with a proper `SummaryCards` row showing Staff, Hours, Gross, Additions, Deductions, NET.
- **Simplified table**: Main staff table reduced from 11 columns to 6 (Expand, Staff, Hours, Gross, Additions, NET). Rate/hr editing and deduction breakdown moved into the expandable row where they belong.
- **Removed "Load Existing Run"** dropdown from Setup form. Draft/approved runs are now opened from the All Runs tab instead.
- **All Runs — Edit button**: Draft and approved runs now have an Edit button that switches to Run Payroll tab with that run loaded.
- **All Runs — SummaryCards**: Added KPI row above the runs table (Total Runs, Posted, Draft/Approved, Total Net Paid).
- **All Runs — Drawer SummaryCards**: Replaced manual Chips in the run detail drawer with SummaryCards.
- **Payroll.jsx wiring**: `openRunId` + `onEditRun` prop chain connecting AllRuns → RunPayroll tab switch.

### Order Management — Standards Pass

- **SummaryCards**: Added KPI row above the table (Total Orders, Revenue, Unpaid/Charge count, Voided count).
- **Details Dialog → DetailDrawer**: Order details now open in a right-side drawer (width 620). Same content — items table, payment info, void/edit history — plus Receipt and Invoice print buttons in the footer.
- **Edit Dialog → DetailDrawer**: Edit order form now lives in the same DrawerDetails (mode: 'edit'). Closes on save, `disableClose` during save prevents accidental dismissal.
- **State consolidation**: 6 separate dialog state vars (`selectedOrder`, `detailsOpen`, `editDialogOpen`, `editingOrder`, etc.) replaced with a single `orderDrawer = { open, mode, order, saving }` object.
- **Bug fix**: `user.email` in `confirmRestore` was `ReferenceError` — fixed to `auth.currentUser?.email`.
- **Import fix**: Removed unused `onSnapshot` import. Fixed broken interleaved `const currency = fmtCurrency` between ESM imports (renamed to inline alias).

## [0.1.26] - 2026-03-04

### UI Standardization
- **Universal Components**: Standardized internal admin tools to use `SummaryCards` and `DetailDrawer` components.
- **Inventory Management**: Implemented `SummaryCards` for cost/retail valuation and `DetailDrawer` for restocking.
- **Service Catalog**: Implemented `SummaryCards` for item type counts and `DetailDrawer` for item management.
- **Expense Settings**: Implemented `SummaryCards` for OPEX/CAPEX/COGS breakdown and `DetailDrawer` for expense type management.
- **Visual Cleanup**: Standardized page headers and icon usage across all admin modules.

## [0.1.25] - 2026-03-04

### Added
- **Inventory & POS Synchronization**: Implemented real-time stock deduction for retail items. When a checkout is completed in the POS, any item marked as `trackStock: true` in the catalogue will have its `stockCount` automatically decremented via Firestore atomicity.
- **Improved COGS Reporting**: Standardized the transaction schema to use `unitCost` across POS and P&L reports, ensuring that Cost of Goods Sold is accurately tracked and displayed in the Profit & Loss statement.

### Fixed
- **Inventory Legacy Query**: Fixed a remaining legacy query in `InventoryManagement.jsx` that was still looking for `'Debit'` instead of `'Sale'`.

## [0.1.24] - 2026-03-04


### Removed
- **Data Migration Tool**: Removed `Settings → Data Migration` panel and the `migrateCategoryValues.js` script after successful production migration. The `services` collection category values have been permanently updated (`'Debit'` → `'Sale'`, `'Credit'` → `'Expense'`).

## [0.1.23] - 2026-03-04


### Added
- **Data Migration Tool** (`Settings → Data Migration`): Admin panel for running one-time Firestore data migrations. Features a live progress bar, real-time timestamped log console with colour-coded levels (INFO / WARN / ERROR / DEBUG), DEBUG toggle to show per-document change details, copy-to-clipboard log export, idempotency pre-run warning, and a result summary card showing updated vs. skipped counts. Retry and re-run supported after both success and failure.
- **COGS expense sub-type**: Added "COGS (Cost of Goods Sold)" as a third `financialCategory` option in Expense Types settings alongside OPEX and CAPEX, for tracking direct cost of resold goods.

### Changed
- **Catalogue category values redesigned**: Renamed `category` field values in the `services` Firestore collection from accounting jargon (`'Debit'` / `'Credit'`) to plain English (`'Sale'` / `'Expense'`). All reads, writes, and filters across the codebase updated accordingly (`ServiceCatalog`, `ExpenseSettings`, `usePOSServices`, `ExpenseManagement`, `POS`).
- **Analytics classification** (`analytics.js` → `classifyTx`): Updated to recognise both new values (`'sale'` / `'expense'`) and legacy values (`'debit'` / `'credit'`) for backward compatibility with existing transaction history.
- **Shift financials** (`shiftFinancials.js` → `aggregateShiftTransactions`): Updated category comparison and fallback assignment to use new values with legacy fallback.
- **Dashboard KPI** (`AdminHome.jsx`): Expense detection now checks `category === 'expense'` (new) in addition to `category === 'credit'` (legacy) so existing transactions continue to display correctly.
- **P&L Report** (`FinancialPnL.jsx`): Legacy fallback skip-filter updated to exclude both `'expense'` and `'credit'` category transactions from the revenue line.

## [0.1.22] - 2026-03-04


### Added
- **Shared components**: new zero-duplication UI elements for universal use across the app.
  - `DetailDrawer.jsx` – Universal right-side slide panel replacing per-page dialogs.
  - `SummaryCards.jsx` – Reusable KPI card row shown above every table.
  - `useShiftOptions.js` hook – returns shifts with human-readable `SHIFT-XXXXXX` display IDs.
  - `useStaffList.js` extended to return `emailToName`, `idToName`, and `userMap` alias.

### Transactions page
- Removed 240px left sidebar and replaced with horizontal filter bar above table.
- Table now shows 11 clean columns: Date, Type, Description, Staff name (not email), Shift display ID (not blob), Order #, Amount, Method, Status, Actions.
- SummaryCards row: Total Sales / Expenses / Net / Row count + live/archive badge.
- "View Details" opens a DetailDrawer with full audit trail (who created, who edited, why deleted, all cross-references).
- Status filter dropdown replaces 3 separate checkboxes (All / Active / Deleted / Edited).

### Expense Log
- Removed always-visible left-panel form.
- "Add Expense" button in page header opens form in DetailDrawer; editing a row opens same drawer pre-populated.
- SummaryCards: Total / OPEX / COGS / CAPEX breakdown.
- Table: Date, Type chip, Category chip, Staff name, Notes, Qty×Price, Total, Status.

### Shift Detail View
- Introduced 3-tab layout replacing split-screen:
  - Summary – SummaryCards (7 KPIs) + Sales breakdown + Expenses breakdown + Denominations.
  - Transactions – Full CRUD table with Add Transaction → DetailDrawer form, bulk select, edit dates.
  - Orders – Live Firestore query by `shiftId`, showing all orders linked to this shift.
- Back button + shift title/subtitle in header with Consolidate, Debug, Export CSV actions.

### Payroll
- 3-step inline wizard on Run Payroll tab; no more modals:
  1. Period + pay date + expense mode setup
  2. Staff hours review table (inline, was RunDialog)
  3. Confirm & Post summary
- Paystubs open via `PaystubDialog` triggered from within page, not nested modal.
- AllRuns: "View" opens a DetailDrawer showing period, status, staff breakdown, and paystub access – no nested modals.
- `Payroll.jsx` cleaned up, removing 5 unused props and state variables.

## [0.1.21] - 2026-03-04

### Changed
- **POS Checkout UI**: Re-designed the checkout modal to make the **Order Total** the most prominent element. It now features a large, bold display in the center of the modal with a high-contrast background, ensuring staff and customers see the total immediately.

 
## [0.1.20] - 2026-03-04

### Added
- **Detailed Paystubs**: Paystub shift entries now include "Time" (start/end) and "Amount" (pay per shift) columns for better transparency.
- **Paystub Regeneration**: Added a "Regenerate Paystubs" button to the Payroll Run Details dialog for already posted runs, allowing updates to existing paystubs without re-finalizing transactions.
- **Paystub Auto-Cleanup**: Finalizing a payroll run now automatically deletes previous paystub documents for that run to prevent duplicates.

### Changed
- **Universal Loader in Payroll**: Replaced the custom `Backdrop` and `CircularProgress` loaders in `RunPayroll.jsx` with the universal `LoadingScreen` component (linear progress) for a consistent UI experience.

### Fixed
- **Payroll Loading Loop**: Resolved a `ReferenceError: sumDenominations is not defined` in `payrollHelpers.js` caused by a missing internal import.

 
## [0.1.19] - 2026-03-04

### Added
- **User Management — Add User**: Create new Firebase Auth accounts directly from the admin panel using a secondary app instance (admin session is never interrupted). A Firestore user doc is written immediately with name, role, and `suspended: false`.
- **User Management — Edit User**: Update a user's full name and role (Staff / Super Admin) via an edit dialog. Email is shown read-only since it is tied to Firebase Auth.
- **User Management — Reset Password**: Sends a Firebase password-reset email to the user's address with a single click.
- **User Management — Suspend / Activate**: Toggle a `suspended` field on the Firestore user doc. Suspended staff are blocked at login immediately with a clear error message.
- **User Management — Delete (soft)**: Marks the user doc `deleted: true`, hiding them from the system. A note in the UI explains that their Firebase Auth account must be removed separately from Firebase Console.
- **User Management — Search & Filter**: Search by name or email (client-side) and filter by role (All / Staff / Super Admin) via a toggle button group.
- **Login guard for suspended accounts**: Staff login in `App.jsx` now checks `suspended === true` after the role check and throws `auth/account-suspended`, which `Login.jsx` displays as a friendly error message.

### Changed
- **`UserManagement.jsx`**: Full redesign — replaced the minimal read-only list with a full CRUD interface. Switched data source from one-shot `getDocs` to real-time `onSnapshot` so the list updates live. Biometric enrollment button retained.
- **`firebase.js`**: Exports `firebaseConfig` to allow the secondary auth app instance used for user creation.
- **`Login.jsx`**: `humanizeAuthError` now maps `auth/account-suspended` to a user-friendly message.

### Fixed
- **Shifts table — incorrect shortage for GCash / Charge transactions**: The "Difference" column in the Shifts admin table was showing a false shortage equal to the GCash or Charge amount when a non-cash payment was logged against a PC Rental session. Root cause: two code paths (JSX table render and CSV export) in `Shifts.jsx` duplicated the expected-cash formula without calling the shared `computeExpectedCash()` utility, so `pcNonCashSales` was never deducted from `pcRentalTotal`. Both replaced with a single `computeExpectedCash(s, agg)` call. EndShiftDialog, ShiftConsolidationDialog, and Payroll were already correct.

## [0.1.18] - 2026-03-04

### Added
- **`useServiceList` hook** (`src/hooks/useServiceList.js`): Single Firestore `onSnapshot` subscription for the services collection, replacing three duplicate subscriptions in `Shifts.jsx`, `ShiftDetailView.jsx`, and `Transactions.jsx`. Returns `serviceMeta`, `parentServices`, `parentServiceNames`, and `expenseServiceNames` shaped for each consumer's needs.

### Changed
- **`ShiftConsolidationDialog.jsx`**: Replaced 7 separate `useMemo` financial calculations with a single `computeShiftFinancials()` call from `shiftFinancials.js`. Cash/GCash/AR breakdown values now correctly exclude non-cash PC Rental payments from the cash drawer total.
- **`ShiftDetailView.jsx`**: Replaced 6 separate `useMemo` financial calculations with a single `computeShiftFinancials()` call. Removed inline `onSnapshot(services)` subscription — now uses `useServiceList` hook.
- **`Shifts.jsx`**: Removed dead users `onSnapshot` listener and inline services `onSnapshot` subscription. Now uses `useServiceList` hook for `serviceMeta`.
- **`Transactions.jsx`**: Removed redundant `staffSelectOptions` state that was a manual sync copy of `staffOptions`. Removed inline services `onSnapshot` with hardcoded expense parent ID — now uses `useServiceList` hook for dynamic, named lookups. Fixed missing `useStaffList` import (pre-existing bug).
- **`ExpenseManagement.jsx`**: Replaced 13-line inline CSV blob/anchor/URL creation with a single `downloadCSV()` call from `formatters.js`.
- **`RunPayroll.jsx`**: Parallelized Firestore reads across all four payroll functions (`generatePreview`, `loadRun`, `saveEditsToRun`, `finalizeRun`) using `Promise.all`. Most impactful: per-shift advance queries in `generatePreview` now execute in one parallel batch instead of sequentially (e.g. 20 shifts → ~20× fewer Firestore round trips).

### Fixed
- **`Transactions.jsx`**: `useStaffList` was called but never imported — fixed missing import statement.
- **`Transactions.jsx`**: Hardcoded Firestore document ID `"9JlYs3n6k3bsebkLq7A9"` used as expense parent ID removed — expense sub-services are now looked up dynamically by service name.

## [0.1.17] - 2026-03-04

### Added
- **Shift Financials Utility** (`src/utils/shiftFinancials.js`): Single source of truth for all shift financial computations. Exports `computeShiftFinancials`, `computeExpectedCash`, `aggregateShiftTransactions`, `sumDenominations`, and `computeDifference`. All shift money math now flows through one place — EndShiftDialog, Shifts admin table, ShiftConsolidationDialog, and payroll all use this.
- **`usePOSServices` hook** (`src/hooks/usePOSServices.js`): React hook wrapping the Firestore `services` collection subscription with POS-standard filtering (active, non-credit, non-adminOnly, PC Rental always first). Replaces identical 40-line `useEffect` blocks in `POS.jsx` and `OrderManagement.jsx`.
- **`useStaffList` hook** (`src/hooks/useStaffList.js`): React hook wrapping `onSnapshot(users)`, returning `{ staffOptions, userMap }`. Replaces 6 identical subscriptions across components.

### Changed
- **`payrollHelpers.js`**: `sumDenominations` is now re-exported from `shiftFinancials.js` — no longer a duplicate implementation.
- **`EndShiftDialog.jsx`**: Replaced 6 inline financial `useMemo` hooks with a single `computeShiftFinancials()` call.
- **`ShiftConsolidationDialog.jsx`**: Replaced inline denominations `useMemo` with `sumDenominations()` from shared utility.
- **`Shifts.jsx`**: Removed local `calculateOnHand()` and `aggregateShiftTransactions()` functions (replaced by shared implementations). Uses `useStaffList` hook.
- **`ShiftDetailView.jsx`, `POS.jsx`, `OrderManagement.jsx`, `Transactions.jsx`, `ExpenseManagement.jsx`**: All now use `useStaffList` hook for staff/users data.
- **`POS.jsx`, `OrderManagement.jsx`**: Both now use `usePOSServices` hook for services data — guaranteed identical filtering rules.

## [0.1.16] - 2026-03-04

### Added
- **Shared Formatters Utility** (`src/utils/formatters.js`): Centralized all currency formatting, date helpers (`toDateInput`, `toDatetimeLocal`, `fmtDateTime`), `identifierText`, and `downloadCSV` into a single utility module to eliminate redundant local definitions across components.
- **Unified Print Helper** (`src/utils/printHelper.js`): Merged `receiptHelper.js` and `invoiceHelper.js` into a single file with a unified `normalizeOrderData` function and a shared print lock. Old export names retained as backward-compatible aliases.

### Changed
- **Payroll Utilities Merged**: Consolidated `payroll_util.js` into `payrollHelpers.js`. The standalone `payroll_util.js` file has been removed.
- **`resolveHourlyRate`**: Now handles both `rateHistory` (old schema) and `effectiveRates` (new schema) field names for safe compatibility during data migrations.
- **ID Generator Fallback**: Fallback IDs from `idGenerator.js` now include a random suffix to prevent ID collisions during concurrent Firestore transaction failures.
- **13 Components Refactored**: `Transactions`, `ExpenseManagement`, `ShiftDetailView`, `POS`, `OrderManagement`, `SimpleReceipt`, `ServiceInvoice`, `EndShiftDialog`, `OrderDetailsDialog`, `Shifts`, `AdminHome`, `FinancialPnL`, and `OrderDetailsDialog` all now import from shared utilities instead of defining local copies.

### Fixed
- **Critical Crash in ExpenseManagement**: Resolved a `ReferenceError: showInfo is not defined` crash that occurred when submitting expense forms with missing required fields (expense type, staff selection, or edit reason). All `showInfo` calls replaced with `showSnackbar`.
- **Payroll Date Timezone Bug**: `tsFromYMD` in `payrollHelpers.js` now anchors dates to `+08:00` (PHT) to prevent off-by-8-hour payroll period boundary errors on some systems.

### Removed
- **`src/utils/payroll_util.js`**: Deleted after full merge into `payrollHelpers.js`.
- **`debug_shifts.js`**: Removed leftover dev-only debug script from the project root.

## [0.1.15] - 2026-03-04

### Added
- **Expenses Page**: Added "Load All Filtered" and "Load All Expenses" buttons to quickly fetch wide date ranges or the entire database without pagination. Filters will also apply correctly to all fetched data instead of only paginated groups.

## [0.1.14] - 2026-03-03

### Added
- **Transactions Page**: Added "Load All Filtered" and "Load All Transactions" buttons to quickly fetch wide date ranges or the entire database without pagination.
 
## [0.1.13] - 2026-02-16

### Removed
- **Migration Tool**: Removed the "Fix Data" tool after successful production migration.

## [0.1.12] - 2026-02-16

### Added
- **Migration Tool**: Added a "Fix Data" tool in the Shifts panel to retroactive calculate cash/gcash/ar totals for effective payroll shortage calculation.
- **Universal Loader**: Implemented a full-screen loading overlay for critical actions like saving expenses.

### Fixed
- **Payroll Shortage Calculation**: Updated logic to correctly calculate "Expected Cash" by excluding GCash and PayLater transactions, ensuring accurate shortage detection.
- **Consolidation Logic**: Fixed an issue where PC Rental transactions were double-counted in the Shift Consolidation view.

## [0.1.11] - 2026-02-13

### Added
- **Order Management Hub**: Dedicated interface for tracking, searching, and filtering all customer orders with detailed status history.
- **Order & Item Restoration**: Implemented a robust "Restore" capability for voided orders and individual items, including full audit logging of reasons and staff details.
- **Cross-Component Synchronization**: Real-time sales reflection on the Dashboard's Staff Leaderboard and KPI cards using live transaction aggregation.
- **Universal Standardized Headers**: Implemented a unified `PageHeader` component across all administrative and reporting views for a premium, consistent UI/UX.

### Changed
- **Audit Compliance**: Mandated reason tracking for all administrative deletions and edits across the Dashboard and Order Management modules.
- **Leaderboard Logic**: Switched the Staff Leaderboard from cached shift totals to live transaction sums for immediate accuracy.

### Fixed
- **Transaction Display IDs**: Ensured newly created transactions from order edits correctly generate sequential `TX-XXXXXX` IDs for consistent shift auditing.
- **Leaderboard PC Rental Counting**: Fixed potential double-counting of PC Rental in the dashboard by standardizing aggregation logic across all components.

## [0.1.10] - 2026-02-13
 
### Added
- **Shift Audit Debugger**: Integrated a new "Debug Calculations" tool in the Shift Detail view to help administrators identify discrepancies between list views and shift receipts.
 
### Fixed
- **PC Rental Double-Counting**: Hardcoded special logic for "PC Rental" transactions to exclude them from standard services totals (since they are added manually at end-of-shift) while still maintaining accurate payment method breakdowns (GCash/Charge) for "Expected Cash" calculations.
- **Improved Item Matching**: Added case-insensitive item normalization for more robust calculation logic across all shift views.
 
## [0.1.9] - 2026-02-13

### Added
- **Pagination Loading Bars**: Added top-aligned `LinearProgress` indicators to the Transaction table (both Web and Mobile) to provide visual feedback during background data fetching.
- **"Load More" Button**: Implemented a "Load More" button at the bottom of the Transaction list for efficient navigation of large datasets in both Web and Mobile views.
- **Settings Loading State**: Added a loading indicator to Store Settings to improve user feedback during long-running tasks like shift ID backfilling.

### Changed
- **Loading Screen Aesthetics**: Enhanced the global `LoadingScreen` with a subtle glow effect (`boxShadow`) on the progress bar for a more premium, modern feel.
- **Transaction Pagination Logic**: Refined `attachStream` and `fetchNextPage` in `Transactions.jsx` to ensure consistent loading states and better support for "All Time" views.

### Fixed
- **Transaction Loading Persistence**: Resolved the issue where the loading screen would not disappear when fetching wide date ranges in the Transactions component.
- **Shift Audit Table Styling**: Fixed a React warning and improved text wrapping for long service names in the Shift Audit view.

## [0.1.8] - 2026-02-13

### Fixed
- **POS Transaction IDs**: Resolved an issue where new items added to an *existing* order were not generating "TX-" IDs.
- **POS UI Flow**: Fixed checkout dialog not closing and change dialog not appearing after updating an order.
- **POS Feedback**: Added a loading indicator ("Processing...") during order updates to provide visual feedback.
- **ID Consistency**: Enhanced system to consistently use "TX-" for general transactions/debts and "EXP-" for expenses.
- **Stability**: Fixed `ReferenceError` crashes in POS and Transactions components.

## [0.1.7] - 2026-02-12

### Added
- **Universal Dark Theme**: Implemented a consistent dark theme across the entire application, including POS, Admin Dashboard, and all dialogs, utilizing a centralized `src/theme.js` configuration.
- **Universal Loading Screen**: Replaced the legacy `AdminLoading` component with a universal `LoadingScreen` that supports both initial page loads and overlay/busy states.
- **Client-Side Routing**: Implemented `react-router-dom` for robust client-side routing, establishing a clear separation between the Staff POS (`/pos`) and Admin Console (`/admin`).

### Changed
- **POS Integration**: The POS interface now correctly uses the global theme and `LoadingScreen` for a seamless user experience.
- **Staff Workflow**: Staff members without an active shift are now correctly prompted to "Start Shift" on the login screen instead of entering a redirect loop.

### Fixed
- **Infinite Redirect Loop**: Resolved a critical issue where staff users without an active shift were trapped in a redirect loop between `/pos` and `/login`.
- **Theme Consistency**: Fixed an issue where the POS interface was falling back to a lighter theme; it now correctly inherits the intended "darker/red" manufacturing color scheme.

## [0.1.6] - 2026-02-12

### Added
- **Dynamic Branding**: Store logo and name are now fetched from settings and displayed on the login screen, staff dashboard, and admin header.
- **Unified Typography**: Implemented "Inter" font across the entire application for a consistent, professional look.
- **Automatic Versioning**: Configured Vite to pull the version number from `package.json` and display it dynamically on the login page.
- **Logo Verification**: Added a "Preview" button and verification UI for logo URLs in Store Settings.

### Changed
- **Settings Layout**: Reorganized settings tabs (Profile, POS, Receipt, Security, Hardware, Expenses, Data Core) for better navigation.
- **Admin Header Styling**: Refined store name display to be white, balanced (weight 600), and natural case.
- **Sidebar UX**: Moved the toggle button to the top of the sidebar for a more compact and consistent interface.

### Fixed
- **Login Imports**: Fixed a missing `useEffect` import in the Login component.

## [0.1.5] - 2026-02-12

### Added
- **Service Invoice (Letter Size)**: Implemented full-page 8.5" x 11" Service Invoice format compliant with RMC No. 77-2024.
- **Enhanced Settings**: Added TIN and Mobile fields to Store Profile for compliance.
- **Direct Invoice Printing**: Added "INVOICE" button to the Dashboard for quick printing of active orders.

### Fixed
- **Invoice Layout**: Refined header/footer spacing, aligned unit columns, and balanced typography.
- **Pagination**: Implemented robust overflow logic to prevent unnecessary blank pages when printing invoices.
- **Customer Data**: Updated customer dialogs to include TIN and Address; removed unnecessary Phone field to streamline flow.
- **Ad-hoc Printing**: Fixed issues where invoices wouldn't print for transactions without a linked POS order.

## [0.1.4] - 2026-02-12

### Fixed
- **Double Printing Issue**: Resolved a critical bug where receipts would print twice consecutively due to duplicate state triggers.
- **Receipt Consistency**: Unified all receipt logic (New Orders, History, Reprints) to use a single, standardized format.
- **Customer Data on Receipts**: Added support for displaying optimized customer details (Name, Phone, Address, TIN) on receipts.
- **Global Print Lock**: implemented a robust window-level lock to prevent concurrent print dialogs.

## [0.1.3] - 2026-02-10

### Fixed
- **Payroll Logic Refinement**: Restricted deductions to "Salary Advance" only. Manual "Salary" expenses (bonuses) are now ignored in deductions.
- **Paystub Net Pay**: Ensured the Net Pay calculation on paystubs matches the actual payout amount.
- **Double Counting Fix**: Prevented double expense entries for "Additions" in payroll runs.
- **Shift Sales Calculation**: Fixed issue where transactions with unknown categories were excluded from shift sales totals; they now default to sales.

## Roadmap & Future Plans
> For a detailed list of planned features, please refer to **[ROADMAP.md](ROADMAP.md)**.
> 
> *   Mobile Companion App (Biometrics)
> *   Inventory Enhancements
> *   Sync Strategy Improvements

