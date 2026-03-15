# Payroll Redesign — Task Tracker

> Updated: 2026-03-15 17:15

## Phase 1: Foundation (DB + Service Layer + Dashboard) ✅

- [x] 1.1 Run `scripts/create_payroll_schema.sql` on Supabase (drop old, create new tables)
- [x] 1.2 Delete old payroll files:
  - [x] `src/components/payroll/RunPayroll.jsx`
  - [x] `src/components/payroll/AllRuns.jsx`
  - [x] `src/components/payroll/PayRates.jsx`
  - [x] `src/components/payroll/StatChip.jsx`
  - [x] `src/components/pages/Paystub.jsx`
- [x] 1.3 Create `src/services/payrollService.js` (CRUD operations)
- [x] 1.4 Rewrite `src/utils/payrollHelpers.js` (clean calculation utilities)
- [x] 1.5 Rewrite `src/components/pages/Payroll.jsx` (nested router layout)
- [x] 1.6 Update `AdminDashboard.jsx` route: `payroll` → `payroll/*`
- [x] 1.7 Create `src/components/payroll/PayrollDashboard.jsx`
- [x] 1.8 Create `src/components/payroll/PayrollHistory.jsx`
- [x] 1.9 Create `src/components/payroll/StaffPay.jsx`
- [x] 1.10 Create `src/components/payroll/PaySlips.jsx` + `PaySlipViewer.jsx`
- [x] 1.11 Fix `MyPaystubsDrawer.jsx` broken import (→ PaySlipViewer + payroll_stubs)
- [x] 1.12 Build verification (passed, exit code 0)

## Phase 2: Run Payroll (Core Flow) ✅

- [x] 2.1 Create `NewPayrollRun.jsx` — Step 1: Period Setup
- [x] 2.2 Step 2: Staff & Hours Review (card grid, shift detail, overrides)
- [x] 2.3 Step 3: Deductions & Additions (auto + manual)
- [x] 2.4 Step 4: Review & Confirm (summary, draft/approve/post)
- [x] 2.5 Wire up payrollService: generatePreview, saveRun, postRun
- [x] 2.6 Load/edit existing run (`/admin/payroll/run/:id`)


## Phase 3: History + Staff Pay ✅

- [x] 3.1 Enhance `PayrollHistory.jsx` with detail view drawer (using DetailDrawer, full run breakdown)
- [x] 3.2 Enhance `StaffPay.jsx` with pay history summary (total earned, run count, per-run list)
- [x] 3.3 Wire void/delete with safety guards + stub deletion on void

## Phase 4: Pay Slips + Polish

- [ ] 4.1 Enhance pay slip viewer with store branding
- [ ] 4.2 Batch download support
- [ ] 4.3 Generate stubs on postRun
- [ ] 4.4 Polish: loading states, empty states, error handling, micro-animations
- [ ] 4.5 Comprehensive browser testing

## Phase 5 (Future — Not In Scope)

- [ ] Government deductions (SSS, PhilHealth, Pag-IBIG, tax)
- [ ] Employee self-service portal
- [ ] Payroll reports & analytics
- [ ] Attendance integration (late/absent auto-deduction)
- [ ] Export to accounting format (CSV/QBO)
- [ ] Payroll calendar visualization
