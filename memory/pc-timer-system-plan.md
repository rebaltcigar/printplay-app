# PC Timer System — Architecture & Build Plan

## Competitive Research Summary

### SENET — Why It's the Best
SENET is the gold standard because it solved the right problems simultaneously:
- **Game Launcher as the lock screen** — full-screen branded launcher doubles as the session gate. Users see a curated game library, not a scary "locked" screen. Integrates with Steam, Epic, GOG, Battle.net, Xbox Game Pass — auto-populates titles with cover art, metadata, genres.
- **Centralized game management** — admin installs/updates games from the server, rolls out to all PCs silently. No walking machine to machine.
- **Real-time session dashboard** — operator sees every station at a glance. **Implemented**: High-density "Pondo-style" table for multi-PC management, with Grid View for visual monitoring.
- **Flexible pricing engine** — peak/off-peak rates, loyalty tiers. **Implemented**: Zone-based pricing with automatic rate inheritance.
- **Power Management** — Wake-on-LAN (WOL), Shutdown, and Restart controls.
- **Session Persistence** — Sessions automatically resume after a PC reboot if they are still active in Firestore.

- **Cross-platform clients** — Windows client agent, web-based operator console, mobile app for remote monitoring.

### Pondo
- Reliable timer, simple prepaid model
- Flexible rates and packages (time bundles)
- No open/postpaid sessions
- Old desktop app, poor reporting, no game launcher
- Lacks CRM, no loyalty system

### PanCafe Pro
- Modern UI, fast client-side response
- Feature-rich: reservations, loyalty points, packages, messaging to stations
- No packages per se (compared to Pondo) — rate-based
- Poor reporting
- Performance degraded on some networks (likely polling-based architecture)
- No real game launcher

### iCafe + CCBoot
- **CCBoot** is not a billing system — it's a diskless boot infrastructure. PCs boot over the network from a centralized OS image (PXE). No HDD/SSD needed on client PCs. All game installs, OS updates, and antivirus are managed once on the server image. Per-session write cache discarded on reboot — clean slate every session.
- **iCafe** is the billing layer paired on top — web-based admin (accessible from any device), lock screen + game launcher kiosk on clients.
- The combination eliminates per-PC hardware costs (CCBoot) and complex re-imaging (CCBoot) while billing via iCafe. They're complementary, not competing with SENET directly.
- iCafe game launcher/lock screen looks good on paper, poor execution in practice
- Reporting and loyalty are basic
- **This is the deployment environment for our first shop** — agent must be CCBoot-compatible from Phase 1

### Cross-System Feature Comparison

| Feature | SENET | Pondo | PanCafe Pro | iCafe+CCBoot |
|---|---|---|---|---|
| Architecture | Cloud SaaS | LAN desktop | LAN desktop | LAN/web hybrid |
| Postpaid / open session | Yes | No | Limited | Limited |
| Packages / bundles | Yes | Yes | No | Yes |
| Member accounts | Yes (full) | Basic/none | Basic | Basic |
| Loyalty points | Yes | No | No | No |
| Game launcher | Yes (full) | No | No | Yes (basic) |
| Reporting depth | Best-in-class | Minimal | Basic | Basic |
| Multi-venue | Yes | No | No | No |
| Cloud / remote access | Yes | No | Partial | Yes (web) |
| Offline resilience | Yes (agent cache) | Yes (local) | Yes (local) | Yes (local) |
| Diskless boot support | No | No | No | Yes (CCBoot) |
| API | Yes | No | No | Limited |
| Per-zone pricing | Yes | No | Yes | Yes |

---

## Architecture Philosophy

**The core contract of a PC timer system:**
> The client machine must be controlled by the server at all times. The server is the source of truth for session state. The client enforces that truth locally so that a network drop does not give users free time OR cut them off unfairly.

This means:
1. A **lightweight agent** runs on every client PC — not a browser tab, a real installed service
2. The **server** (our Kunek backend) manages session state
3. The **operator console** (our existing React app) controls everything
4. Sessions are **state-machine based** — not timers that run on clocks

### Technology Stack Fit with Existing Kunek Architecture

| Layer | Technology | Notes |
|---|---|---|
| Operator Console | React + MUI (existing) | Extend with PC Timer tab |
| Backend / DB | Firebase Firestore (existing) | Real-time listeners are perfect for this |
| Agent service | Node.js Windows Service (`node-windows`) | Runs as SYSTEM; spawns + watchdogs the launcher |
| Lock screen / launcher | Electron (Phase 1–2) → Tauri (Phase 3+) | Electron for fast dev; migrate to Tauri before game launcher for low RAM footprint |
| Keyboard security | Small C# helper process | Low-level keyboard hook + Windows Credential Provider for Ctrl+Alt+Del |
| Real-time sync | Firestore onSnapshot | Agent subscribes to its own station doc |
| Offline fallback | Local SQLite in agent | Stores session state, syncs when back online |
| Authentication | Firebase Auth (existing) | Members log in via agent UI |
| Payments | Existing payment flow | Cashier tops up via Kunek POS |

