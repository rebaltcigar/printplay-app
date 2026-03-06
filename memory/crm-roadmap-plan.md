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

## 5. Migration Strategy (Optional but Recommended)
For existing orders and invoices that have string-based customer names but no IDs, we will need a one-time utility script to:
1. Extract all unique customer names/TINs from existing `orders` and `invoices`.
2. Generate `customer` documents for them.
3. Back-link the generated `customerId` to the historical records. 

*(If this is too complex for the basic version, we can simply start fresh for new orders while keeping historical text data intact).*

## Next Steps
This plan lays the groundwork for the Basic CRM. Before beginning execution on the *next* version, we will need to confirm if historical data migration is required or if we are starting with a clean slate for the customer database.
