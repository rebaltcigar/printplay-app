# Kunek — Release History

Completed versions archived from ROADMAP.md. CHANGELOG.md has the authoritative diff-level record; this file preserves design decisions, schema changes, and rationale.

---

## v0.2.2 — Kunek Rebranding (2026-03-06)
Branch: `feature/rebrand`

**Goal**: Platform shell says "Kunek". Business branding 100% dynamic from `settings/config`.

- Renamed `package.json` (`print-play-app` → `kunek`), `index.html` title to "Kunek"
- Removed all hardcoded "PrintPlay" / "Print+Play" strings from JSX/JS
- `storeName`, `logoUrl` fallback to "Kunek" everywhere; no hardcoded business name in code
- `settings/config` fetched once in `App.jsx`, logo preloaded before gate opens, passed as `appSettings` prop — eliminates per-component fetches and branding flash
- `staffDisplayName` extracted from user doc already fetched in auth bootstrap (no extra read in POS)
- `shiftStartTime` extracted from shift doc already fetched in auth bootstrap; timer initialises synchronously on first render

---

## v0.2.1 — POS Redesign (2026-03-06)
Branch: `feature/catalog-foundation`

**Goal**: Faster cashier workflow. Tile grid replaces dropdown. Tabbed workspace.

- Classic / Grid view toggle — chip in POS header, persisted to `localStorage`, defaults to Classic
- Classic view: full-width single-column, Add to Order form pinned above cart, no split panel
- Grid view: dynamic tile grid with category filter chips (All / Services / Retail), 65/35 split
- Variant drilldown — parent tile opens variant tiles grouped by Variant Group; back button returns
- Shift+click quantity dialog on leaf tiles
- Tab transition loader (280ms CircularProgress) when switching Sale ↔ PC Rental tabs
- Checkout hotkey (F10 default), configurable in Admin → Settings → Hardware
- PC Rental settings in Admin → Settings → POS: toggle, external/built-in mode, catalog service link
- "Logs" rename (was "History")
- Fixed: `toLocalInput` / `toTimestamp` ReferenceError in Shifts.jsx edit dialog
- New transaction fields (forward-only): `serviceId`, `parentServiceId`, `variantGroup`, `variantLabel`, `attributes`

---

## v0.2.0 — Catalog Foundation (2026-03-06)
Branch: `feature/catalog-foundation`

**Goal**: Flexible, fully admin-managed service catalog. No hardcoded services in code.

**Schema additions to `services` (all backward-compatible):**
- `hasVariants: boolean` — marks a container item (not sold directly, opens picker)
- `variantGroup: string` — section header within the picker
- `variantGroups: string[]` — canonical ordered array on parent; variants select from this list
- `priceType: 'fixed' | 'variable'` — replaces ambiguous `price: 0`
- `pricingNote: string` — cashier hint for variable items (e.g., "₱5–₱20")
- `posLabel: string` — short tile name (falls back to serviceName)
- `posIcon: string` — icon key from admin-selectable preset list
- `attributes: []` — optional trackable tags per transaction (no price impact)

**Admin UI:**
- Catalog editor upgraded to full-screen dialog (was side drawer)
- Simple items: compact single-column dialog; variant parents: wide two-pane dialog
- Inline variant management — variants created/edited inside parent dialog
- Variant groups are a managed list — dropdown prevents typo duplicates; delete guard if variants assigned
- Visual icon picker (actual MUI icon buttons, not text dropdown)
- Child count badge on parent rows in the catalog table

**Hook changes:**
- `usePOSServices`: added `posItems`, `variantMap` outputs; existing `serviceList`, `expenseTypes` unchanged
- `useServiceList`: added `variantChildren` output

---

## v0.1.32 and earlier
See CHANGELOG.md for full diff history. Key milestones:
- v0.1.x: initial POS, shift management, payroll, debt system, order management, staff scheduling
