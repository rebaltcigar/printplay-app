# Project Roadmap

> [!NOTE]
> This document outlines the planned features and improvements for the PrintPlay application. It is a living document and should be updated as priorities change.

## 🚀 Upcoming Features

### 🌐 Project SavePoint (SaaS Rebranding)
*   **Goal**: Transition from a single-use app (PrintPlay) to a multi-tenant SaaS platform (SavePoint).
*   **Strategy**: "PrintPlay" becomes the first business running on SavePoint.
*   **Key Tasks**:
    *   **Architecture**: Implement `tenantId` data isolation.
    *   **Rebranding**: Rename shared UI elements to "SavePoint".
    *   **Config**: Move hardcoded brands ("PrintPlay") to database settings.


### 📱 Mobile Companion App (Biometrics & Staff Auth)
*   **Goal**: Securely identify individual staff members for authorizing sensitive actions (e.g., opening cash drawer) without dedicated hardware on the shared PC.
*   **Strategy**: Develop a mobile web app (PWA) or native wrapper that staff use on their personal phones.
*   **Key Features**:
    *   Biometric authentication (FaceID/Fingerprint) using WebAuthn/Passkeys on the phone.
    *   "Remote Control" style authorization: Staff approves a request from the main POS.
    *   Time-in/Time-out logging.

### 🔄 Sync Strategy Refinements
*   **Goal**: Improve data integrity and user feedback during offline/online transitions.
*   **Tasks**:
    *   Remove automatic retries that spam the console/network.
    *   Move sync controls to the Admin "Shifts" view.
    *   Implement "one-click" manual sync for individual shifts.
    *   Better UI indicators for "Offline" vs "Quota Exceeded".

### 📦 Inventory Management Enhancements
*   **Goal**: More granular control over stock and costs.
*   **Tasks**:
    *   Refine "Weighted Average Cost" calculations.
    *   Better tracking of "Service" vs "Retail" items.
    *   Low stock alerts.

### 📊 Dashboard & Analytics
*   **Goal**: Deeper insights into business performance.
*   **Tasks**:
    *   Fix remaining bugs in "Shift Sales" vs "Total Sales" discrepancies.
    *   Add more visual charts (Transcation volume by hour, etc.).
    *   Staff performance leaderboard (connected to Shift data).

## 🐛 Known Issues / Technical Debt
*   **Refactor Feedback**: Continue standardizing all alerts/errors to use the `Snackbar` system.
*   **Type Safety**: Gradually introduce JSDoc or TypeScript definitions for core data models (Transaction, Shift).
*   **Testing**: Add unit tests for critical calculations (Payroll, Cart Totals).
