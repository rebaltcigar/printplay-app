# v0.5: Retail & Inventory Implementation Plan

This update focuses on bridging the gap between services and physical inventory, enhancing stock visibility, and completing the audit trail for inventory movements.

## Objectives
- Link services (e.g., Printing) to retail stock (e.g., Paper) so stock decrements automatically.
- Implement a UI to view historical inventory movements (restocks/adjustments).
- Add sales velocity and "days remaining" estimates to the Inventory Management view.

## Phase 1: Service-Inventory Linking (Consumables)

### [MODIFY] [ServiceCatalog.jsx](file:///c:/printplay-app/printplay-app/src/components/admin/ServiceCatalog.jsx)
- Add a "Consumables" section in the item form.
- Allow users to select another item (usually a retail item) and specify the quantity used per unit of this service.
- Update `save` logic to store `consumables` array in the service document.

### [MODIFY] [POS.jsx](file:///c:/printplay-app/printplay-app/src/components/POS.jsx)
- Update `addItemToCart` to include the `consumables` data.
- Update `handleCheckout` to iterate through `consumables` and decrement their stock in the same batch as the main items.

---

## Phase 2: Inventory Reporting & Audit

### [MODIFY] [InventoryManagement.jsx](file:///c:/printplay-app/printplay-app/src/components/admin/InventoryManagement.jsx)
- Implement `Audit History` dialog:
  - Fetch transactions where `financialCategory === 'InventoryAsset'`.
  - Display them in a table (Date, Item, Action, Qty, Cost).
- Implement "Sales Velocity":
  - For each item, calculate average daily units sold over the last 30 days.
  - Display "Out of stock in X days" estimation if velocity > 0.

---

## Phase 3: UI/UX Polishing

### [MODIFY] [POSItemGrid.jsx](file:///c:/printplay-app/printplay-app/src/components/pos/POSItemGrid.jsx)
- Ensure the "Retail" tab is visually distinct and items are well-organized.
- Add a "Stock" badge even if not in "Low Stock" state for quick visibility.

## Verification Plan

### Manual Verification
1. **Consumable Link**:
   - Link "A4 Printing" to "A4 Paper" (qty: 1).
   - Perform a sale of 10x "A4 Printing".
   - Verify "A4 Paper" stock decrements by 10.
2. **Restock Audit**:
   - Perform a restock in `InventoryManagement`.
   - Open Audit History and verify the entry appears with correct cost/qty.
3. **Sales Velocity**:
   - Check `Inventory Management` page for the new velocity indicator.
