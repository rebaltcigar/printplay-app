# Changelog

All notable changes to this project will be documented in this file.

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

