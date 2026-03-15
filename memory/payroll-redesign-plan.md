# Payroll System — Complete Redesign Plan

> **Branch:** `feature/payroll-process-update`  
> **Created:** 2026-03-15  
> **Status:** Planning  

---

## Overview

Ground-up redesign of the Kunek POS payroll module. All existing payroll code and database tables are dropped — **no data migration**. The new system is designed around modern SaaS payroll UX (inspired by Gusto, Rippling, Deel) adapted for shift-based, POS-integrated payroll.

### Key Design Decisions

- **Hourly-rate staff** (using `profiles.payroll_config.rate_history`)
- **Dashboard-first UX** — not a tabbed layout
- **Nested routing** under `/admin/payroll/*` for dedicated sub-pages
- **Card-based UI** instead of raw data tables
- **Itemized deductions/additions** in separate DB tables (not JSON blobs)
- **Government deductions** (SSS, PhilHealth, Pag-IBIG, tax) deferred to Phase 2
- Source data (`shifts`, `expenses`, `profiles`) is **read-only** — not modified by payroll

---

## Architecture

```
/admin/payroll           → PayrollDashboard  (overview + quick actions)
/admin/payroll/run       → NewPayrollRun     (guided 4-step flow)
/admin/payroll/run/:id   → EditPayrollRun    (review/edit existing run)
/admin/payroll/history   → PayrollHistory    (all runs, card-based)
/admin/payroll/staff     → StaffPay          (staff profiles + rate management)
/admin/payroll/payslips  → PaySlips          (generated pay slips)
```

### Data Flow

```
shifts table ─────────────────┐
                               ├──→ payrollService.js ──→ payroll_runs
expenses table (advances) ────┤                          payroll_lines
                               │                          payroll_line_shifts
profiles table (rates) ───────┘                          payroll_deductions
                                                         payroll_additions
                                                         payroll_stubs
```

---

## Phases

### Phase 1: Foundation (DB + Service Layer + Dashboard)

**Goal:** Set up the database, service layer, and landing page so the scaffold is working.

| # | Task | Files |
|---|------|-------|
| 1.1 | Run SQL migration to drop old tables and create new schema | `scripts/create_payroll_schema.sql` |
| 1.2 | Delete old payroll code (5 component files + helpers) | Delete old `.jsx` files |
| 1.3 | Create `payrollService.js` — all Supabase CRUD operations | `src/services/payrollService.js` |
| 1.4 | Rewrite `payrollHelpers.js` — clean calculation utilities | `src/utils/payrollHelpers.js` |
| 1.5 | Rewrite `Payroll.jsx` as a nested router layout with sub-nav | `src/components/pages/Payroll.jsx` |
| 1.6 | Update `AdminDashboard.jsx` route from `payroll` to `payroll/*` | `src/components/pages/AdminDashboard.jsx` |
| 1.7 | Create `PayrollDashboard.jsx` — KPI cards, quick actions, activity timeline | `src/components/payroll/PayrollDashboard.jsx` |

**Milestone:** Navigating to `/admin/payroll` shows the new dashboard with live KPIs and sub-nav works.

---

### Phase 2: Run Payroll (Core Flow)

**Goal:** The main payroll creation workflow — the most complex part.

| # | Task | Files |
|---|------|-------|
| 2.1 | Create `NewPayrollRun.jsx` — Period Setup (Step 1) | `src/components/payroll/NewPayrollRun.jsx` |
| 2.2 | Staff & Hours Review (Step 2) — card grid with shift detail, hour overrides, exclude toggles | Same file |
| 2.3 | Deductions & Additions (Step 3) — auto-applied shortages/advances + manual add/edit | Same file |
| 2.4 | Review & Confirm (Step 4) — summary, save draft / approve / post actions | Same file |
| 2.5 | Wire up `payrollService.js` — generatePreview, saveRun, postRun | `src/services/payrollService.js` |
| 2.6 | Load/edit existing run (`/admin/payroll/run/:id`) | `src/components/payroll/NewPayrollRun.jsx` |

**Milestone:** Can create a payroll run from shift data, add deductions/bonuses, save as draft, and post.

---

### Phase 3: History + Staff Pay

**Goal:** View past runs and manage staff compensation.

| # | Task | Files |
|---|------|-------|
| 3.1 | Create `PayrollHistory.jsx` — filterable card list, detail view, void/delete | `src/components/payroll/PayrollHistory.jsx` |
| 3.2 | Create `StaffPay.jsx` — staff profile cards, rate history timeline, set new rate | `src/components/payroll/StaffPay.jsx` |
| 3.3 | Wire void/delete run operations in service | `src/services/payrollService.js` |

**Milestone:** Full history browsing and staff rate management operational.

---

### Phase 4: Pay Slips + Polish

**Goal:** Pay slip generation, viewing, and download. Final UX polish.

| # | Task | Files |
|---|------|-------|
| 4.1 | Create `PaySlipViewer.jsx` — single pay slip render component | `src/components/payroll/PaySlipViewer.jsx` |
| 4.2 | Create `PaySlips.jsx` — filterable grid, detail drawer, download | `src/components/payroll/PaySlips.jsx` |
| 4.3 | Generate stubs on run post — integrate into postRun service | `src/services/payrollService.js` |
| 4.4 | Polish — loading states, empty states, error handling, animations | All payroll files |
| 4.5 | Comprehensive browser testing | — |

