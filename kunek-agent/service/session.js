'use strict';

/**
 * service/session.js — Session state machine.
 *
 * Responsibilities:
 *  - bootRecovery()          — resume session from SQLite after a reboot
 *  - handleStationSnapshot() — react to Firestore station doc changes
 *  - Countdown timer with per-second IPC TIMER_TICK messages
 *  - Warning IPC at 15 / 10 / 5 / 1 minutes remaining
 *  - Per-minute writes of minutesUsed → SQLite (always) + Firestore (best-effort)
 *  - Auto-lock at T=0 or after MAX_OFFLINE_MINUTES without Firestore sync
 *  - Session extension via Firestore session doc listener
 */

const {
  setupStationListener,
  listenToSession,
  getSession,
  updateSessionMinutes,
  endSessionOnSupabase,
} = require('./supabaseService');
const {
  getActiveSession,
  upsertSession,
  markSessionEnded,
} = require('./sqlite');
const { sendMessage, messageTypes } = require('./ipc');
const { getConfig } = require('./config');
const logger = require('./logger');

// ─── Constants ────────────────────────────────────────────────────────────────

const WARNING_MINUTES = [15, 10, 5, 1];  // descending warn thresholds
const MINUTE_SYNC_MS = 60 * 1000;        // sync interval
const MAX_OFFLINE_MINUTES = 10;               // auto-lock if offline this long

// ─── Module-level state ───────────────────────────────────────────────────────

let _session = null;   // { id, stationId, minutesAllotted, minutesUsed, ... }
let _secondsRemaining = 0;
let _tickInterval = null;
let _syncInterval = null;
let _warnedAt = new Set();
let _offlineMinutes = 0;
let _sessionUnsub = null;   // unsubscribe fn for per-session Firestore listener

// ─── Boot recovery ────────────────────────────────────────────────────────────

async function bootRecovery() {
  const { stationId } = getConfig();
  const row = getActiveSession(stationId);

  if (!row) {
    logger.info('Boot recovery: no active session in SQLite');
    return;
  }

  const minutesUsed = row.minutes_used || 0;
  const minutesAllotted = row.minutes_allotted || 0;
  const secondsRemaining = Math.max(0, (minutesAllotted - minutesUsed) * 60);

  if (secondsRemaining <= 0) {
    logger.info(`Boot recovery: session ${row.id} already expired — clearing`);
    markSessionEnded(row.id);
    return;
  }

  logger.info(
    `Reboot recovery: resuming session ${row.id} from SQLite ` +
    `(${minutesUsed}/${minutesAllotted} min used)`,
  );

  const session = {
    id: row.id,
    stationId: row.station_id,
    minutesAllotted: minutesAllotted,
    minutesUsed: minutesUsed,
    ratePerMinute: row.rate_per_minute || 0,
    openEnded: row.open_ended === 1,
    customerName: null,
    startedAt: row.started_at,
  };

  _resumeSession(session, secondsRemaining, false); // false = do not start countdown yet

  sendMessage(messageTypes.SESSION_UPDATE, { session: _session });
  logger.info(`Session state recovered (id=${row.id}) — waiting for Firestore sync to verify status before unlock`);

  // Reconcile with Supabase
  try {
    const snap = await getSession(row.id);
    if (!snap.exists()) {
      logger.warn(`Recovery: session ${row.id} not found in Supabase — clearing local state`);
      _clearSession();
      return;
    }
    const remote = snap.data();
    if (remote.status !== 'active') {
      logger.info(`Recovery: session ${row.id} is ${remote.status} on Supabase — clearing local state`);
      _clearSession();
      return;
    }
    if ((remote.minutes_used || 0) > _session.minutesUsed) {
      const diff = remote.minutes_used - _session.minutesUsed;
      _session.minutesUsed = remote.minutes_used;
      _secondsRemaining = Math.max(0, _secondsRemaining - diff * 60);
      logger.info(`Reconciliation: remote minutes_used higher — adjusted to ${_secondsRemaining}s remaining`);
    }
  } catch (err) {
    logger.warn(`Boot reconciliation failed (offline?): ${err.message}`);
  }
}

