# Input Field Audit & Sanitization Report

This audit identifies all user-input areas in the Kunek platform and evaluates the current state of validation and sanitization.

## 1. Primary Input Categories

### A. Personal/Store Info (Strings)
- **Fields:** Full Name, Address, Store Name, Staff Names, Service Names.
- **Current State:** Zero sanitization. Directly bound to state and Firestore.
- **Risk:** High (XSS if rendered in legacy parts, data integrity issues with trailing spaces/special chars).

### B. Financial/Numeric (Floats/Ints)
- **Fields:** Unit Price, Cost Price, Quantity, Stock Count, Tax Rate.
- **Current State:** Mixed use of `Number()`, `parseFloat()`, and `.replace(/\D/g, '')`.
- **Risk:** Medium (NaN errors, negative value edge cases, accidental inclusion of currency symbols in raw input).

### C. Identifiers & Contact (Structured Strings)
- **Fields:** Phone Number, Email, TIN, GCash Reference.
- **Current State:** Localized regex in some places (e.g., `CheckoutDialog`), missing in others (`CustomerForm`).
- **Risk:** Low-Medium (Invalid data formats prevent reliable communication or search).

### D. System Configuration (Short Strings)
- **Fields:** ID Prefixes, Hotkeys.
- **Current State:** No validation on length or character types.
- **Risk:** Low (Breaks ID generation logic if prefixes are too long).

---

## 2. Identified Inconsistencies

1. **Phone Number:** `CustomerForm` allows any characters; `CheckoutDialog` uses `\d{11}`.
2. **Numeric Input:** Some components allow empty strings to pass through to calculation logic (causing NaN), others default to `0`.
3. **TIN:** No formatting or length validation across the app.
4. **Trimming:** Most fields do not trim whitespace, leading to database entries like `" Juan Dela Cruz "`.

---

## 3. Recommended Centralized Strategy

We should implement a `src/utils/validation.js` utility that provides:

### Sanitizers (Run on Change/Blur)
- `sanitizeString(val)`: Trims and removes dangerous characters.
- `sanitizeNumeric(val)`: Ensures valid positive number or 0.
- `cleanPhone(val)`: Strips non-digits.

### Validators (Run before Submit)
- `isValidEmail(val)`
- `isValidPhone(val)`
- `isValidTIN(val)`
- `isValidGCashRef(val)`

---

## 4. High-Priority Fix Areas
1. **CustomerForm.jsx:** Needs sanitization for all personal info.
2. **InventoryManagement.jsx:** Needs strict numeric validation for costs/quantities.
3. **POS.jsx:** Needs sanitization for manual item additions.
4. **StoreSettings.jsx:** Needs validation for ID prefixes and tax rates.

---

## 5. Implementation Plan

### [Utils]
#### [NEW] [validation.js](file:///c:/printplay-app/printplay-app/src/utils/validation.js)
- `cleanString(val)`: Trims whitespace and removes potentially malicious characters.
- `cleanPhone(val)`: Returns only digits, capped at 11 or 12.
- `cleanNumeric(val)`: Returns a valid number or 0, preventing NaN.
- `isValidEmail(email)`: Standard email regex.
- `isValidTIN(tin)`: 9 or 12 digit numeric check.

### [Common]
#### [MODIFY] [CustomerForm.jsx](file:///c:/printplay-app/printplay-app/src/components/common/CustomerForm.jsx)
- Use `cleanString` on Blur or Change for Name and Address.
- Use `cleanPhone` and `isValidEmail` for contact fields.

### [Admin]
#### [MODIFY] [InventoryManagement.jsx](file:///c:/printplay-app/printplay-app/src/components/admin/InventoryManagement.jsx)
- Apply `cleanNumeric` to all restock form inputs (Quantity, Unit Cost, Total Cost).
- Prevent submission if inputs are invalid or negative.

### [POS]
#### [MODIFY] [CheckoutDialog.jsx](file:///c:/printplay-app/printplay-app/src/components/CheckoutDialog.jsx)
- Replace local GCash/Phone regex with centralized validators from `validation.js`.

---

## 6. Verification Plan

### Manual Verification
1. **Customer Form:**
   - Try entering names with leading/trailing spaces (e.g., "  Juan  "). Verify they are trimmed.
   - Try entering invalid characters in the Phone field. Verify only digits remain.
2. **Inventory Restock:**
   - Try entering non-numeric characters in Cost. Verify they are rejected or cleaned.
   - Verify negative numbers are blocked from submission.
3. **POS Checkout:**
   - Verify GCash Ref and Phone validation still work correctly using the new shared logic.
4. **Firestore:**
   - Check the database to ensure new entries are clean (no trailing spaces).
