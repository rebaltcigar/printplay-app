'use strict';

const { doc, updateDoc, serverTimestamp } = require('firebase/firestore');
const { getDB } = require('./firebase');
const { getConfig } = require('./config');
const logger = require('./logger');

const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 60 seconds

let intervalId = null;

async function writeHeartbeat() {
  try {
    const { stationId } = getConfig();
    await updateDoc(doc(getDB(), 'stations', stationId), {
      agentLastPing: serverTimestamp(),
      isOnline: true,
    });
    logger.debug('Heartbeat written');
  } catch (err) {
    // Expected to fail when offline — that's OK
    logger.warn(`Heartbeat write failed (offline?): ${err.message}`);
  }
}

function startHeartbeat() {
  writeHeartbeat(); // immediate ping on startup
  intervalId = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);
  logger.info('Heartbeat started (60s interval)');
}

function stopHeartbeat() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('Heartbeat stopped');
  }
}

module.exports = { startHeartbeat, stopHeartbeat };