**Milestone:** Full payroll system operational end-to-end.

---

### Phase 5 (Future): Advanced Features

Not in current scope, but planned:

- SSS / PhilHealth / Pag-IBIG / tax deduction tables
- Attendance tracking integration (late/absent auto-deduction)
- Employee self-service portal (staff view their own slips)
- Payroll reports & analytics dashboard
- Export to accounting software (CSV/QBO)
- Multi-period comparison reports
- Payroll calendar visualization

---

## Database Schema Reference

### Tables Dropped (no migration)
- `payroll_runs` (old)
- `payroll_lines` (old)
- `payroll_line_shifts` (old)
- `payroll_stubs` (old)
- `payroll_logs` (old)

### Tables Created (new)

#### `payroll_runs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| display_id | text | Sequential: PR-100000000001 |
| period_start | timestamptz | |
| period_end | timestamptz | |
| pay_date | timestamptz | |
| status | text | draft / reviewed / approved / posted / voided |
| totals | jsonb | staffCount, totalMinutes, gross, deductions, additions, net |
| notes | text | |
| created_by | uuid FK → profiles | |
| approved_by | uuid FK → profiles | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `payroll_lines`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| run_id | uuid FK → payroll_runs ON DELETE CASCADE | |
| staff_id | uuid FK → profiles | |
| staff_name | text | Snapshot at run time |
| staff_email | text | |
| rate | numeric | Hourly rate used |
| total_minutes | integer | |
| total_hours | numeric | Computed: minutes/60 |
| gross | numeric | hours × rate |
| total_deductions | numeric | |
| total_additions | numeric | |
| net | numeric | gross + additions - deductions |
| created_at | timestamptz | |

#### `payroll_line_shifts`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| line_id | uuid FK → payroll_lines ON DELETE CASCADE | |
| run_id | uuid FK → payroll_runs ON DELETE CASCADE | |
| shift_id | text | References shifts.id |
| original_start | timestamptz | |
| original_end | timestamptz | nullable (ongoing) |
| override_start | timestamptz | nullable |
| override_end | timestamptz | nullable |
| minutes_used | integer | |
| excluded | boolean DEFAULT false | |
| shortage | numeric DEFAULT 0 | |
| notes | text | |

#### `payroll_deductions`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| line_id | uuid FK → payroll_lines ON DELETE CASCADE | |
| run_id | uuid FK → payroll_runs ON DELETE CASCADE | |
| type | text | shortage / advance / manual / other |
| label | text | Human-readable description |
| amount | numeric | |
| source_id | text | nullable — links to expense.id or shift.id |
| auto_applied | boolean DEFAULT false | true = system-generated |
| created_at | timestamptz | |

#### `payroll_additions`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| line_id | uuid FK → payroll_lines ON DELETE CASCADE | |
| run_id | uuid FK → payroll_runs ON DELETE CASCADE | |
| type | text | bonus / overtime / allowance / manual / other |
| label | text | |
| amount | numeric | |
| auto_applied | boolean DEFAULT false | |
| created_at | timestamptz | |

#### `payroll_stubs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| run_id | uuid FK → payroll_runs ON DELETE CASCADE | |
| line_id | uuid FK → payroll_lines ON DELETE CASCADE | |
| staff_id | uuid | |
| staff_name | text | |
| period_start | timestamptz | |
| period_end | timestamptz | |
| pay_date | timestamptz | |
| rate | numeric | |
| total_hours | numeric | |
| gross_pay | numeric | |
| deductions | jsonb | Array of {type, label, amount} |
| additions | jsonb | Array of {type, label, amount} |
| total_deductions | numeric | |
| total_additions | numeric | |
| net_pay | numeric | |
| shifts | jsonb | Array of {id, label, start, end, hours, pay} |
| created_at | timestamptz | |

### Tables NOT Touched (read-only sources)
- `shifts` — source of hours + shortages
- `expenses` — source of salary advances
- `profiles` — source of staff info + pay rates

---

## File Map

### Delete
```
src/components/payroll/RunPayroll.jsx
src/components/payroll/AllRuns.jsx
src/components/payroll/PayRates.jsx
src/components/payroll/StatChip.jsx
src/components/pages/Paystub.jsx
```

### New
```
scripts/create_payroll_schema.sql        — DB migration
src/services/payrollService.js           — All payroll CRUD
src/components/payroll/PayrollDashboard.jsx
src/components/payroll/NewPayrollRun.jsx
src/components/payroll/PayrollHistory.jsx
src/components/payroll/StaffPay.jsx
src/components/payroll/PaySlips.jsx
src/components/payroll/PaySlipViewer.jsx
```

### Modify
```
src/components/pages/Payroll.jsx         — Rewrite as nested router
src/components/pages/AdminDashboard.jsx  — Route change: payroll → payroll/*
src/utils/payrollHelpers.js              — Rewrite with clean helpers
```
