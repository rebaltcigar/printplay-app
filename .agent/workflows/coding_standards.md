---
description: Guidelines for writing clean, optimized, and simplified code in the PrintPlay app.
---

# Coding Standards & Optimization

Always prioritize simplification and performance. A clean UI starts with clean code.

## 1. Component Decomposition
- **Size Limit**: Aim to keep component files under 400 lines. If a component grows too large (like `POS.jsx`), decompose it into sub-components (e.g., `POSHeader.jsx`, `POSCartPanel.jsx`).
- **Feature Folders**: Group related components into folders (e.g., `src/components/pos/`).

## 2. Performance & Code Splitting
- **Lazy Loading**: Use `React.lazy` and `Suspense` for heavy dialogs, drawers, or secondary pages to keep the initial bundle light.
- **Memoization**: Use `useMemo` for expensive calculations (especially those involving large transaction arrays) and `useCallback` for functions passed to memoized children.

## 3. UI/UX Consistency
- **Drawer over Dialog**: Favor `Drawer` (sidebar) for complex forms (like `ExpenseDrawer.jsx`) and `Dialog` for short confirmations.
- **Material UI**: Always use MUI components and the theme system. Avoid custom CSS unless absolutely necessary for unique layouts.
- **Standard Notifications**: Always use the global snackbar at `top-center`.

## 4. Logic Simplification
- **Centralize Business Logic**: Keep complex math and state transitions in `services/` or `hooks/`, not in the UI components.
- **Avoid Prop Drilling**: Use Contexts (like `GlobalUIContext` or others) for deeply nested state.
- **DRY (Don't Repeat Yourself)**: If you see a pattern repeated twice, it belongs in a utility function or a shared component.

## 5. Security & Safety
- **Firestore Writes**: Never bypass security rules. Ensure every write includes necessary metadata (staffEmail, timestamp, etc.) via the service layer.
- **Error Boundaries**: Wrap major modules in error boundaries and use `errorService` for feedback.
