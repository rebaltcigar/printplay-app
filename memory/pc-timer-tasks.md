# PC Timer System — Master Task List

*Last updated: 2026-03-10*
*Legend: ✅ Done · 🔲 Pending · 🚧 In progress · ⏸ Deferred*

---

## Phase 1 — Core Timer (MVP)

### M1 · Firestore Schema + Security Rules

- ✅ Define collections: `stations`, `zones`, `rates`, `packages`, `sessions`, `station_logs`
- ✅ Security rules: zones, rates, packages (admin-only write)
- ✅ Security rules: stations (admin write + agent heartbeat fields only)
- ✅ Security rules: sessions (admin/staff write)
- ✅ Security rules: station_logs (append-only — update/delete always false)
- ✅ Security rules: agent custom token claim support (`request.auth.token.stationId`)
- ✅ `firestore.indexes.json` — add composite indexes:
  - `sessions`: `stationId` + `status`
  - `sessions`: `shiftId` + `status`
  - `station_logs`: `stationId` + `timestamp`

---

### M2 · Admin CRUD — Web Console

- ✅ **Zones** — `src/components/admin/Zones.jsx` — name, color picker, sort order
- ✅ **Rates** — `src/components/admin/Rates.jsx` — per-hour UI → per-minute storage, time-of-day schedule overrides, day-of-week checkboxes, rounding policy
- ✅ **Packages** — `src/components/admin/Packages.jsx` — minutes, price, bonus time, expiry, rate plan link
- ✅ **Stations** — `src/components/admin/Stations.jsx` — name, zone, rate, specs, IP/MAC, provisioning token dialog
- ✅ **Cloud Function** — `generateStationToken` — creates a real Firebase custom token with `{ stationId }` claim; called from Stations.jsx "Generate Token" button

---

### M3 · PC Map Dashboard — Web Console

- ✅ `src/components/StationMap.jsx` — live grid/list view of all stations
- ✅ Station cards — color-coded by status (available/in-use/offline/maintenance)
- ✅ Real-time countdown (1s tick, no extra Firestore reads)
- ✅ Postpaid: elapsed time + running cost
- ✅ Color warnings: green → yellow (≤15 min) → red (≤5 min)
- ✅ Zone filter chips
- ✅ Summary stats bar (total, available, in-use, offline, tamper alerts)
- ✅ Grid/list view toggle
- ✅ Tamper alert badge on station cards
- ✅ Agent offline badge on station cards
- ✅ Station logs drawer (append-only audit trail)
- ✅ Maintenance mode toggle from card menu
- ✅ **PC Map UI Overhaul (Pondo-style)**
  - ✅ Left Detail Drawer: Integrated into high-density List View & Context Menu
  - ✅ Right Activity Drawer: Global Activity Table at bottom of map
  - ✅ **Action Toolbar/Icons**
    - ✅ Shutdown, Restart, Wake-on-LAN, Pause, Resume, Top-up (Unified Dialog)


---

### M4 · Session Management — Web Console

- ✅ **Start Session** — `src/components/stations/StartSessionDialog.jsx`
  - ✅ Walk-in or member (customer search autocomplete)
  - ✅ "Quick Guest" mode (Auto-generate G-XXXX name, skip customer search)
  - ✅ Prepaid by rate (select rate + enter minutes)
  - ✅ Prepaid by package (visual package picker)
  - ✅ Postpaid (select rate + optional soft limit)
  - ✅ Payment collection (Cash/GCash/Card/Other)
  - ✅ Writes: `sessions`, updates `stations`, writes `transactions` + `station_logs`

- ✅ **End Session** — `src/components/stations/EndSessionDialog.jsx`
  - ✅ Prepaid: shows already-paid summary
  - ✅ Postpaid: calculates bill using rounding policy, collects payment
  - ✅ Writes: updates `sessions`, frees `stations`, writes `transactions` + `station_logs`
- ✅ **Unified Top-up** — Integrated into `src/components/stations/StartSessionDialog.jsx`
  - ✅ Enter by minutes (hours) or by amount (auto-converts with real-time subtext)
  - ✅ Skips customer search for active sessions
  - ✅ Full Checkout flow (matching POS/Digital payments)
  - ✅ Writes: updates `sessions.minutesAllotted`, writes `transactions` + `station_logs`
- ✅ **Force Lock / Force Unlock** — from station card/row context menu
- ✅ **Pause / Resume** session — update `station.isPaused`, handled by agent logic
- ✅ **Discount application** — apply discount % or fixed amount during Checkout step

---

### M5 · AdminDashboard Integration

- ✅ PC Timer section divider in sidebar
- ✅ Nav tabs: PC Map, Zones, Rates, Packages, Stations
- ✅ All routes wired: `/admin/pcmap`, `/admin/zones`, `/admin/rates`, `/admin/packages`, `/admin/stations`

---

### M6 · Electron Lock Screen (Client Agent — new repo `kunek-agent`)

