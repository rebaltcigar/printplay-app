# PrintPlay App Description

## Overview
PrintPlay is a comprehensive Point of Sale (POS) and management system designed for an internet cafe and printing business. It manages transactions, inventory, staff shifts, and business analytics.

## Core Modules

### 1. Point of Sale (POS)
- **Transaction Processing**: Handles sales of services (e.g., printing, computer rental) and retail items (e.g., snacks, beverages).
- **Cart System**: Supports multiple potential orders (tabs) and allows adding/removing items.
- **Payment Handling**: Supports Cash and GCash payments.
- **Receipts**: Auto-generates and prints receipts upon checkout.
- **Quick Expenses**: Allows staff to quickly log operational expenses (e.g., buying ice) directly from the POS.

### 2. Admin Dashboard
- **Analytics**: Displays real-time and historical data including Gross Sales, Net Profit, and Operating Expenses.
- **Date Filters**: Allows viewing data by Today, Yesterday, This Week, Monthly, Yearly, etc.
- **Leaderboard**: Tracks staff performance (currently being refactored to align with Shift assignments).
- **Trend Analysis**: Visual charts showing sales trends over time.

### 3. Inventory Management
- **Service & Product Catalog**:
    - Manage items available for sale.
    - Categorize items as "Service" (Labor/Time) or "Retail" (Physical Goods).
    - Toggle stock tracking for retail items.
- **Stock Tracking**:
    - Tracks current stock levels and calculates weighted average cost.
    - **Restock Workflow**: Dedicated interface to add stock, recording cost and quantity to update inventory value.
    - **Deduction**: Automatically deducts stock upon POS sale.

### 4. Shift Management
- **Shift Logic**: Tracks business activity per shift.
- **Reconciliation**: At the end of a shift, staff reconcile cash expected vs. cash on hand, declaring discrepancies.
- **Active Shift Tracking**: Admin can see the live status of the current shift.

### 5. User & Staff Management
- **Roles**: Distinguishes between Admin and Staff users.
- **Authentication**: Email/Password login via Firebase Auth.
- **Debt/Credit**: Tracks staff debts or customer credits.

## Technical Architecture
- **Frontend**: React (Vite) with Material UI.
- **Backend Data**: Firebase Firestore (NoSQL).
- **Authentication**: Firebase Authentication.
- **State Management**: Context API (`AnalyticsContext`, `AuthContext`) + Local Component State.
- **Printing**: Browser native print api.

## Key Workflows
1.  **Selling an Item**: Staff selects item -> Added to Cart -> Checkout -> Payment -> Stock Deducted -> Transaction Logged.
2.  **Shift End**: Staff clicks "End Shift" -> Enters Cash Count -> System compares with expected -> Discrepancy logged -> Shift Closed.
3.  **Inventory Restock**: Admin selects item -> Enters Qty & Cost -> Weighted Average Cost updated -> "Inventory Asset" transaction logged.
