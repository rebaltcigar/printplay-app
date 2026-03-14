'use strict';

/**
 * Tamper detection — tracks Electron window kills in a rolling time window.
 * At TAMPER_THRESHOLD kills within TAMPER_WINDOW_MS, escalates to an alert
 * and sets station.tamperAlert = true in Firestore.
 */

const { doc, updateDoc, addDoc, collection, serverTimestamp } = require('firebase/firestore');
const { getDB } = require('./firebase');
const { getConfig } = require('./config');
const { logTamper } = require('./sqlite');
const logger = require('./logger');

const TAMPER_WINDOW_MS  = 2 * 60 * 1000; // 2 minutes rolling window
const TAMPER_THRESHOLD  = 3;              // kills within the window to escalate

const killTimestamps = [];

async function recordWindowKill() {
  const now = Date.now();
  const { stationId } = getConfig();

  killTimestamps.push(now);

  // Prune entries outside the rolling window
  const cutoff = now - TAMPER_WINDOW_MS;
  while (killTimestamps.length > 0 && killTimestamps[0] < cutoff) {
    killTimestamps.shift();
  }

  const killCount = killTimestamps.length;
  logTamper('tamper-window-killed', { killCount });

  logger.warn(`Electron window killed (${killCount} in ${TAMPER_WINDOW_MS / 1000}s window)`);

  try {
    const db = getDB();

    await addDoc(collection(db, 'station_logs'), {
      stationId,
      sessionId: null,
      event: 'tamper-window-killed',
      metadata: { killCount, windowInMs: TAMPER_WINDOW_MS },
      timestamp: serverTimestamp(),
      staffId: null,
      severity: killCount >= TAMPER_THRESHOLD ? 'alert' : 'warning',
    });

    if (killCount >= TAMPER_THRESHOLD) {
      logger.warn(`Tamper threshold reached (${killCount} kills). Setting tamperAlert on station.`);

      await addDoc(collection(db, 'station_logs'), {
        stationId,
        sessionId: null,
        event: 'tamper-multiple-kills',
        metadata: { killCount, windowInMs: TAMPER_WINDOW_MS, threshold: TAMPER_THRESHOLD },
        timestamp: serverTimestamp(),
        staffId: null,
        severity: 'alert',
      });

      await updateDoc(doc(db, 'stations', stationId), {
        tamperAlert: true,
      });
    }
  } catch (err) {
    // Tamper detection must not crash the service even if Firestore is offline
    logger.error(`Tamper Firestore write failed (offline?): ${err.message}`);
  }
}

module.exports = { recordWindowKill };
