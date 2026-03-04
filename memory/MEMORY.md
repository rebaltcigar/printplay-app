# PrintPlay App — Claude Memory

## Tech Stack
- React 19 + Vite, MUI v7, Firebase/Firestore, React Router v7
- No Redux — React Context (AnalyticsContext) for global analytics state
- Timezone: Asia/Manila (UTC+8), use dayjs or custom PHT helpers

## Project Structure
- `src/components/` — All UI components (admin/, payroll/, common/, dashboard/, reports/)
- `src/hooks/` — Shared hooks (useStaffList, useServiceList, useShiftOptions)
- `src/utils/` — Helpers (formatters, shiftFinancials, payrollHelpers, idGenerator, analytics)
- `src/contexts/` — AnalyticsContext
- Routes in App.jsx — admin routes under /admin/*

## Key Files
- Transactions: `src/components/Transactions.jsx`
- Expense Log: `src/components/ExpenseManagement.jsx`
- Shift Detail: `src/components/ShiftDetailView.jsx`
- Shifts List: `src/components/Shifts.jsx`
- Payroll: `src/components/Payroll.jsx` → `payroll/RunPayroll.jsx`, `payroll/AllRuns.jsx`
- Orders: `src/components/OrderManagement.jsx`
- Shared drawer: `src/components/common/DetailDrawer.jsx`
- Summary cards: `src/components/common/SummaryCards.jsx`

## Shared Infrastructure (added Mar 2026)
- `DetailDrawer.jsx` — Universal right-side slide drawer. Props: open, onClose, title, subtitle, children, actions, width (default 520), loading, disableClose
- `SummaryCards.jsx` — KPI card row. Props: cards [{label, value, sub, color, icon, highlight}], loading, sx
- `useShiftOptions.js` — Hook returning shiftOptions [{id, displayId, staffEmail, staffName, shiftPeriod, date, label}]. Props: {startDate, endDate, emailToName}
- `useStaffList.js` — Returns staffOptions, userMap (alias emailToName), emailToName, idToName, loading

## Data / Query Patterns
- Transactions collection: item, price, qty, total, paymentMethod, orderNumber, shiftId, staffEmail, timestamp, isDeleted
- Orders collection: orderNumber, items[], total, paymentMethod, shiftId, customerId, staffEmail
- Shifts collection: displayId (SHIFT-XXXXXX), staffEmail, shiftPeriod, startTime, endTime, denominations
- Use onSnapshot for live ranges (≤45 days), getDocs for historical
- ID generation: generateDisplayId(counterName, prefix) — atomic via Firestore transaction on `counters` collection
- Human-readable IDs: shifts use displayId field (SHIFT-XXXXXX), expenses use displayId (EXP-XXXXXX)

## UI Conventions (post-Mar 2026 refactor)
- **No split-screen forms** — all add/edit forms go in DetailDrawer (right-side panel)
- **No left filter sidebars** — filters are horizontal Paper bar above the table
- **SummaryCards always above tables** — show KPI totals before the data
- **Staff**: always show fullName (from emailToName map), not raw email
- **Shift IDs**: always show displayId (SHIFT-XXXXXX), not Firestore doc id blob
- **Tables**: compact (size="small" stickyHeader), essential columns only, "view details" opens DetailDrawer
- **Payroll**: step-based inline wizard (Stepper, 3 steps: Setup → Review → Confirm), no nested modals
- **Paystubs**: opened via PaystubDialog (existing component), referenced by runId

## Payroll Architecture
- RunPayroll.jsx: inline 3-step wizard (step state: 0=setup, 1=review, 2=confirm)
- AllRuns.jsx: table + DetailDrawer for run detail view (no modal-on-modal)
- Payroll.jsx: parent with 3 tabs (Run Payroll / All Runs / Pay Rates)
- PaystubDialog (Paystub.jsx): dialog opened with runId prop

## Formatters (src/utils/formatters.js)
- fmtCurrency(n) → ₱1,234.50
- fmtPesoWhole(n) → ₱1,235
- toDateInput(d) → YYYY-MM-DD
- toDatetimeLocal(d) → YYYY-MM-DDThh:mm
- fmtDateTime(ts) → locale string from Firestore timestamp
- identifierText(tx) → human readable tx label
- downloadCSV(csvString, filename)

## Common Gotchas
- Payroll.jsx is in src/components/ NOT src/views/ — imports use ./payroll/RunPayroll not ../components/payroll/...
- ShiftDetailView receives userMap prop from parent (Shifts.jsx)
- Orders linked to shifts via shiftId field on order documents
- Expense types come from services collection (sub-services of "Expenses" parent)