**Why two agent processes:**
The Node.js service and the Electron window are separate processes by design. The service runs as SYSTEM and is unkillable by the user. It spawns the Electron launcher window and monitors it. If Electron crashes or is killed (e.g., via a custom script), the service detects it and relaunches within ~1 second. Security does not depend on Electron being indestructible — it depends on the service always restoring it.

**CCBoot / diskless compatibility:**
CCBoot discards the per-session write cache on reboot — anything written to the standard user profile or temp paths during a session is gone. The agent must be installed in the **base image** (the protected, non-discarded layer). SQLite must also be stored in a CCBoot-excluded path (e.g., `C:\ProgramData\KunekAgent\`) which CCBoot operators configure as a persistent directory. Firebase custom token stored there too — it's generated once at provisioning and must survive reboots. Session state in Firestore is the primary truth; SQLite is the offline fallback only. On a diskless LAN, internet drops are less likely but still possible (router issues, ISP), so the SQLite fallback still matters.

**Electron → Tauri migration rationale:**
Electron bundles a full Chromium (~150MB, 200-400MB RAM at runtime). On cafe PCs with 4-8GB RAM, this is acceptable for Phase 1-2. But Phase 3 adds a game launcher — users will be running Electron + a game simultaneously. Tauri uses the OS's built-in WebView2 (Edge runtime, already installed on Windows 10/11) instead of bundling Chromium. Result: ~10-30MB RAM for the launcher, leaving more headroom for games. The UI code (React) is identical — only the shell changes.

**Minimum spec for Electron client:** Windows 10, 4GB RAM, dual-core CPU.
**Minimum spec for Tauri client:** Windows 7 SP1+, 2GB RAM (WebView2 required, auto-installed).

---

## Data Model

### New Collections

#### `stations`
```javascript
stations/{stationId}
  name: string                    // "PC-01"
  label: string                   // "VIP Booth 1"
  zoneId: string                  // ref to zones collection
  specs: {
    cpu: string,
    gpu: string,
    ram: string,
    monitor: string
  }
  rateId: string                  // default rate plan
  status: 'available' | 'in-use' | 'reserved' | 'offline' | 'maintenance'
  currentSessionId: string | null
  agentVersion: string
  agentLastPing: timestamp
  ipAddress: string
  macAddress: string
  isOnline: boolean
  isLocked: boolean
  lockedReason: string | null
  createdAt: timestamp
  updatedAt: timestamp
```

#### `zones`
```javascript
zones/{zoneId}
  name: string      // "VIP", "Regular", "Gaming Pods"
  defaultRateId: string
  color: string     // for dashboard map
  sortOrder: number
```

#### `rates`
```javascript
rates/{rateId}
  name: string               // "Regular", "VIP Rate", "Off-Peak"
  type: 'per-minute' | 'per-hour' | 'fixed-package'
  ratePerMinute: number      // internal unit — always per-minute even if displayed as per-hour
  minimumMinutes: number     // minimum charge (e.g., 30 min minimum)
  roundingPolicy: 'up-minute' | 'up-5min' | 'exact'
  zoneIds: string[]          // which zones this rate applies to (empty = all)
  schedules: [               // time-of-day overrides
    {
      label: string,         // "Off-Peak"
      startTime: string,     // "08:00"
      endTime: string,       // "14:00"
      ratePerMinute: number,
      days: number[]         // 0=Sun, 1=Mon...
    }
  ]
  isActive: boolean
```

**Billing precision note:** Always store `ratePerMinute` internally. Display as per-hour in UI (multiply by 60). This prevents floating-point errors and makes schedule overrides unambiguous. Never trust the client clock — use `startedAt` (server timestamp) as the authoritative start point.

#### `packages`
```javascript
packages/{packageId}
  name: string              // "3-Hour Bundle"
  minutes: number           // 180
  price: number             // 45.00
  bonusMinutes: number      // 0 (or 30 for promos)
  validDays: number         // expiry from purchase (0 = session only)
  rateId: string            // which rate plan it applies to
  isActive: boolean
  sortOrder: number
```

#### `sessions`
```javascript
sessions/{sessionId}
  stationId: string
  customerId: string | null        // null = walk-in
  customerName: string             // snapshot at session start
  type: 'prepaid' | 'postpaid' | 'package' | 'complimentary'
  status: 'active' | 'paused' | 'ended' | 'force-ended'

  rateId: string
  rateSnapshot: object             // full rate doc at session start (rate changes don't affect in-progress sessions)
  packageId: string | null
  packageSnapshot: object | null

  startedAt: timestamp             // Firestore server timestamp — authoritative
  pausedAt: timestamp | null
  resumedAt: timestamp | null
  endedAt: timestamp | null

  minutesAllotted: number | null   // prepaid / package
  minutesUsed: number              // reconciled on each heartbeat
  minutesPaused: number            // total paused duration
  lastHeartbeatAt: timestamp       // last agent checkin

  // Billing
  ratePerMinuteApplied: number     // actual rate used (may differ from rate doc if schedule was active)
  amountCharged: number
  amountPaid: number
  paymentMethod: string
  discountAmount: number
  discountReason: string

  // Postpaid
  openEnded: boolean
  estimatedLimit: number | null    // soft warning threshold in minutes

  // Metadata
  staffId: string                  // who opened the session
  shiftId: string
  notes: string
  createdAt: timestamp
  updatedAt: timestamp
```

**Key field:** `rateSnapshot` — snapshot the full rate document when the session starts. This means mid-session rate changes by admin don't affect the current session. Same pattern as price snapshots in orders.

#### `station_logs` (append-only audit trail)
```javascript
station_logs/{logId}
  stationId: string
  sessionId: string | null
  event: 'session-start' | 'session-pause' | 'session-resume' | 'session-end'
         | 'top-up' | 'free-time' | 'power-restart' | 'power-shutdown' | 'power-wol'
         | 'agent-heartbeat' | 'agent-offline' | 'agent-online'
  metadata: {
    staffName: string,
    staffEmail: string,
    customerName: string,
    ... // event-specific data
  }
  timestamp: timestamp
  staffId: string | null
  severity: 'info' | 'warning' | 'alert'
```


#### `member_wallets` (extends existing `customers`)
```javascript
// Fields added to customers/{id}
  walletCredits: number        // stored as credits (e.g., 1 credit = ₱1 or whatever the shop sets)
  packages: [                  // purchased but unused packages
    { packageId, minutesRemaining, purchasedAt, expiresAt }
  ]
  lifetimeMinutes: number
  loyaltyPoints: number
```

**Credit-based wallet design:**
Credits are the stored unit — not minutes, not raw pesos. 1 credit = ₱1 (or whatever conversion the shop configures). This mirrors Pondo's model which operators already understand. The `rates` doc stores `creditsPerMinute` (e.g., 0.5 credits/min = ₱0.50/min). At session start, time available is calculated as `walletCredits / creditsPerMinute` = minutes remaining.

**The visibility problem Pondo has — and how we fix it:**
Pondo shows only the running clock (elapsed time). Users have to ask the cashier "how much time do I have?" and the cashier has to check the terminal. We fix this on the client side:

- **Floating widget primary display:** Time remaining in hours/minutes (e.g., `1h 24m left`)
- **Secondary display:** Credits remaining (e.g., `₱42.00`) — smaller, below the time
- **Postpaid widget:** Elapsed time prominently + running cost (e.g., `0h 45m · ₱22.50`)
- Time remaining is always derived server-side from credits and rate, never guessed by the client
- On deduction events (every minute), the widget updates without any extra Firestore reads — the service pushes the updated value to Electron via IPC

---

## Client Agent Architecture

### Process Architecture (Three Cooperating Processes)

```
┌─────────────────────────────────────────────────────┐
│  Windows Service (Node.js — runs as SYSTEM)          │
│  - Firestore listener (onSnapshot)                   │
│  - SQLite local state                                │
│  - Heartbeat writer                                  │
│  - Spawns + watchdogs Electron/Tauri window         │
│  - Spawns + watchdogs C# keyboard helper            │
│  - Session countdown logic                          │
│  - Lock/unlock command receiver                     │
└──────────────┬─────────────────────────┬────────────┘
               │ spawns/monitors          │ spawns/monitors
               ▼                          ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│  Electron / Tauri window  │  │  C# keyboard helper       │
│  - Lock screen UI         │  │  - SetWindowsHookEx       │
│  - Game launcher          │  │  - Blocks Alt+Tab,        │
│  - Floating session       │  │    Win key, Alt+F4        │
│    widget (overlay)       │  │  - Credential Provider    │
│  - Communicates with      │  │    (Ctrl+Alt+Del screen)  │
│    service via IPC        │  │                           │
└──────────────────────────┘  └──────────────────────────┘
```

The service is the brain. The window is just the face. If the window is killed (End Task, script, crash), the service relaunches it in ~1 second. The service itself is a Windows Service running as SYSTEM — standard users cannot stop or kill it from Task Manager (Task Manager is also blocked via registry for standard accounts).

### Two Operating Modes

**Mode A: Locked (no active session)**
- Electron window is full-screen, always-on-top, covers the entire desktop
- Taskbar hidden (set via Windows API `SHAppBarMessage`)
- Two sub-states:

  **A1 — Idle (no keyboard/mouse activity for N seconds):**
  - Video background (looping ambient video, configured in admin — e.g., a gaming montage)
  - Centered: shop logo + current time (large, minimal — like a screensaver)
  - No login prompt visible
  - "Press any key to continue" hint at the bottom (subtle, small text)

  **A2 — Active lock screen (user pressed a key or moved mouse):**
  - Video background continues (or fades to blurred static)
  - Login panel slides in: member PIN/email field + "Walk-in — ask cashier" button
  - Phase 3+: game catalog grid visible behind/beside the login panel (browsable without logging in)
  - Transitions back to A1 after N seconds of inactivity

**Mode B: Session active**
- Full-screen lock window hidden / closed
- User has complete access to the normal Windows desktop — all apps, games, browser
- Desktop is NOT restricted or virtualized — it's a full standard Windows session
- **Floating widget** appears (always-on-top, cannot be closed by user):
  - Small (280×80px) overlay, bottom-right corner
  - Semi-transparent when not hovered (30% opacity), full opacity on hover
  - Shows: countdown timer, customer name, package or rate
  - Prepaid: green → yellow (≤15 min) → red (≤5 min)
  - Postpaid: elapsed time + running cost (e.g., ₱0.50/min... ₱12.50 so far)
  - Click to expand: full session details panel
  - Close button hidden (or locked — right-click does nothing)
  - Low resource usage: updates every 1 second via simple timer, no extra Firestore reads

**Operator Console UI Refinements (Phase 1/2):**
- **Station Cards (Grid)**: Standardized to 145x160px (matching POS services). Features large Monitor icon, centered status, and station name at the bottom.
- **Station List (Table)**: High-density "Pondo-style" table with PC, Status, Account, Level, Start Time, Type, Time, Fees, Balance, Name, Area, and IP columns.
- **Context Menu**: Unified right-click menu for both Grid and List views. No station name in header (cleaner look).
- **Unified Start/Top-up Dialog**: `StartSessionDialog.jsx` handles new sessions and top-ups.
  - Default input: "By Amount".
  - Real-time Hour/Peso conversion subtext.
  - Skips customer search for active sessions (read-only customer info).
  - Integration with POS Checkout flow (discounts, payment methods).

### Notification Popups (prepaid only)
- 15 minutes remaining → toast notification: "15 minutes left. Top up at the counter."
- 10 minutes remaining → toast notification
- 5 minutes remaining → persistent dialog (requires dismissal)
- 1 minute remaining → persistent dialog, red fullscreen flash
- 0 minutes → session ends, lock screen re-engages immediately

### Security Hardening
| Threat | Mitigation |
|---|---|
| End Task from Task Manager | **Allowed** — Task Manager is not disabled (needed for frozen apps). Service detects Electron exit event → relaunches in ~1s → logs `tamper-window-killed` event to Firestore. Operator console shows alert badge on that station. |
| Repeated End Task attempts | After N kills in X minutes → `tamper-multiple-kills` event → operator console shows prominent alert. Configurable threshold (e.g., 3 kills in 2 min). |
| Alt+F4 | Low-level keyboard hook — swallowed during locked mode (Mode A only). During active session (Mode B), Alt+F4 works normally on apps (user might legitimately close a game). |
| Alt+Tab | Keyboard hook — suppressed during Mode A (locked). Works normally in Mode B. |
| Windows key | Keyboard hook — suppressed during Mode A. Works normally in Mode B. |
| Ctrl+Alt+Del | Windows Credential Provider (C# DLL) — replaces the default screen during Mode A. In Mode B, user can Ctrl+Alt+Del normally (they need it to lock the PC, etc.) — but the session keeps running in the background. |
| Kill process via script | Service relaunches Electron in ~1s. Logs tamper event. |
| Kill service via Services panel | Service runs as SYSTEM — standard user cannot stop it. |
| Disable keyboard hook helper | Service watchdog relaunches it. |
| Custom script / Task Scheduler | Standard user has no admin rights. |
| USB attack / boot from USB | Out of scope for software — BIOS password + CCBoot base image protections. |

### Offline Behavior
| State | Behavior |
|---|---|
| Active prepaid session, internet drops | Service continues countdown from local SQLite snapshot. Lock enforced at T=0. No free time. |
| Internet restores | Service reconciles: compares local elapsed vs server elapsed. Takes the higher value (anti-fraud). Syncs `minutesUsed` to Firestore. |
| Postpaid session, internet drops | Session continues (no credit limit to enforce offline). Service logs offline duration in SQLite. |
| No session, internet drops | Station stays locked. New sessions cannot be started (cashier must be online to open a session). |
| Agent service crash / machine restart | On service start, reads SQLite. If session was mid-flight, reconnects to Firestore and continues from last known state. |

---

## Phase Plan

### Phase 1 — Core Timer (MVP) ✅ Build First

**Goal**: Cashier can start/end sessions, member and walk-in support, reliable prepaid timing.

---

#### Step 1 — Firestore Schema + Security Rules

New collections: `stations`, `zones`, `rates`, `packages`, `sessions`, `station_logs`

**Security rules:**
- Agent (Firebase custom token with `stationId` claim): read own station doc, write `agentLastPing`/`isOnline`/`agentVersion` only, create `station_logs` only
- Staff/Admin: full read/write on all new collections
- `station_logs`: **no delete ever** (append-only audit trail)

**Composite indexes needed:**
- `sessions`: `stationId` + `status`
- `sessions`: `shiftId` + `status`
- `station_logs`: `stationId` + `timestamp`

---

#### Step 2 — Admin CRUD (Zones → Rates → Packages → Stations)

**2a. Zones** (`/admin/zones` → `src/components/admin/Zones.jsx`)
- Fields: name, color (color picker), sortOrder
- No deletion if stations reference it

**2b. Rates** (`/admin/rates` → `src/components/admin/Rates.jsx`)
- Fields: name, ratePerHour (stored as `ratePerMinute = price/60`), minimumMinutes, roundingPolicy (`exact`/`up-minute`/`up-5min`), isActive
- Schedules (array): label, startTime (HH:MM), endTime (HH:MM), days (0–6 checkboxes), ratePerHour override
- UI shows per-hour; storage is always `ratePerMinute`

**2c. Packages** (`/admin/packages` → `src/components/admin/Packages.jsx`)
- Fields: name, minutes, price, bonusMinutes (default 0), validDays (0 = session-only), rateId (dropdown), isActive, sortOrder

**2d. Stations** (`/admin/stations` → `src/components/admin/Stations.jsx`)
- Fields: name (e.g. PC-01), label (e.g. VIP Booth 1), zoneId, specs (cpu/gpu/ram/monitor), rateId, macAddress, ipAddress
- Provisioning: "Generate Token" button → calls Cloud Function → displays custom token once → admin copies to `C:\ProgramData\KunekAgent\config.json`

---

#### Step 3 — PC Map Dashboard

Route: `/admin/pcmap` → `src/components/StationMap.jsx`

**Station card states/colors:**
- `available` → green: station name, "Available"
- `in-use` → blue: customer name, time remaining (prepaid) or elapsed (postpaid), rate/package
- `offline` → gray: last seen timestamp
- `maintenance` → yellow

**Card badges:** tamper alert (red dot), low time warning (orange ≤15 min), offline (gray >2 min no ping)

**Card actions:** Start Session, End Session, Extend Time, Force Lock/Unlock, View Logs, Maintenance toggle

**Real-time:** `onSnapshot` on `stations` + `sessions where status='active'` — join in memory

**Time remaining (prepaid, no agent):** computed from `startedAt + minutesAllotted - now()`

---

#### Step 4 — Start Session Dialog

`src/components/stations/StartSessionDialog.jsx`

3-step form:
1. **Customer**: Walk-in (default) or type-ahead search on `customers` collection
2. **Session type**: Prepaid by Rate (select rate + input minutes/amount) | Prepaid by Package (select package) | Postpaid (select rate + optional soft limit)
3. **Payment**: amount, payment method (Cash/GCash/Card/Other), "Start Session" button

**On submit:**
1. Write `sessions/{newId}` — `status:'active'`, `startedAt: serverTimestamp()`, `rateSnapshot` (full rate doc copy)
2. Update `stations/{id}` — `status:'in-use'`, `currentSessionId`
3. Write `transactions/{newId}` — `type:'pc-session'`, links to shiftId if available
4. Write `station_logs` — `session-start` event

---

#### Step 5 — Unified Top-up / End Session Logic

**Top-up (Add Time):**
Managed via `StartSessionDialog.jsx` in "activeSession" mode.
- Logic: `minutesAllotted += addedMinutes`, `amountPaid += finalTotal`.
- Records: `pc-topup` transaction + `top-up` log.

**End Session:**
`src/components/stations/EndSessionDialog.jsx`

**Prepaid:** summary (customer, start, minutes used, amount paid) → End Session (no extra billing)

**Postpaid:** fetch `minutesUsed`, apply rounding policy, show bill → payment form → End Session + Collect

**On submit:**
1. Update `sessions/{id}` — `status:'ended'`, `endedAt: serverTimestamp()`, `amountCharged`, `amountPaid`
2. Update `stations/{id}` — `status:'available'`, `currentSessionId: null`
3. Write `transactions/{newId}` (postpaid only — first payment collected here)
4. Write `station_logs` — `session-end`

---

`ExtendTimeDialog.jsx` removed and logic moved to unified `StartSessionDialog.jsx`.

---

#### Step 7 — Node.js Windows Service (Agent)

**New repo:** `kunek-agent` (separate from React app)

**Install path:** `C:\ProgramData\KunekAgent\` (CCBoot-persistent)

**`config.json`** (written at provisioning):
```json
{ "stationId": "PC-01", "firebaseCustomToken": "...", "firestoreProjectId": "kunek-prod", "videoBackgroundPath": "C:\\ProgramData\\KunekAgent\\bg.mp4" }
```

**Core service logic:**
1. Read config.json → init SQLite → auth Firebase custom token
2. Subscribe to `stations/{stationId}` via `onSnapshot`
3. Start heartbeat (60s → write `agentLastPing` + `isOnline: true`)
4. Spawn Electron window + watchdog; spawn C# keyboard helper + watchdog

**`onSnapshot` handler:** `isLocked` → false = send IPC `UNLOCK`; `currentSessionId` → new = cache to SQLite, send IPC `SESSION_UPDATE`

**Session countdown (prepaid):**
- Every 60s: `minutesUsed++` → write Firestore + SQLite
- Every 1s: compute `secondsRemaining` → send IPC `TIMER_TICK` (no Firestore reads)
- At T=0: IPC `SESSION_EXPIRED` → update station status → lock screen re-engages

**Tamper detection:**
```
on Electron exit:
  log tamper-window-killed → kills.push(Date.now())
  kills = kills.filter(t < TAMPER_WINDOW_MS)   // 2 min
  if kills.length >= TAMPER_THRESHOLD (3):      // threshold
    write station_logs: tamper-multiple-kills
    update station: tamperAlert = true
  relaunch Electron ~1s
```

**SQLite schema:**
```sql
CREATE TABLE session_state (id TEXT PRIMARY KEY, station_id TEXT, status TEXT, started_at INTEGER, minutes_allotted INTEGER, minutes_used INTEGER, rate_per_minute REAL, synced_at INTEGER);
CREATE TABLE tamper_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT, timestamp INTEGER, metadata TEXT);
```

---

#### Step 8 — C# Keyboard Helper

- **Low-level keyboard hook** (`SetWindowsHookEx WH_KEYBOARD_LL`)
- During **Mode A (locked):** swallow Alt+F4, Alt+Tab, Win key, Win+D, Win+R
- During **Mode B (active):** hook inactive
- Named pipe IPC: listens for `LOCK`/`UNLOCK` from Node.js service
- **Credential Provider** (Ctrl+Alt+Del): deferred to Phase 1b (requires signed COM DLL)

---

#### Step 9 — Electron Lock Screen

**Window config:** `fullscreen: true`, `alwaysOnTop: true`, `frame: false`, `skipTaskbar: true`

**A1 — Idle:** looping video background + large clock + shop logo + "Press any key" hint

**A2 — Active (keypress):** blurred video + login panel slides in (Phase 1: walk-in message only; Phase 2 adds PIN login)

**IPC listener (named pipe):**
- `UNLOCK` → hide window, show floating widget
- `LOCK` → show window, hide floating widget
- `SESSION_UPDATE` → update React state
- `TIMER_TICK` → update countdown (every 1s, no Firestore reads)

---

#### Step 10 — IPC: Service ↔ Electron

Named pipe `\\.\pipe\KunekAgent`. JSON-lines protocol:
```json
{ "type": "LOCK" }
{ "type": "UNLOCK" }
{ "type": "SESSION_UPDATE", "session": { ...sessionData } }
{ "type": "TIMER_TICK", "secondsRemaining": 3542, "minutesUsed": 18 }
{ "type": "WARNING", "minutesRemaining": 15 }
{ "type": "SESSION_EXPIRED" }
```

---

#### Step 11 — Floating Session Widget

Electron child `BrowserWindow`: 280×90px, `alwaysOnTop: true`, `frame: false`, `transparent: true`, `focusable: false`, bottom-right corner.
- Opacity: 30% idle → 100% on hover
- Prepaid: countdown timer (large) + credits remaining (small), color green → yellow (≤15m) → red (≤5m)
- Postpaid: elapsed + running cost
- Notifications: toast at 15/10 min; dismissal dialog at 5/1 min; full-screen flash at 1 min

---

#### Step 12 — E2E Prepaid Flow Test

1. Admin creates Zone → Rate → Station (provision token)
2. Install agent, configure config.json
3. Station appears on PC Map as available (green)
4. Cashier: Start Session → walk-in → rate → 60 min → cash
5. Station → blue, "Walk-in · 59m left"
6. Agent: `onSnapshot` → IPC `UNLOCK` → desktop accessible, widget appears
7. Widget counts down; warnings at 15/5/1 min
8. At 0: agent sends `SESSION_EXPIRED` → lock re-engages → station → available

---

#### Step 13 — E2E Postpaid Flow Test

1. Start Session → postpaid → soft limit 120 min → no upfront payment
2. Widget shows elapsed + running cost; `minutesUsed` updated every 60s via heartbeat
3. At soft limit: operator console alert on station card
4. Cashier: End Session → bill shown → collect payment → station → available

---

#### Step 14 — Offline Resilience

| Scenario | Behavior |
|---|---|
| Internet drops (active prepaid) | Countdown continues from SQLite. Lock at T=0. On reconnect: reconcile (take higher minutesUsed). |
| Machine reboot mid-session | On boot: read SQLite → reconnect Firestore → compare, take higher. Continue or lock if T=0 passed. |
| No session, internet drops | Station stays locked. New sessions require cashier online. |
| `MAX_OFFLINE_MINUTES` exceeded | Auto-lock even if time remaining (configurable, default 10 min). |

---

#### Phase 1 Milestones

| # | Milestone | Depends on |
|---|---|---|
| M1 | Firestore schema + rules | — |
| M2 | Admin CRUD (Zones, Rates, Packages, Stations) | M1 |
| M3 | PC Map dashboard (read-only, live) | M1 |
| M4 | Start/End/Extend session dialogs | M2, M3 |
| M5 | Node.js service: Firestore + SQLite + heartbeat | M1 |
| M6 | Electron lock screen (A1+A2, no session logic) | — |
| M7 | IPC service ↔ Electron | M5, M6 |
| M8 | Floating widget + countdown | M7 |
| M9 | C# keyboard helper (LLKH only) | — |
| M10 | E2E prepaid flow | M4, M8, M9 |
| M11 | E2E postpaid flow | M4, M8 |
| M12 | Offline resilience + reconciliation | M5, M10 |

**Parallel tracks:** M2+M3 (web, no agent needed) · M5+M6+M9 (agent, independent). Join at M7.

#### Phase 1b — Deferred Items

- Credential Provider (Ctrl+Alt+Del block) — requires signed COM DLL
- Member self-login at station — Phase 2
- Process blacklist (block cmd, regedit) — optional hardening
- Cloud Function for billing calculation — add before Phase 2 wallet
- Taskbar hiding via `SHAppBarMessage` — stub with always-on-top Electron for now

---

### Phase 2 — Members + Wallet + Packages
**Goal**: Members can log in at the station, use their wallet balance, buy and consume packages.

- [ ] Member self-login on agent lock screen (email/PIN)
- [ ] Wallet top-up at POS (cashier adds ₱ or minutes to customer wallet)
- [ ] Package purchase at POS, stored to customer wallet
- [ ] Agent shows wallet balance and active package on session screen
- [ ] Session deducts from package first, then wallet, then goes postpaid
- [ ] Member session history (web portal, eventually)
- [ ] Loyalty points accumulation (1 point per 10 min or per peso)

---

### Phase 3 — Game Launcher
**Goal**: Replace the plain lock screen with a full game launcher. Members see their library, can browse and launch games.

- [ ] Game catalog managed in admin (game name, exe path, cover art, genre, tags)
- [ ] Agent displays game grid on lock screen (browse without logging in is OK)
- [ ] On session start, game grid becomes interactive — click to launch
- [ ] Running game tracked (write to station doc)
- [ ] Admin console shows "Game Running" per station
- [ ] Per-game launch logging (analytics: what games are most played)
- [ ] Remote game push (admin marks game as "installed on all stations" — agent checks and alerts if exe missing)
- [ ] Optional: Steam/Epic integration via web API for cover art and metadata auto-fill

---

### Phase 4 — Advanced Operations
**Goal**: Reservations, remote management, kiosk self-service, advanced reporting.

- [ ] Reservation system — book a station for a future time slot
- [ ] Waitlist — assign customer to next available station in a zone
- [ ] Remote station control — admin can restart, lock, message stations (with staff permission framework)
- [ ] Broadcast message to all/selected stations (displayed as overlay on client)
- [ ] Discount approval workflow — cashier requests discount, manager approves remotely
- [ ] Kiosk mode — self-service top-up and login without cashier
- [ ] Advanced reporting:
  - Revenue by station, zone, time slot
  - Peak hours heatmap (which hours are busiest — visual grid)
  - Per-game playtime analytics (which games drive the most traffic)
  - Member retention, session frequency, average session length
  - Package redemption vs. pay-as-you-go split
- [ ] Staff performance (sessions opened per cashier, discounts given per cashier)
- [ ] Idle station alerts (station unlocked but no input for X minutes)
- [ ] Tournament management (schedule in-cafe tournaments, display brackets on client screens)

---

### Phase 5 — Ecosystem & Integrations
**Goal**: Multi-location, mobile monitoring, external integrations.

- [ ] Multi-location support (zones across branches)
- [ ] Mobile operator app (React Native or PWA) — monitor sessions remotely
- [ ] GCash/PayMaya QR self-top-up
- [ ] Discord integration — notify members when their booked station is ready
- [ ] CCBoot-compatible diskless agent (optional — for shops that want diskless PCs)
- [ ] API for third-party integrations (tournament platforms, etc.)

---

## Security Architecture

### Station Security
- Node.js service runs as **SYSTEM** — standard user has no permission to stop it
- C# keyboard helper + watchdog relaunches lock screen if killed
- Task Manager is **not disabled** — users need it to close frozen apps. Instead: tamper detection + reporting (see Anti-Fraud below)
- Credential Provider (C# DLL) replaces Ctrl+Alt+Del screen during locked mode
- Taskbar hidden during locked mode via `SHAppBarMessage`
- Station can be whitelisted: cashier/admin PCs skip agent installation entirely
- All session events are **append-only** in `station_logs` — Firestore rules deny deletes

### Authentication
- **Members**: Firebase Auth (email + PIN, or phone OTP)
- **Agent identity**: Each station gets a unique Firebase custom token generated at provisioning time, stored locally. Token has minimal permissions (read own station, write heartbeats only).
- **Admin/Staff**: Existing Firebase Auth + role system

### Data Integrity
- Session billing is calculated server-side (Cloud Function or trusted operator console) — not on the agent
- Agent is a **display + enforcement** layer only; it cannot grant itself time
- Firestore Security Rules enforce that only authenticated staff can start/modify sessions
- All financial transactions are double-written: session doc + transactions collection (existing Kunek pattern)

### Anti-Fraud
- Session elapsed time reconciliation: server compares `startedAt` + `minutesUsed` on every heartbeat; if agent reports less time than elapsed wall-clock → correct upward (agent can never under-report time)
- Clock drift: agent always uses `startedAt` (Firestore server timestamp) as origin — never local system clock for billing math
- Pause abuse prevention: pauses require cashier confirmation (configurable per shop)
- Offline limit: configurable max offline duration before auto-lock (e.g., 5 minutes offline = lock station)
- Process blacklist: agent can optionally block regedit, cmd, PowerShell during sessions (configurable per shop — Task Manager stays open)
- Keyboard hook: intercept Ctrl+Alt+Del, Win key, Alt+F4 at low level (Windows credential provider or LLKH)
- Discount audit: every discount logged with staffId + reason; manager-approval threshold configurable

---

## Integration with Existing Kunek Architecture

### POS Integration
- "Start PC Session" becomes a POS action — existing checkout flow handles payment
- Session payment creates a `transaction` record in existing transactions collection (type: `pc-session`)
- Walk-in sessions link to walk-in customer; member sessions link to `customerId`
- Shift reporting already captures all transactions — PC revenue included automatically

### Customer/CRM Integration
- PC sessions link to existing `customers` collection (Phase 4 CRM work)
- `outstandingBalance` on customer used for postpaid sessions
- Session history visible on customer profile

### Reporting Integration
- PC sessions appear in existing shift summaries
- Existing reporting module extended with PC-specific views
- No separate billing system — one ledger

---

## Key Decisions / Design Choices

| Decision | Choice | Reason |
|---|---|---|
| Wallet unit | **Credits** (₱-equivalent) | Matches Pondo's familiar model; operators already understand it |
| Client time display | **Time remaining as primary** (credits as secondary) | Pondo only shows elapsed time — users can't answer "how long do I have?". We fix this. |
| Session truth source | **Firestore** + agent local fallback | Firestore is authoritative; local is for offline only |
| Agent runtime | **Electron** (Phase 1–2) → **Tauri** (Phase 3+) | Electron for fast dev; Tauri for game launcher (lower RAM, older PC support) |
| Lock screen idle state | **Video background + clock** | Looks professional, acts as signage. Any keypress activates login panel. |
| Tamper approach | **Detect + report** (not block) | Task Manager stays available for users to close frozen apps. Repeated kills trigger operator alerts. |
| CCBoot compatibility | **All persistent data in `C:\ProgramData\KunekAgent\`** | CCBoot excludes this path from write-back cache discard. Agent survives reboots. |
| Billing calculation | **Server-side (trusted client = operator console)** | Agent never calculates its own bill |
| Pause policy | Configurable (allowed / cashier-only / disabled) | Different shop policies |
| Postpaid risk | Soft limit + alert | Open sessions are feature, not bug — just need guardrails |

---

## What We Need That We Don't Have Yet

1. **Client agent codebase** — new repo, Electron app
2. **Cloud Functions** — for billing reconciliation, session end, wallet deduction (atomic operations)
3. **`stations`, `zones`, `rates`, `packages`, `sessions`, `station_logs`** Firestore collections
4. **Firestore Security Rules** update to support agent service accounts
5. **Admin module** in Kunek for PC management (Stations, Zones, Rates, Packages)
6. **PC Map view** in operator console (new dashboard panel)
7. **Wallet/top-up flow** in POS (Phase 2)

---

## Build Order (Critical Path)

```
Phase 1 — Core Timer
1.  Firestore schema + security rules (stations, sessions, rates, station_logs)
2.  Admin: Stations CRUD, Zones CRUD, Rates CRUD, Packages CRUD
3.  PC Map dashboard (operator console — station grid, status cards)
4.  Start Session dialog in operator console (walk-in + member, prepaid + postpaid)
5.  End Session flow (calculates bill, records transaction)
6.  Extend Time / manual adjustments from operator console
7.  Node.js Windows Service scaffolding (installs as SYSTEM, Firestore listener, SQLite)
8.  C# keyboard helper (LLKH for Alt+Tab/Win/Alt+F4 + Credential Provider for Ctrl+Alt+Del)
9.  Electron lock screen — basic full-screen window, always-on-top, taskbar hidden
10. IPC between service and Electron window
11. Floating session widget (countdown, warnings, semi-transparent overlay)
12. E2E prepaid flow: cashier starts → station unlocks → countdown → auto-locks
13. E2E postpaid flow: cashier starts → session open → cashier ends → bill calculated
14. Offline resilience: SQLite fallback, reconcile on reconnect

