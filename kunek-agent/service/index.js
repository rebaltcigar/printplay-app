'use strict';

/**
 * service/index.js — KunekAgent main entry point.
 *
 * Boot sequence:
 *   1. Load config  (C:\ProgramData\KunekAgent\config.json)
 *   2. Init SQLite  (C:\ProgramData\KunekAgent\state.db)
 *   3. Sign in to Firebase (client SDK, email/password)
 *   4. Start IPC named-pipe server  (\\.\pipe\KunekAgent)
 *   5. Send initial LOCK to any connected Electron windows
 *   6. Check SQLite for a session that survived a reboot → resume if found
 *   7. Start Firestore station listener
 *   8. Start heartbeat (60 s)
 *   9. Start watchdog (monitors / restarts the Electron launcher)
 */

const { loadConfig }             = require('./config');
const { initDB }                 = require('./sqlite');
const { initFirebase }           = require('./firebase');
const { startIPCServer, sendMessage, messageTypes } = require('./ipc');
const { startHeartbeat }         = require('./heartbeat');
const { startWatchdog }          = require('./watchdog');
const { setupFirestoreListener } = require('./firestore');
const { bootRecovery, handleStationSnapshot } = require('./session');
const logger                     = require('./logger');

async function main() {
  logger.info('KunekAgent starting...');

  // ── 1. Config ────────────────────────────────────────────────────────────
  const config = loadConfig();
  logger.info(`Station: ${config.stationId}`);

  // ── 2. SQLite ────────────────────────────────────────────────────────────
  initDB();
  logger.info('SQLite initialized');

  // ── 3. Firebase ──────────────────────────────────────────────────────────
  await initFirebase();

  // ── 4. IPC pipe server ───────────────────────────────────────────────────
  startIPCServer();

  // ── 5. Initial LOCK (broadcasts to any already-connected Electron windows) ─
  sendMessage(messageTypes.LOCK, {});
  logger.info('IPC LOCK sent (initial state on boot)');

  // ── 6. Reboot recovery ───────────────────────────────────────────────────
  await bootRecovery();

  // ── 7. Firestore listener ────────────────────────────────────────────────
  setupFirestoreListener(config.stationId, handleStationSnapshot);
  logger.info('Firestore station listener active');

  // ── 8. Heartbeat ─────────────────────────────────────────────────────────
  startHeartbeat();

  // ── 9. Watchdog ──────────────────────────────────────────────────────────
  startWatchdog();

  logger.info('KunekAgent fully running');
}

main().catch((err) => {
  logger.error(`Fatal startup error: ${err.stack || err.message}`);
  process.exit(1);
});