// ─── Station Firestore listener callback ──────────────────────────────────────

async function handleStationSnapshot(snap) {
  if (!snap.exists()) return;

  const data = snap.data();
  const { stationId } = getConfig();

  // ── Session/Lock State ──────────────────────────────────────────────────

  const isUnlockTarget = data.status === 'in-use' && !data.is_locked && !!data.current_session_id;

  if (isUnlockTarget) {
    const sessionId = data.current_session_id;
    if (!_session || _session.id !== sessionId) {
      logger.info(`Station snapshot: UNLOCK TARGET (station: in-use, session: ${sessionId}, is_locked: false)`);
      await _loadAndStartSession(sessionId, stationId);
    } else {
      // Already tracking locally (e.g. from recovery or already in-progress)
      // If we were in recovery, we need to ensure timers start and we UNLOCK
      if (!_tickInterval) {
        logger.info(`Station snapshot: confirmed ACTIVE — resuming local timers and unlocking`);
        _resumeSession(_session, _secondsRemaining, true);
        sendMessage(messageTypes.UNLOCK, {});
      }
    }
  } else {
    // LOCK TARGET: available, manually locked, OR status in-use but is_locked=true (expired prepaid)
    if (_session) {
      logger.info(`Station snapshot: LOCK TARGET (status: ${data.status}, is_locked: ${data.is_locked}, session: ${data.current_session_id}) — clearing local session`);
      _clearSession();
      sendMessage(messageTypes.SESSION_EXPIRED, {});
    }
    sendMessage(messageTypes.LOCK, {});
  }

  // ── Power Management ──────────────────────────────────────────────────
  if (data.command) {
    const { type, timestamp } = data.command;
    const cmdTime = new Date(timestamp).getTime() || 0;
    const now = Date.now();

    // Only execute if command is fresh (within last 30 seconds)
    if (now - cmdTime < 30000) {
      if (type === 'restart') {
        logger.info('Power Management: Restarting system...');
        require('child_process').exec('shutdown /r /t 0 /f');
      } else if (type === 'shutdown') {
        logger.info('Power Management: Shutting down system...');
        require('child_process').exec('shutdown /s /t 0 /f');
      } else if (type === 'lock') {
        logger.info('Remote Control: Locking station...');
        sendMessage(messageTypes.LOCK, {});
      } else if (type === 'unlock') {
        logger.info('Remote Control: Unlocking station...');
        sendMessage(messageTypes.UNLOCK, {});
      } else if (type === 'message') {
        logger.info(`Remote Control: Sending message: ${data.command.text}`);
        sendMessage(messageTypes.MESSAGE, { text: data.command.text });
      }

      // Clear the command after execution to avoid loops
      try {
        const { getSupabase } = require('./supabase');
        await getSupabase().from('stations').update({ command: null }).eq('id', stationId);
      } catch (err) {
        logger.error(`Failed to clear command: ${err.message}`);
      }
    }
  }
}

// ─── Load a session from Firestore and start the countdown ───────────────────

