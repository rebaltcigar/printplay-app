'use strict';

/**
 * service/sqlite.js — Local state persistence (no native dependencies).
 *
 * Replaces better-sqlite3 with a simple JSON file so the agent works on any
 * Node version without requiring Python / build tools.
 *
 * State file: C:\ProgramData\KunekAgent\state.json
 *
 * Schema mirrors the original SQLite tables:
 *   session_state  — single active session (reboot recovery)
 *   tamper_events  — rolling log of window-kill events (last 200)
 */

const fs   = require('fs');
const path = require('path');

const DB_DIR     = 'C:\\ProgramData\\KunekAgent';
const STATE_PATH = path.join(DB_DIR, 'state.json');

let _state = null;

function _load() {
  if (_state) return;
  if (fs.existsSync(STATE_PATH)) {
    try { _state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')); }
    catch { _state = {}; }
  } else {
    _state = {};
  }
  if (!_state.session_state)  _state.session_state  = null;
  if (!_state.tamper_events)  _state.tamper_events  = [];
}

function _save() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(_state, null, 2));
}

// ─── Public API (matches better-sqlite3 wrapper contract) ────────────────────

function initDB() {
  _load();
  _save();  // ensure file + dir exist on first run
}

/**
 * @param {{ id, stationId, status, startedAt, minutesAllotted, minutesUsed, ratePerMinute, openEnded, syncedAt }} session
 */
function upsertSession(session) {
  _load();
  _state.session_state = {
    id:               session.id,
    station_id:       session.stationId,
    status:           session.status,
    started_at:       session.startedAt,
    minutes_allotted: session.minutesAllotted,
    minutes_used:     session.minutesUsed,
    rate_per_minute:  session.ratePerMinute,
    open_ended:       session.openEnded,
    synced_at:        session.syncedAt,
  };
  _save();
}

function getActiveSession(stationId) {
  _load();
  const s = _state.session_state;
  if (s && s.station_id === stationId && s.status === 'active') return s;
  return null;
}

function markSessionEnded(sessionId) {
  _load();
  if (_state.session_state?.id === sessionId) {
    _state.session_state.status = 'ended';
    _save();
  }
}

function logTamper(eventType, metadata = null) {
  _load();
  _state.tamper_events.push({
    event_type: eventType,
    timestamp:  Date.now(),
    metadata:   metadata ? JSON.stringify(metadata) : null,
  });
  // Keep the rolling window small
  if (_state.tamper_events.length > 200) {
    _state.tamper_events = _state.tamper_events.slice(-200);
  }
  _save();
}

module.exports = { initDB, upsertSession, getActiveSession, markSessionEnded, logTamper };