Phase 2 — Members + Wallet (Status: ✅ Done)
15. ✅ Wallet top-up flow in POS (cashier adds credits to customer account)
16. ✅ Package purchase at POS counter (stored as minutesRemaining on customer)
17. ✅ Member self-login on agent lock screen (Username/Password)
18. ✅ Security: Mandatory password change on first login
19. ✅ Session Persistence: Save unused time to balance / Resume from balance
20. ✅ Atomic balance updates via Firestore `increment()`
21. ✅ Unified Billing UI: Standalone Top-up integrated into `StartSessionDialog`
22. ✅ Integrated CRM: Create customers directly from Command Center
23. ✅ Floating widget shows time derived from remaining account minutes
24. 🔲 Loyalty points accumulation (Phase 2b)
25. 🔲 Member session history in web portal (Phase 2b)

Phase 3 — Game Launcher (Migrate Electron → Tauri)
20. Game catalog admin (name, exe path, cover art, genre)
21. Tauri shell replaces Electron (same React UI, lighter footprint)
22. Lock screen becomes game launcher — browsable game grid
23. Game launch on session start
24. Running game tracking (station doc → operator console shows "game running")
25. Per-game playtime analytics

Phase 4+ — See phase plan above
```

---

*Created: 2026-03-10*
*Status: Planning*