async function _loadAndStartSession(sessionId, stationId) {
  try {
    const snap = await getSession(sessionId);
    if (!snap.exists()) {
      logger.error(`Session ${sessionId} not found in Firestore`);
      return;
    }

    const data = snap.data();

    const session = {
      id: sessionId,
      stationId,
      minutesAllotted: data.minutes_allotted ?? null,
      minutesUsed: data.minutes_used ?? 0,
      ratePerMinute: data.rate_per_minute ?? 0,
      openEnded: data.open_ended ?? false,
      customerName: data.customer_name ?? null,
      startedAt: new Date(data.started_at).getTime() ?? Date.now(),
    };

    const secondsRemaining = session.openEnded
      ? null
      : Math.max(0, (session.minutesAllotted - session.minutesUsed) * 60);

    // Persist to SQLite
    upsertSession({
      id: session.id,
      stationId: session.stationId,
      status: 'active',
      startedAt: session.startedAt,
      minutesAllotted: session.minutesAllotted,
      minutesUsed: session.minutesUsed,
      ratePerMinute: session.ratePerMinute,
      openEnded: session.openEnded ? 1 : 0,
      syncedAt: Date.now(),
    });

    // Subscribe to session doc for time extensions
    if (_sessionUnsub) _sessionUnsub();
    _sessionUnsub = listenToSession(sessionId, _handleSessionSnapshot);

    _resumeSession(session, secondsRemaining);

    sendMessage(messageTypes.UNLOCK, {});
    sendMessage(messageTypes.SESSION_UPDATE, { session: _session });
    logger.info(`IPC UNLOCK sent — session ${sessionId} started`);

  } catch (err) {
    logger.error(`Failed to load session ${sessionId}: ${err.message}`);
  }
}

// ─── Session doc listener (handles extension) ────────────────────────────────

/**
 * Handle updates from the session document (e.g. extension from Admin dashboard)
 */
function _handleSessionSnapshot(snap) {
  if (!snap.exists() || !_session) return;

  const data = snap.data();

  // CRITICAL: Check session status first
  if (data.status === 'ended' || data.status === 'cancelled' || data.status === 'expired') {
    logger.info(`Session snapshot: session status is ${data.status} — clearing local session`);
    _expireSession('remote-ended');
    return;
  }

  const newAllotted = data.minutes_allotted;
  const remoteUsed = data.minutes_used || 0;

  // Use the larger of local vs remote used to ensure we don't jump backwards
  const effectiveUsed = Math.max(_session.minutesUsed, remoteUsed);

  const isAllottedChanged = newAllotted != null && newAllotted !== _session.minutesAllotted;
  const isUsedSync = remoteUsed > _session.minutesUsed;

  if (isAllottedChanged || isUsedSync) {
    const oldSeconds = _secondsRemaining;

    _session.minutesAllotted = newAllotted ?? _session.minutesAllotted;
    _session.minutesUsed = effectiveUsed;

    // Recalculate remaining seconds
    if (_session.openEnded) {
      // Postpaid: elapsed is driven by Date.now() - startedAt, no sync needed for display
    } else {
      _secondsRemaining = Math.max(0, (_session.minutesAllotted - _session.minutesUsed) * 60);

      logger.info(
        `Session updated: allotted=${_session.minutesAllotted}m, used=${_session.minutesUsed}m ` +
        `(${Math.floor(_secondsRemaining / 60)}m remaining)`
      );

      // Re-unlock if it was expired but now has time
      if (oldSeconds <= 0 && _secondsRemaining > 0) {
        logger.info('Session resumed/extended (was expired/locked)');
        _resumeSession(_session, _secondsRemaining);
        sendMessage(messageTypes.UNLOCK, {});
      }
    }

    // Re-enable warnings
    if (!_session.openEnded) {
      const minRemaining = Math.floor(_secondsRemaining / 60);
      WARNING_MINUTES.forEach((t) => {
        if (minRemaining > t) _warnedAt.delete(t);
      });
    }

    sendMessage(messageTypes.SESSION_UPDATE, { session: _session });
  }
}

// ─── Internal session lifecycle ───────────────────────────────────────────────

function _resumeSession(session, secondsRemaining, startTimers = true) {
  _clearTimers();

  _session = session;
  _secondsRemaining = secondsRemaining ?? 0;
  _warnedAt = new Set();
  _offlineMinutes = 0;

  if (startTimers) {
    _startCountdown();
    _startMinuteSync();
  }
}

function _startCountdown() {
  _tickInterval = setInterval(_tick, 1000);
}

