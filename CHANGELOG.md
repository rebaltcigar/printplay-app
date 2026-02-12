# Changelog

All notable changes to this project will be documented in this file.

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

