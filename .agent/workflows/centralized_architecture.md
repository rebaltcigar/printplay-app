---
description: How to use centralized contexts, services, and utilities in the PrintPlay app.
---

# Centralized Architecture & Shared Resources

To maintain a clean and maintainable codebase, always use the following standardized resources instead of local implementations.

## 1. Global UI Context (`GlobalUIContext.jsx`)
Use `useGlobalUI()` to access application-wide UI components. Never use local `Snackbar` or `Dialog` for basic alerts/confirmations.

- **`showSnackbar(message, severity)`**: Shows a top-center notification.
    - `severity`: 'success', 'error', 'warning', 'info'.
- **`showConfirm({ title, message, onConfirm, requireReason, ... })`**: Shows a standardized confirmation dialog.
    - `requireReason`: If true, `onConfirm` receives the reason string.

## 2. Core Services (`src/services/`)
Components must **never** write directly to Firestore using `addDoc` or `updateDoc`. Use the service layer:
- **`checkoutService.js`**: Total calculation and finalizing orders.
- **`orderService.js`**: Order creation, deletion (cascaded), and ID generation.
- **`transactionService.js`**: Recording expenses and managing transactions.
- **`shiftService.js`**: Shift management (open, close, resume).
- **`errorService.js`**: Use `getFriendlyErrorMessage(err)` to transform Firebase errors into human-readable text.

## 3. Standard Formatters (`src/utils/formatters.js`)
Always import formatting logic; never use `toLocaleDateString` or manual currency symbols in components.
- **`fmtCurrency(n)`**: Standard PHP currency with decimals.
- **`fmtDate(date)`**, **`fmtDateTime(date)`**, **`fmtTime(date)`**: Standardized date/time display.
- **`todayPHT()`**: Use for consistent date-only comparison in the Manila timezone.
- **`toDateInput(date)`**: Format for `<input type="date">`.

## 4. Role-Based Access (`src/utils/permissions.js`)
Use the helper functions to guard UI elements or routes:
- **`isAdmin(user)`**: Checks for Admin/Superadmin/Owner.
- **`isStaff(user)`**: Checks for Staff role.
- **`ROLES`**: Enum containing `ADMIN`, `STAFF`, etc.
