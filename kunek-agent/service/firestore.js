'use strict';

/**
 * service/firestore.js — Firestore helper functions for the agent.
 *
 * All writes are scoped to what the Firestore Security Rules allow for the
 * station's agentUid:
 *   - Read own station doc
 *   - Update sessions/{id}.minutesUsed and lastHeartbeatAt
 *   - Create station_logs documents
 *   - Update stations/{id}.status / isLocked / currentSessionId on session end
 */

const {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
} = require('firebase/firestore');

const { getDB } = require('./firebase');
const { getConfig } = require('./config');
const logger = require('./logger');

// ─── Station listener ─────────────────────────────────────────────────────────

/**
 * Listen to the station document and call `callback` on every change.
 * Returns the unsubscribe function.
 */
function setupFirestoreListener(stationId, callback) {
  return onSnapshot(
    doc(getDB(), 'stations', stationId),
    (snap) => {
      try { callback(snap); } catch (err) {
        logger.error(`Station snapshot handler error: ${err.message}`);
      }
    },
    (err) => logger.error(`Station listener error: ${err.message}`),
  );
}

// ─── Session listener ─────────────────────────────────────────────────────────

/**
 * Listen to a single session document (for extension detection).
 * Returns the unsubscribe function.
 */
function listenToSession(sessionId, callback) {
  return onSnapshot(
    doc(getDB(), 'sessions', sessionId),
    (snap) => {
      try { callback(snap); } catch (err) {
        logger.error(`Session snapshot handler error: ${err.message}`);
      }
    },
    (err) => logger.error(`Session ${sessionId} listener error: ${err.message}`),
  );
}

// ─── One-shot reads ───────────────────────────────────────────────────────────

async function getSession(sessionId) {
  return getDoc(doc(getDB(), 'sessions', sessionId));
}

// ─── Writes ───────────────────────────────────────────────────────────────────

/**
 * Write the per-minute progress update to the session document.
 */
async function updateSessionMinutes(sessionId, minutesUsed) {
  await updateDoc(doc(getDB(), 'sessions', sessionId), {
    minutesUsed,
    lastHeartbeatAt: serverTimestamp(),
  });
}

/**
 * Mark a session as ended and the station as available + locked.
 * Also writes a station_logs entry.
 */
async function endSessionOnFirestore(sessionId, stationId, reason = 'time-expired') {
  const db = getDB();
  const sessionRef = doc(db, 'sessions', sessionId);
  const stationRef = doc(db, 'stations', stationId);

  logger.debug(`Firestore endSession: session=${sessionId}, station=${stationId}, reason=${reason}`);

  try {
    // If it's just time-expired, we keep the session as 'active' (or 'ended-pending')
    // and the station as 'in-use' but 'isLocked: true' to allow for extensions.
    // If reason is 'manual' or 'cancelled', we officially end it.

    const isExpiry = reason === 'time-expired' || reason === 'offline-timeout';

    await updateDoc(sessionRef, {
      status: isExpiry ? 'active' : 'ended', // keep active so cashier can still extend
      endedAt: isExpiry ? null : serverTimestamp(),
    });

    await updateDoc(stationRef, {
      status: isExpiry ? 'in-use' : 'available',
      isLocked: true,
      currentSessionId: isExpiry ? sessionId : null,
    });

    await addDoc(collection(db, 'station_logs'), {
      stationId,
      sessionId,
      event: isExpiry ? 'session-expired' : 'session-end',
      metadata: { reason },
      timestamp: serverTimestamp(),
      staffId: null,
      severity: 'info',
    });
  } catch (err) {
    throw new Error(`Write failed (sessionId=${sessionId}, stationId=${stationId}): ${err.message}`);
  }
}

/**
 * Starts a new session for a member using their remaining balance.
 */
async function startMemberSession(stationId, member) {
  const db = getDB();
  const now = serverTimestamp();

  // 1. Create session document
  const sessionData = {
    stationId,
    customerId: member.id,
    customerName: member.fullName || member.username,
    customerType: 'member',
    type: 'prepaid',
    minutesAllotted: member.minutesRemaining,
    minutesUsed: 0,
    amountCharged: 0,
    amountPaid: 0,
    paymentMethod: 'Account Balance',
    status: 'active',
    startedAt: now,
    updatedAt: now,
  };

  const sessRef = await addDoc(collection(db, 'sessions'), sessionData);

  // 2. Update station document
  await updateDoc(doc(db, 'stations', stationId), {
    status: 'in-use',
    currentSessionId: sessRef.id,
    isLocked: false,
    updatedAt: now
  });

  // 3. Deduct balance from member
  await updateDoc(doc(db, 'customers', member.id), {
    minutesRemaining: 0, // All balance moved to session
    updatedAt: now
  });

  return sessRef.id;
}

module.exports = {
  setupFirestoreListener,
  listenToSession,
  getSession,
  updateSessionMinutes,
  endSessionOnFirestore,
  startMemberSession,
};
