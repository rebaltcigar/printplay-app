# Application Route Map & Module Renaming

## Module Renaming Suggestions

| Current Name | Proposed Name | Rationale |
| :--- | :--- | :--- |
| **Login** | **Login** | Standard. |
| **Dashboard** (Staff View) | **Terminal** or **POS** | "Dashboard" implies analytics. The staff view is primarily for Point of Sale and active shift management. "Terminal" fits the internet cafe vibe. |
| **AdminDashboard** | **Admin Console** | Distinguishes it clearly from the staff terminal. "Console" implies control and configuration. |

## Proposed URL Structure

We will introduce `react-router-dom` to manage these links.

### 1. Public / Auth
| Page | Route | Description |
| :--- | :--- | :--- |
| Login | `/login` | Entry point for all users. |

### 2. Staff Interface (The Terminal)
| Page | Route | Description |
| :--- | :--- | :--- |
| Terminal | `/terminal` | The main POS interface for staff. |
| Lock Screen | `/terminal/lock` | (Optional) For when staff steps away. |

### 3. Admin Interface (The Console)
All admin routes will be prefixed with `/admin`.

| Module | Route | Sub-Routes |
| :--- | :--- | :--- |
| **Overview** | `/admin` | Main analytics dashboard (Home). |
| **Reports** | `/admin/reports` | Sales reports, financial summaries. |
| **Shifts** | `/admin/shifts` | Shift history and reconciliation. |
| **Transactions** | `/admin/transactions` | Master transaction log. |
| **Expenses** | `/admin/expenses` | Expense tracking and categories. |
| **Debts** | `/admin/debts` | Customer debt tracking. |
| **Catalog** | `/admin/catalog` | Product and service management. |
| **Inventory** | `/admin/inventory` | Stock tracking. |
| **Users** | `/admin/users` | Staff and admin account management. |
| **Payroll** | `/admin/payroll` | Payroll processing. |
| **Settings** | `/admin/settings` | **Sub-modules below**: |
| &nbsp;&nbsp; General | `/admin/settings/general` | Store name, logo (Branding). |
| &nbsp;&nbsp; POS | `/admin/settings/pos` | UI tweaks, shortcuts. |
| &nbsp;&nbsp; Hardware | `/admin/settings/hardware` | Printers, drawers. |
| &nbsp;&nbsp; Receipt | `/admin/settings/receipt` | Receipt templates. |
| &nbsp;&nbsp; Security | `/admin/settings/security` | Permissions, API keys. |
| &nbsp;&nbsp; Data | `/admin/settings/data` | Backup/Restore, Seed data. |