- ✅ **Repo scaffold** — `kunek-agent/` with `service/`, `launcher/`, `keyboard-helper/`, `scripts/`
- ✅ **Electron window** — fullscreen, alwaysOnTop ('screen-saver'), frame: false, skipTaskbar: true
- ✅ **A1 — Idle state** — looping video background + large clock + date + "Press any key" hint
- ✅ **A2 — Active state** — keypress → login panel slides in (walk-in message + Phase 2 member block placeholder)
- ✅ **Inactivity timeout** — A2 → A1 after N seconds of no input (configurable via `inactivityMs`, default 30s); inactivity progress bar
- ✅ **Video source** — reads `KUNEK_VIDEO_PATH` env (set by watchdog from config.json); fallback to dark radial gradient

---

### M7 · Node.js Windows Service (Client Agent)

- ✅ **Service wrapper** — `node-windows` installs as SYSTEM service
- ✅ **Install path** — all persistent files in `C:\ProgramData\KunekAgent\` (CCBoot-excluded)
- ✅ **`config.json`** — `{ stationId, firebaseCustomToken, firestoreProjectId, firebaseApiKey, firebaseAuthDomain, videoBackgroundPath }`
- ✅ **Firebase client SDK init** — `signInWithCustomToken` (client SDK, not Admin — enforces Firestore rules per station)
- ✅ **Firestore `onSnapshot`** — subscribe to own `stations/{stationId}` doc + active session doc
- ✅ **Command handler** — on `isLocked` change → send IPC to Electron; on `currentSessionId` change → cache session to SQLite + send IPC
- ✅ **Heartbeat writer** — every 60s write `agentLastPing: serverTimestamp()` + `isOnline: true` to station doc
- ✅ **Session countdown** — every 60s: `minutesUsed++` → write Firestore + SQLite; every 1s: compute secondsRemaining → send IPC `TIMER_TICK`
- ✅ **Auto-lock** — at T=0: send IPC `SESSION_EXPIRED` → update station doc `status: available` → write `station_logs: session-end`
- ✅ **Electron watchdog** — spawn Electron; on exit → relaunch in ~1s → log `tamper-window-killed`
- ✅ **Keyboard helper watchdog** — spawn C# helper; on exit → relaunch (commented out until keyboard-helper.exe built)
- ✅ **Tamper threshold** — track kills in rolling window; at N kills in X min → write `tamper-multiple-kills` → set `station.tamperAlert = true`
- ✅ **Provisioning script** — `scripts/provision.js` — first-time setup wizard writes `config.json`
- ✅ **Install script** — `scripts/install.js` — registers the Windows Service (supports KUNEK_DEV=1 for local dev)

---

### M8 · Floating Session Widget (Client Agent)

- ✅ **Electron child window** — 280×90px, always-on-top ('pop-up-menu'), transparent, focusable: false, bottom-right, hidden until UNLOCK
- ✅ **Opacity** — 35% default → 100% on hover (CSS :hover)
- ✅ **Prepaid display** — countdown timer (large, h:mm or mm:ss) + ₱ remaining (small)
- ✅ **Postpaid display** — elapsed time + "₱X.XX so far"
- ✅ **Color states** — green (>15m) → yellow (≤15m) → red (≤5m)
- 🔲 **Expand on click** — show full session details panel
- ✅ **Warnings** — yellow/red glow pulse on pill at warning thresholds
- 🔲 **Toast dialogs** — 5 min dismissal dialog; 1 min persistent dialog + flash

---

### M9 · IPC: Service ↔ Electron (Client Agent)

- ✅ **Named pipe** — `\\.\pipe\KunekAgent` (service: `net.createServer` ↔ launcher: `net.createConnection` with auto-reconnect)
- ✅ **Message types** — `LOCK`, `UNLOCK`, `SESSION_UPDATE`, `TIMER_TICK`, `WARNING`, `SESSION_EXPIRED`
- ✅ **Electron preload** — `contextBridge`: `window.kunek.on(channel, cb)` + `window.kunek.send(type, payload)`

---

### M10 · C# Keyboard Helper (Client Agent)

- ✅ **.NET 6 Windows project** — `keyboard-helper/KeyboardHelper.csproj` + `Program.cs`
- ✅ **Low-level keyboard hook** (`SetWindowsHookEx WH_KEYBOARD_LL`)
- ✅ **Mode A (locked)** — swallow Alt+F4, Alt+Tab, Win key (LWin/RWin — covers Win+D, Win+R, Win+Tab)
- ✅ **Mode B (active session)** — all keys pass through (hook passive)
- ✅ **Named pipe IPC** — connects to `\\.\pipe\KunekAgent`, reads LOCK/UNLOCK, auto-reconnects
- ✅ **Watchdog active** — `spawnKeyboardHelper()` enabled in `service/watchdog.js`
- ⏸ **Credential Provider DLL** — Ctrl+Alt+Del replacement (Phase 1b — needs signed COM DLL)

> Build: `dotnet publish -c Release -r win-x64 -p:PublishSingleFile=true --self-contained true -o dist`
> Deploy: `dist/keyboard-helper.exe` → `C:\ProgramData\KunekAgent\keyboard-helper\`

---

### M11 · SQLite Offline Fallback (Client Agent)

- ✅ **`better-sqlite3`** — `C:\ProgramData\KunekAgent\state.db`
- ✅ **`session_state` table** — caches active session for offline countdown
- ✅ **`tamper_events` table** — local tamper log
- ✅ **Offline countdown** — `setInterval` in session.js runs independently of Firestore
- ✅ **Reconciliation on reconnect** — `updateSession()` takes `max(local, firestore).minutesUsed`
- ✅ **`MAX_OFFLINE_MINUTES` limit** — configurable via `config.json.maxOfflineMinutes` (default 10)
- ✅ **Reboot recovery** — `index.js` calls `startSession()` from SQLite row on boot; Firestore reconciles on first snapshot
- ✅ **IPC connect-state replay** — `ipc.js` replays last LOCK/UNLOCK to newly connected clients (fixes Electron startup race)
- ✅ **First-snapshot fix** — `firestore.js` now sends LOCK/UNLOCK on very first snapshot (not just on changes)

---

### E2E Tests (manual checklist)

- 🔲 **E2E prepaid flow** — `kunek-agent/E2E-PREPAID-TEST.md` — Tests A–E written; run against live agent
- 🔲 **E2E postpaid flow** — cashier starts → runs → cashier ends → bill calculated → station freed
- 🔲 **E2E offline resilience** — covered in Test D of E2E-PREPAID-TEST.md
- 🔲 **E2E tamper detection** — covered in Test E of E2E-PREPAID-TEST.md

---

## Phase 2 — Members + Wallet + Packages

- ✅ Wallet top-up flow in POS (cashier adds ₱ credits to customer wallet)
- ✅ Package purchase at POS counter (stored as `minutesRemaining` on customer)
- ✅ Member self-login on agent lock screen (Username/Password entry on A2 state)
- ✅ Forced password change on first login (security requirement)
- ✅ Session deduction from member balance (Resume Session flow)
- ✅ Save unused session time back to member balance on checkout
- ✅ Unified Top-up vs Account Use in Start Session dialog
- ✅ Standalone Account Top-up unified in Start Session UI
- ✅ Integrated "New Customer" module in PC Timer workflow
- ✅ Floating widget: time remaining derived from credits/rate (not fixed minutes)
- 🔲 Loyalty points accumulation (configurable: 1 point per X min or per ₱)
- 🔲 Member session history (visible on customer profile in admin)

---

## Phase 3 — Game Launcher (Electron → Tauri migration)

- 🔲 Game catalog admin (name, exe path, cover art, genre, tags)
- 🔲 Migrate Electron shell → Tauri (same React UI, WebView2 instead of Chromium)
- 🔲 Lock screen becomes game launcher — browsable game grid
- 🔲 Game launch on session start (click tile → spawn exe)
- 🔲 Running game tracking (write to station doc → operator console shows "Now Playing")
- 🔲 Per-game playtime analytics
- 🔲 Optional: Steam/Epic cover art auto-fill via public web API

---

## Phase 4 — Advanced Operations

- 🔲 Reservation system — book a station for a future time slot
- 🔲 Waitlist — next-available in zone
- 🔲 Remote broadcast message — display overlay on selected stations
- 🔲 Discount approval workflow — cashier requests, manager approves remotely
- 🔲 Advanced reporting: revenue by station/zone/time slot, peak hours heatmap, game analytics
- 🔲 Staff performance: sessions opened per cashier, discounts given
- 🔲 Idle station alert — station unlocked but no input for X minutes
- 🔲 Process blacklist (optional) — block cmd/regedit/PowerShell during sessions

---

## Phase 5 — Ecosystem & Integrations

- 🔲 Multi-location (zones across branches)
- 🔲 Mobile operator app (React Native or PWA)
- 🔲 GCash/PayMaya QR self-top-up kiosk
- 🔲 Discord integration — notify member when booked station is ready
- 🔲 API for third-party tournament platforms

---

## Immediate Next Steps (Phase 1 critical path)

Priority order to reach first working E2E test:

1. ✅ `firestore.indexes.json` — add composite indexes
2. ✅ Cloud Function: `generateStationToken`
3. ✅ `kunek-agent` repo scaffold + Node.js service base
4. ✅ Firestore listener + SQLite + heartbeat in service
5. ✅ Electron lock screen A1 + A2
6. ✅ IPC named pipe (service server + launcher client with auto-reconnect)
7. ✅ Floating widget (prepaid countdown + postpaid elapsed, color states, hover opacity)
8. ✅ Session countdown + auto-lock (session.js)
9. ✅ C# keyboard helper (keyboard-helper/ — build + deploy)
10. ✅ **E2E prepaid flow test** — Cashier starts → agent unlocks → countdown
11. ✅ **Unified Top-up flow** — Add time via StartSessionDialog
12. 🔲 Offline resilience + reconciliation (2 hr)
13. 🔲 Tamper detection + watchdog (1 hr)
