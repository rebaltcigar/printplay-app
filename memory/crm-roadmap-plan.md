# Basic CRM Implementation Plan

## Objective
Introduce a foundational Customer Relationship Management (CRM) system to PrintPlay. This basic CRM will allow staff to create, manage, and search for reusable customer profiles, eliminating redundant data entry during checkout and paving the way for future features like PC Rentals and dedicated customer accounts.

## Core Features
1. **Unified Customer Database**: A single source of truth for all customer information.
2. **Admin Management**: A new module in the Admin Dashboard to view, edit, and analyze customer profiles.
3. **POS Integration**: The ability to search and select existing customers during the checkout process (Sales, Receivables, Invoices).
4. **Activity Tracking**: Linking orders, invoices, and AR payments to specific customer profiles to track lifetime value and outstanding balances.

## 1. Database Schema Design (Firestore)

Following industry best practices for small service businesses, we will introduce a heavily normalized `customers` collection.

**Collection:** `customers`
```javascript
{
  id: "auto-generated",
  displayId: "CUST-0001", // User-friendly sequential ID
  fullName: "Juan Dela Cruz",
  email: "juan@example.com", // Optional, unique if provided
  phone: "09171234567", // Optional
  address: "123 Main St, City", // Optional
  tin: "123-456-789-000", // Optional, important for corporate invoicing
  
  // Aggregated Metrics (Calculated via Cloud Functions or periodic sync)
  lifetimeValue: 25000.00, // Total amount spent
  outstandingBalance: 1500.00, // Current unpaid AR
  totalOrders: 14,
  
  // Metadata
  tags: ["Corporate", "VIP"], // Useful for filtering
  notes: "Prefers email communication",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  isDeleted: false // Soft delete flag
}
```

*Note: In future updates, we can add a sub-collection `/customers/{id}/interactions` if detailed activity logging (calls, emails) becomes necessary.*

## 2. Admin Dashboard Integration (`/admin/customers`)

We will create a new top-level admin module utilizing our standardized UI components.

- **`CustomerManagement.jsx`**: The main view, featuring standard `SummaryCards` (Total Customers, Active this Month, Total Outstanding AR) and a DataGrid of all customers.
- **`CustomerDetailDrawer.jsx`**: Reusing the `DetailDrawer` standard, this will show:
  - Customer Information (editable).
  - Order History (a mini-table of past orders linked to this ID).
  - Invoice History (a mini-table of past/current invoices).
  - Account Metrics (Lifetime Value, Current Balance).

## 3. POS & Checkout Integration

The POS needs to efficiently query this new database without slowing down the cashier.

- **`CustomerSearchAutocomplete.jsx`**: A new, reusable component that replaces the standard "Customer Name" text fields in:
  - `CheckoutDialog.jsx`
  - `POSInvoiceLookupDrawer.jsx`
- **Behavior**:
  - As the cashier types, it queries the `customers` collection (by name, phone, or ID).
  - Selecting an existing customer auto-fills Name, Address, and TIN.
  - If a name is typed that *doesn't* exist, the system creates a new "Basic" profile in the background upon checkout to ensure no data is lost.

## 4. Updates to Existing Services

- **`orderService.js`**: Update `createOrder` to accept a `customerId` and increment the customer's `lifetimeValue` and `totalOrders`.
- **`invoiceService.js`**: Update `createInvoice` and `recordPayment` to update the customer's `outstandingBalance`.

## 5. Data Migration Strategy
To ensure historical data is preserved and tied into the new CRM, we will execute a bulk data migration.

**Migration Logic:**
1. **Fetch Legacy Data**: Query all `orders` and `invoices` where `customerId` is null or missing.
2. **Normalize Names**: Extract the `customerName` from these documents, lowercase it, and trim whitespace to group identically named customers together to minimize duplication.
3. **Batch Customer Creation**: For each unique, normalized name:
   - Create a new `customer` document.
   - Aggregate metrics: sum `totalOrders` and `lifetimeValue` from Paid orders, and sum `outstandingBalance` from unpaid/partial invoices.
   - Extract the latest `phone`, `address`, and `tin` fields across all of their historical documents.
4. **Batch Document Updating**: Update every linked historical order and invoice document to store the newly generated `customerId`.
5. **Execution UI**: This script will be housed within an Admin-only UI component (`CustomerMigrationTool.jsx`), chunking Firestore writes into batches of 500 to stay within operational limits, and displaying a progress bar until completion.

## Next Steps
This plan lays the absolute groundwork for the Basic CRM (v0.4). With the data migration strategy finalized natively into the roadmap, we are ready to proceed to **Phase 1: Database Setup & Security** and **Phase 2: Admin Dashboard & Data Migration Script**.