function _tick() {
  if (_session.openEnded) {
    // Postpaid: calculate elapsed and cost
    const elapsed = Math.floor((Date.now() - _session.startedAt) / 1000);
    const cost = (elapsed / 60) * _session.ratePerMinute;
    sendMessage(messageTypes.TIMER_TICK, { elapsedSeconds: elapsed, runningCost: cost });
    return;
  }

  _secondsRemaining = Math.max(0, _secondsRemaining - 1);

  sendMessage(messageTypes.TIMER_TICK, { secondsRemaining: _secondsRemaining });

  // Warnings
  const minRemaining = Math.floor(_secondsRemaining / 60);
  for (const threshold of WARNING_MINUTES) {
    if (minRemaining === threshold && !_warnedAt.has(threshold)) {
      _warnedAt.add(threshold);
      sendMessage(messageTypes.WARNING, { minutesRemaining: threshold });
      logger.info(`IPC WARNING sent: ${threshold} min remaining`);
    }
  }

  if (_secondsRemaining <= 0) {
    _expireSession('time-expired');
  }
}

function _startMinuteSync() {
  _syncInterval = setInterval(_syncMinute, MINUTE_SYNC_MS);
}

async function _syncMinute() {
  if (!_session) return;

  const minutesUsed = _session.openEnded
    ? Math.floor((Date.now() - _session.startedAt) / 60_000)
    : Math.ceil((_session.minutesAllotted * 60 - _secondsRemaining) / 60);

  _session.minutesUsed = minutesUsed;

  // Always write to SQLite (works offline)
  upsertSession({
    id: _session.id,
    stationId: _session.stationId,
    status: 'active',
    startedAt: _session.startedAt,
    minutesAllotted: _session.minutesAllotted,
    minutesUsed,
    ratePerMinute: _session.ratePerMinute,
    openEnded: _session.openEnded ? 1 : 0,
    syncedAt: Date.now(),
  });

  // Best-effort Firestore write
  try {
    await updateSessionMinutes(_session.id, minutesUsed);
    _offlineMinutes = 0;
    logger.debug(`Minute sync: ${minutesUsed}m used`);
  } catch (err) {
    _offlineMinutes++;
    logger.warn(
      `Minute write failed (offline ${_offlineMinutes}m): ${err.message} — SQLite is up-to-date`,
    );

    if (!_session.openEnded && _offlineMinutes >= MAX_OFFLINE_MINUTES) {
      logger.warn(`MAX_OFFLINE_MINUTES exceeded — auto-locking`);
      _expireSession('offline-timeout');
    }
  }
}

async function _expireSession(reason = 'time-expired') {
  if (!_session) return;

  const { id, stationId } = _session;
  logger.info(`Session ${id} expired — locking station (reason: ${reason})`);

  // Final sync to ensure minutesUsed is accurate in Firestore/SQLite before clearing
  await _syncMinute();

  _clearSession();

  markSessionEnded(id);

  sendMessage(messageTypes.SESSION_EXPIRED, {});
  sendMessage(messageTypes.LOCK, {});
  logger.info('IPC SESSION_EXPIRED + LOCK sent (local/remote expiry)');

  try {
    await endSessionOnSupabase(id, stationId, reason);
    logger.info(`Supabase updated: session ${id} ended (reason: ${reason})`);
  } catch (err) {
    logger.error(`Supabase end-session write failed (sessionId=${id}, stationId=${stationId}): ${err.message}`);
  }

  // Note: we still have _session and its listener until handleStationSnapshot 
  // sees a new session ID or the station explicitly locks/clears.
}

// ─── Cleanup helpers ──────────────────────────────────────────────────────────

function _clearTimers() {
  if (_tickInterval) { clearInterval(_tickInterval); _tickInterval = null; }
  if (_syncInterval) { clearInterval(_syncInterval); _syncInterval = null; }
}

function _clearSession() {
  _clearTimers();
  if (_sessionUnsub) { _sessionUnsub(); _sessionUnsub = null; }
  _session = null;
  _secondsRemaining = 0;
  _warnedAt = new Set();
}

module.exports = { bootRecovery, handleStationSnapshot };
