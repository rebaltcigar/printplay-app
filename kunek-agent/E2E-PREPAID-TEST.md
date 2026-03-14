# E2E Prepaid Flow — Test Checklist

Tests the full path from cashier action to station lock and auto-expiry.

---

## Prerequisites

- [ ] Zone created in admin (e.g. "Regular")
- [ ] Rate created (e.g. ₱0.50/min, no minimum, round exact)
- [ ] Station created and token generated (e.g. `PC-01`)
- [ ] `config.json` deployed to `C:\ProgramData\KunekAgent\config.json` on test machine
- [ ] `keyboard-helper.exe` built and copied to `C:\ProgramData\KunekAgent\keyboard-helper\`
- [ ] `kunek-launcher.exe` (Electron) built and copied to `C:\ProgramData\KunekAgent\launcher\`
- [ ] Windows service installed: `node scripts/install.js` (or `KUNEK_DEV=1` for dev mode)
- [ ] PC Map open in browser at `/admin/pcmap`

---

## Test A — Normal Prepaid Session (2-minute test)

### Setup

- [ ] Set session to **2 minutes** so the test completes quickly
- [ ] Station shows as **Available** (green) on PC Map

### Step 1 — Service startup

- [ ] Start service (or `node service/index.js` in dev mode)
- [ ] Log: `KunekAgent fully running`
- [ ] Log: `IPC pipe server listening at \\.\pipe\KunekAgent`
- [ ] Log: `IPC LOCK sent (initial state on boot)` — station is locked
- [ ] PC Map: station card shows **Available**, `isOnline: true`

### Step 2 — Electron lock screen

- [ ] Electron window launches (full-screen, always-on-top)
- [ ] Lock screen A1 visible: video background or dark gradient, clock, "Press any key" hint
- [ ] Pressing any key shows A2: login panel slides in
- [ ] Keyboard shortcuts blocked: Alt+F4, Alt+Tab, Win key do nothing

### Step 3 — Start session (cashier console)

- [ ] On PC Map, click **Start Session** on PC-01
- [ ] Session type: **Prepaid by Rate** — select rate, enter `2` minutes
- [ ] Payment: Cash, collect payment
- [ ] Click **Start Session**

### Step 4 — Station unlocks

- [ ] Firestore: `stations/PC-01` → `status: in-use`, `isLocked: false`, `currentSessionId` set
- [ ] PC Map card → blue, shows "Walk-in · 2m left"
- [ ] Log: `IPC UNLOCK sent`
- [ ] Electron lock screen hides
- [ ] Floating widget appears bottom-right: "2:00" countdown, green

### Step 5 — Countdown runs

- [ ] Widget counts down every second
- [ ] At 1:30 remaining: no warning yet
- [ ] SQLite `session_state` updated every 60s: `minutes_used` increments
- [ ] Firestore `sessions/{id}.minutesUsed` updated every 60s

### Step 6 — Warning thresholds (extend test to 20 min to fully test)

*(Skip if using 2-min test; use 20-min session for this sub-test)*

- [ ] 15 min remaining → IPC `WARNING { minutesRemaining: 15 }` sent → widget pulse starts
- [ ] 10 min remaining → IPC `WARNING { minutesRemaining: 10 }` sent
- [ ] 5 min remaining  → IPC `WARNING { minutesRemaining: 5 }` → widget turns red, widget.js shows persistent dialog
- [ ] 1 min remaining  → IPC `WARNING { minutesRemaining: 1 }` → persistent dialog

### Step 7 — Auto-lock at T=0

- [ ] At 2:00 elapsed: `secondsRemaining` hits 0
- [ ] Log: `Session {id} expired — locking station`
- [ ] IPC `SESSION_EXPIRED` sent → Electron lock screen re-engages
- [ ] Firestore: `sessions/{id}.status = 'ended'`, `endedAt` set
- [ ] Firestore: `stations/PC-01.status = 'available'`, `currentSessionId = null`, `isLocked = true`
- [ ] `station_logs` entry: `session-end` with `reason: time-expired`
- [ ] PC Map: card back to **Available** (green)

---

## Test B — Extend Time Mid-Session

- [ ] Start a 5-minute prepaid session (same as above)
- [ ] At 2 minutes remaining, click **Extend Time** in PC Map → add 5 minutes
- [ ] Firestore: `sessions/{id}.minutesAllotted` updated
- [ ] Log: `Time extended/adjusted: allotted=Xm → Ym remaining`
- [ ] Widget reflects new remaining time immediately
- [ ] Session auto-locks at new T=0

---

## Test C — Reboot Recovery

- [ ] Start a 10-minute prepaid session
- [ ] Let 2 minutes elapse (SQLite updated)
- [ ] Restart the service (simulates reboot)
- [ ] Log: `Reboot recovery: resuming session {id} from SQLite (2/10 min used)`
- [ ] Countdown resumes from ~8 minutes remaining (not from 10)
- [ ] When Firestore snapshot arrives: reconciliation runs, takes higher minutesUsed
- [ ] Session continues and auto-locks correctly at T=0

---

## Test D — Offline Resilience

- [ ] Start a 15-minute prepaid session
- [ ] Disconnect the machine from the network (disable NIC or unplug)
- [ ] Countdown continues in widget (running from local state)
- [ ] Log: `Minute write failed (offline Xm): ... — SQLite is up-to-date`
- [ ] After `maxOfflineMinutes` (default 10): log `MAX_OFFLINE_MINUTES exceeded — auto-locking`
  → Session expired, station locked
- [ ] Reconnect network before limit: Firestore write succeeds, `lastFirestoreSyncMs` resets
- [ ] On reconnect: `onSnapshot` fires, reconciliation runs (takes higher minutesUsed)

---

## Test E — Tamper Detection

- [ ] Active session running, open Task Manager
- [ ] End Task on `kunek-launcher.exe`
- [ ] Log: `Electron exited ... Relaunching in 1000ms`
- [ ] `station_logs` entry: `tamper-window-killed`
- [ ] PC Map: tamper alert badge on station card
- [ ] Electron relaunches within ~1s
- [ ] After 3 kills in 2 minutes: `tamper-multiple-kills` event, `station.tamperAlert = true`

---

## Pass Criteria

| Scenario | Pass condition |
|---|---|
| Normal prepaid | Auto-lock fires exactly at T=0 ±2s |
| Extend time | Widget reflects extension within 1 tick |
| Reboot recovery | Countdown resumes from SQLite minutes_used, not from 0 |
| Offline resilience | Countdown continues; auto-lock at MAX_OFFLINE_MINUTES |
| Tamper detection | Electron relaunches ≤1.5s; logs written to Firestore |
