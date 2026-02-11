# LLM Context & Technical Overview

> [!IMPORTANT]
> This document is intended to provide high-level context for AI assistants and developers working on the PrintPlay codebase. **Read this before making significant architectural changes.**

## 📂 Project Structure
*   `src/components`: UI components (Views, Widgets, Dialogs).
*   `src/contexts`: Global state using React Context (`AuthContext`, `AnalyticsContext`).
*   `src/hooks`: Custom hooks (e.g., `useCart`).
*   `src/utils`: Helper functions, constants, and Firebase logic.
*   `firestore.rules`: Security rules for the Firestore database.

## 🛠️ Tech Stack
*   **Frontend**: React (Vite)
*   **UI Framework**: Material UI (MUI) v5
*   **Backend**: Firebase (Firestore, Auth, Functions)
*   **Hosting**: Firebase Hosting

## 📝 Coding Standards & Patterns
1.  **User Feedback**:
    *   ❌ Do NOT use `alert()` or `console.error` for user-facing errors.
    *   ✅ Use the `useSnackbar` hook to display toast notifications.
2.  **State Management**:
    *   Prefer local state for UI-only logic.
    *   Use `Context` for data shared across multiple views (User, Settings, formatting helpers).
3.  **Firestore**:
    *   Use strict typing/validation where possible (even if just via JSDoc).
    *   Handle offline scenarios gracefully (persistence is enabled).

## 🔐 Key Data Models
*   **Transaction**: Represents a completed sale. Main collection in Firestore.
*   **Shift**: Represents a work period. Contains cash handling data (start/end cash, deductions).
*   **Product**: Inventory items (Service or Retail).
*   **Log**: Audit trail for sensitive actions (Drawer open, deletions).
