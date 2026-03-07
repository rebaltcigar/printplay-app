# v0.5: Retail & Inventory — Comprehensive Implementation Plan

This plan follows the established project standards (Centralized Services, Global Contexts, and Component Decomposition) to implement a robust inventory system.

## 3-Pass Audit & Strategy

### Pass 1: Data Model & Infrastructure (The "Safety" Pass)
- [ ] **Schema Update**:
    - `services` collection: Add `consumables` (array of `{ itemId, qty }`), `lowStockThreshold`, `totalValue` (cost-based).
    - `inventory_logs` collection: New collection for auditing all stock movements (Restock, Damage, Adjustment).
- [ ] **[NEW] inventoryService.js**: Centralize all stock logic.
    - `recordStockAdjustment(itemId, qty, type, reason, cost?)`: Uses a Firestore batch to update the item and create a log entry.
- [ ] **Permissions**: Guard restock and adjustment functions with `isAdmin()`.

### Pass 2: Service-Inventory Linking (The "Automation" Pass)
- [ ] **Service Catalog UI**: Add "Linked Consumables" to the Item Editor.
    - Allow mapping a Service (e.g., "Full Page Print") to a Retail Item (e.g., "A4 Paper") with a specific quantity.
- [ ] **Checkout Logic**:
    - Update `checkoutService.js` to recursively check for `consumables` on every line item.
    - Batch the decrement of both the sold item (if retail) and its consumables in a single atomic operation.

### Pass 3: Analytics & Audit View (The "Intelligence" Pass)
- [ ] **Audit History UI**: Implement the missing `Audit History` dialog in `InventoryManagement.jsx`.
    - View all `inventory_logs` with filters for Item and Type.
- [ ] **Sales Velocity & Forecasting**:
    - [NEW] `useInventoryAnalytics.js` hook: Computes "Avg Units/Day" and "Days Remaining" based on a 30-day window.
- [ ] **POS Visibility**: Enhanced badges in `POSItemGrid.jsx` showing "X remaining" for low-stock items.

---

## Technical Standards Alignment

### 1. Centralized Actions
- **DO NOT** use `updateDoc` inside `InventoryManagement.jsx`.
- **DO** call `inventoryService.restockItem()` or `inventoryService.adjustStock()`.

### 2. Global UI
- Use `showConfirm` with `requireReason: true` for all manual stock adjustments (Destruction/Loss).
- Use `showSnackbar` for success/error feedback via `GlobalUIContext`.

### 3. Optimization
- Lazy load the Audit History dialog to keep the main inventory list performant.
- Use `memo` on inventory table rows to prevent unnecessary re-renders during search/filter.

---

## Verification Plan

### Automated
- **Unit Tests**: Test WAC calculation logic in `inventoryService.js`.
- **Integration**: Verify that deleting an order correctly *increments* (reverts) stock levels for both items and consumables.

### Manual
- **Workflow**: Perform a Restock $\rightarrow$ Check Audit Log.
- **Workflow**: Sell a service with 2 linked consumables $\rightarrow$ Verify stock drops for all 3 documents.
