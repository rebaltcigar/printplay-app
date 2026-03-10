# Comprehensive Firestore to Supabase Migration Strategy (v2.1)

Based on an exhaustive audit of your current Firestore database (21 collections + subcollections) and the React codebase (`src/services`, `src/components`), here is the complete, super-detailed plan for migrating your entire architectural state into Supabase PostgreSQL.

---

## 1. Executive Summary: The Relational Shift

Your current Firestore design heavily utilizes "String Matching" (e.g., saving `orderNumber: 'ORD-1234'` in a transaction document) to loosely bind data together. This NoSQL approach works for early-stage flexibility but creates "orphans" and makes complex reporting difficult. 

Moving to **PostgreSQL** means enforcing **Strict Referential Integrity**. The migration must clean, sort, and cast your loosely-typed documents into rigid, inter-connected tables while **preserving all user-facing Display IDs** (like `TX-`, `EXP-`) as the true primary keys.

---

## 2. Collection-by-Collection Migration Plan

### Group A: Identity & Staff
*Currently scattered across `users` (5 docs) and `app_admins` (1 doc).*
*   **Target**: Merge both into a single `profiles` table linked to `auth.users(id)`.

### Group B: Customers & Engagement
*Currently in `customers` (78 docs).*
*   **Target**: Direct 1-to-1 mapping to a `customers` table.

### Group C: Core Application Data
*Currently in `settings`, `app_status`, `counters`, `stats_daily`.*
*   **Target**: `settings`, `app_status`, and `daily_stats` move directly.
*   **DELETE**: `counters` collection. Supabase handles auto-incrementing IDs natively via PostgreSQL `SEQUENCES` (e.g., `CREATE SEQUENCE order_number_seq`).

### Group D: PC Timer / Kunek Agent Engine
*Currently in `zones`, `rates`, `stations`, `sessions`, `station_logs`.*
*   **Target**: 1-to-1 mapping to their respective tables.
*   **Impact**: App switches from `onSnapshot` to Supabase Realtime Broadcasts.

### Group E: HR, Roster, & Payroll
*Currently in `shifts`, `shiftTemplates`, `payrollRuns` (nested), `payroll_logs`.*
*   **Target**: Flatten `payrollRuns` subcollections (`lines`, `paystubs`) into standalone relational tables (`payroll_line_items`, `paystubs`) linked by `run_id`.

---

## 3. Deep Dive: The Financials (UPDATED: Prefix-Based Routing)

This is where the structure is the messiest and requires the most careful surgical migration. Your `transactions` collection is a catch-all for 4 completely different types of data: Sales Items, Legacy Standalone Sales, Expenses, and PC Rentals.

### The Live Database Finding (Id Analysis)
You mentioned `TX`, `EXP`, and `TXN`. I ran a script to check exactly what is in your live Database's `displayId` fields for the 542 transactions. Here are the exact counts:
1.  **`TX-` prefix**: 398 documents
2.  **`EXP-` prefix**: 101 documents
3.  **Raw Firebase IDs (No prefix)**: 43 documents

**CRITICAL FINDING**: While you expected PC transactions to start with `TXN-`, *none of them currently do in the live database*. The 43 Raw Firebase IDs (e.g., `1SHNF8SAXEeOV7KJoEZq`) are exactly where your PC sessions/rentals are currently living!

### The Prefix-First Routing Solution
Instead of guessing by `category`, we will use the `displayId` prefix to perfectly route and preserve the primary keys:

1.  **`expenses` Table**:
    *   *Filter*: If ID starts with `EXP-`.
    *   *Action*: Route to the `expenses` table. The `EXP-` ID becomes the true `id` of the row.
2.  **`order_items` Table (The Standard Sales)**:
    *   *Filter*: If ID starts with `TX-` AND it has an `orderNumber` that matches a valid order.
    *   *Action*: Route to `order_items`. Enforce Foreign Key: `parent_order_number -> orders(order_number)`. The `TX-` ID becomes the true `id` of the row.
3.  **`legacy_transactions` Table**:
    *   *Filter*: `TX-` items that *do not* have a matching `orderNumber`.
    *   *Action*: Route to `legacy_transactions`. This preserves your legacy standalone sales without breaking the strict foreign key rules of the new `order_items` table.
4.  **`pc_transactions` Table**:
    *   *Filter*: Items with Raw Firebase IDs (no prefix) where `category == 'PC Rental'` OR `type == 'pc-session'`.
    *   *Action*: Route to `pc_transactions`. **DECISION NEEDED**: Do we want to keep the ugly raw ID for historical data, or have the migration script automatically mint retroactive `TXN-` prefixes for them?

### Modifying the App for the New Structure
Once migrated, the Frontend and Kunek Agent must change:
*   They will no longer generate IDs or rely on a `counters` document.
*   They will let Postgres automatically generate the `TX-`, `EXP-`, and `TXN-` prefixes using SQL sequences upon inserting new rows.

---

## 4. Execution Roadmap

1.  **Stage 1: The Foundation Drop**: Run `supabase_schema.sql` (v2.1) which includes tables for every collection equipped with cascading rules.
2.  **Stage 2: The Migration Engine**: Run `migrate.js` in waves (Entities -> Shifts/Sessions -> Financials). The script will strictly observe Prefix-Routing to preserve Display IDs.
3.  **Stage 3: The Asset Sync**: Migrate assets from Firebase Storage to Supabase Storage.
