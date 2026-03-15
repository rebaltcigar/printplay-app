# Database Changes Tracker

> Last updated: 2026-03-15 18:05

## Purpose

Track all SQL scripts that need to be run on Supabase for deployment.
Before deploying to prod, all changes here must be applied to `supabase_schema.sql`.

---

## Pending — Need to Run on Dev/Staging

| # | Script | Description | Status |
|---|--------|-------------|--------|
| 1 | `scripts/fix_payroll_staff_id.sql` | Change `payroll_lines.staff_id` and `payroll_stubs.staff_id` from `uuid` to `text` (shifts use sequential ST-xxx IDs) | ⏳ Pending |
| 2 | `scripts/get_shift_summaries.sql` | Fix PC rental double-counting in expected cash: exclude 'pc rental' from order_items aggregation, add `pc_oi_non_cash` | ⏳ Pending |

---

## Already Applied to Dev

| # | Script | Description | Date Applied |
|---|--------|-------------|-------------|
| 1 | `scripts/create_payroll_schema.sql` | New payroll schema: `payroll_runs`, `payroll_lines`, `payroll_stubs`, `payroll_adjustments` | 2026-03-15 |
| 2 | `scripts/setup_assets_storage.sql` | Storage RLS for `assets` bucket: public read, auth upload/update/delete | 2026-03-15 |

---

## Prod Deployment Checklist

Before deploying to production, run these in order:

1. [ ] `scripts/create_payroll_schema.sql` — payroll tables
2. [ ] `scripts/setup_assets_storage.sql` — storage RLS
3. [ ] `scripts/fix_payroll_staff_id.sql` — staff_id uuid→text
4. [ ] `scripts/get_shift_summaries.sql` — shift difference fix
5. [x] Update `supabase_schema.sql` with all changes above

---

## Notes

- `shortageForShift()` in `payrollHelpers.js` disabled (always returns 0) — `cash_difference` is unreliable because it includes digital/AR effects
- Shifts Difference column now computed live from denominations + `computeExpectedCash()`, not from stored `cash_difference`
- **Phase 3** — no DB schema changes needed; all queries use existing `payroll_lines`, `payroll_runs`, `payroll_stubs` tables
