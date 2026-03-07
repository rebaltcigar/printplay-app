# Comprehensive Code Review - Kunek Platform

I have performed a deep-dive review of the codebase across 10 "passes," focusing on consistency, redundancy, and scalability. Here is the analysis and roadmap for optimization.

## 1. Core Utilities & Formatting
> [!IMPORTANT]
> **Finding:** Significant duplication of formatting logic.
- **Inconsistency:** `toLocaleDateString` and `fmtPeso` variations are redefined locally in over 15 components.
- **Recommendation:** Centralize ALL date and currency formatting in `src/utils/formatters.js`. Remove all `toDateStr` or `currency` local helpers.
- **Goal:** Single source of truth for "Philippine Peso" and "Local Date/Time" formats.

## 2. Component Standardization (The "Common" Layer)
> [!TIP]
> **Finding:** The `src/components/common` pattern is working but underutilized.
- **Opportunity:** Standardize components like `UserManagement`, `Transactions`, and `Shifts` (currently in the root `src/components`) using the `DetailDrawer` and `SummaryCards` patterns already visible in `InventoryManagement` and `InvoiceManagement`.
- **Goal:** A unified look and feel for all CRUD-like modules.

## 3. "God Components" (The POS Risk)
> [!WARNING]
> **Finding:** `POS.jsx` is ~2000 lines and handles too many responsibilities.
- **Issue:** It manages state, timers, checkout logic, Firestore writes, and UI toggles. A single syntax error here (as seen earlier) breaks the entire POS for all users.
- **Recommendation:**
  - Extract **Checkout Logic** to `src/services/checkoutService.js`.
  - Extract **Shift Timer** to `src/hooks/useShiftTimer.js`.
  - Extract **Cart/Tab Management** to a dedicated `usePOSCart` hook.
- **Goal:** Reduce `POS.jsx` to < 500 lines of purely layout and orchestration code.

## 4. Data Layer & Firestore Atomic Operations
- **Risk:** The checkout flow in `POS.jsx` performs multiple non-atomic writes (Customer -> Order -> Invoice -> Batch TX).
- **Optimization:** Use Firestore `writeBatch` or `runTransaction` for the *entire* checkout operation to prevent orphaned records if a network failure occurs mid-checkout.
- **Goal:** Guarantee 100% data integrity for financial records.

## 5. Global State & Prop Drilling
- **Finding:** `showSnackbar` and `userRole` are drilled through multiple levels (e.g., `App -> Dashboard -> InvoiceMgmt -> InvoiceDrawer`).
- **Recommendation:** Implement a `GlobalUIContext` for:
  - `showSnackbar` (Global notification system).
  - `showConfirm` (Standardized confirmation dialogs).
  - `userRole` / `permissions`.
- **Goal:** Flatten the prop-drilling chain and simplify sub-component signatures.

## 6. Permissions & Role Logic
- **Finding:** Role checks like `['admin', 'superadmin', 'owner'].includes(userRole)` are hardcoded in multiple files.
- **Recommendation:** Centralize this into a `permissions.js` utility (e.g., `hasPermission(userRole, 'write_off')`).
- **Goal:** Easy modification of access levels across the entire app from one file.

## 7. Service Layer Consolidation
- **Finding:** Overlap between `invoiceHelper.js`, `invoiceService.js`, `receiptHelper.js`, and `printHelper.js`.
- **Recommendation:** Merge "Helpers" and "Services" into single, well-documented files per domain (e.g., `src/services/invoice.js`).
- **Goal:** Reduce cognitive load when looking for business logic.

## 8. State Synchronization & Real-time
- **Finding:** Some components use `onSnapshot` (real-time) while others use `getDocs` (one-time fetch) for the same data types.
- **Recommendation:** Standardize on "Snapshot Hooks" (like the current `useInvoices.js`) for all active data lists.
- **Goal:** Consistent "Live" feel across the dashboard.

## 9. Error Handling Strategy
- **Issue:** Error handling is inconsistent. `Login.jsx` has great humanized errors, while others just log `err` to console.
- **Recommendation:** Create a `src/utils/errorService.js` to translate Firebase and System errors into user-friendly messages for the `GlobalUIContext`.
- **Goal:** Professional, non-technical error messages for staff.

## 10. Performance & Bundle Size
- **Opportunity:** Many components import large icons or sub-components they don't use.
- **Optimization:** Use `React.lazy` for large drawers/dialogs and audit the `@mui/icons-material` imports.
- **Goal:** Faster initial load times and smaller builds.

---
### Next Steps Priority
1. **Refactor POS Checkout Flow** (Critical for data safety).
2. **Centralize Formatting** (Immediate consistency gain).
3. **Implement GlobalUIContext** (Removes boilerplate props).
