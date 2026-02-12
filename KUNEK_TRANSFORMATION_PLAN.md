# Kunek SaaS Transformation Plan

## Goal Description
Transform the existing single-tenant "Print+Play" application into "Kunek", a multi-tenant SaaS platform for Internet Cafes and Printing Shops. "Print+Play" will become the first tenant. The transformation involves architectural changes for data isolation, dynamic rebranding, and the addition of dedicated Internet Cafe features (PC Timers).

## User Review Required
> [!IMPORTANT]
> **Data Migration**: The current database structure is single-tenant (root collections). Moving to a multi-tenant structure (e.g., `/tenants/{tenantId}/...`) is a breaking change. We will need to migrate existing "Print+Play" data into a new `tenantId` (e.g., `printplay`).

> [!WARNING]
> **Authentication**: Staff logins will need to be tenant-aware. We need to decide if users log in at a generic page and select a tenant, or use specific URLs (e.g., `app.kunek.com/login?tenant=printplay`).

> [!NOTE]
> **Internet Cafe Features**: Currently, "PC Rental" is just a manual line item. "Kunek" needs a dedicated **PC Station Management** interface (Timer, Start/Stop, Prepaid/Postpaid) to compete with existing cafe software.

## Proposed Changes

### 1. Rebranding (Print+Play -> Kunek)
- **Rename Application**: Update `package.json`, `index.html`, and window titles to "Kunek".
- **Dynamic Branding**: Refactor `Login.jsx` and `Dashboard.jsx` to remove hardcoded "Print+Play" fallbacks. Branding (Logo, Name) must come strictly from the active tenant's settings.
- **Artifacts**: Replace `favicons` and manifest details.

### 2. Architecture: Multi-Tenancy
- **Data Schema Change**:
    - Current: `/users`, `/transactions`, `/shifts`
    - New: `/tenants/{tenantId}/users`, `/tenants/{tenantId}/transactions`, ...
- **Firestore Rules**: Update `firestore.rules` to enforce `tenantId` base paths.
- **Context Integration**: Create a `TenantContext` to provide the `tenantId` (derived from URL or user claim) to the entire app.

### 3. Feature Expansion: Internet Cafe Module
- **New Module: PC Station Manager**:
    - **Visual Grid**: View status of computers (Available, Occupied, Dirty).
    - **Timer Logic**: Start/Stop sessions.
    - **Pricing Rules**: Auto-calculate cost based on duration.
- **Integration**: "Checkout" a PC session to the existing POS cart.

### 4. Codebase Refactoring
#### [MODIFY] src/firebase.js
- Update config handling to support multi-tenancy context if needed.

#### [MODIFY] src/App.jsx
- Wrap application in `TenantProvider`.
- Update checking of `current_shift` to be tenant-specific.

#### [MODIFY] src/components/Login.jsx & Dashboard.jsx
- Remove hardcoded "Print+Play".
- Fetch settings from tenant path.

## Verification Plan

### Automated Tests
- None currently exist. We will rely on manual verification.

### Manual Verification
1. **Rebranding Check**:
    - Load the app. Title should be "Kunek".
    - Login screen should show "Print+Play" logo ONLY because it is loaded from the "printplay" tenant settings.
2. **Multi-Tenant Isolation**:
    - Create a second test tenant "DemoCafe".
    - Log in as "DemoCafe" staff.
    - Create a transaction.
    - Log in as "Print+Play" staff.
    - Verify "DemoCafe" transaction is NOT visible.
3. **PC Timer Flow**:
    - Start a timer on "PC-01".
    - Let it run for 1 minute.
    - Stop timer.
    - Verify correct price is added to the cart.
