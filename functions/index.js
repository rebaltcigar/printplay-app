const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

/**
 * generateStationToken
 *
 * Callable function (admin-only). Generates a Firebase custom token
 * for a station agent with a `stationId` claim. The token is stored
 * in the station doc and returned once to the caller for provisioning.
 *
 * Request body: { stationId: string }
 * Response:     { token: string }
 */
exports.generateStationToken = onCall(async (request) => {
  // Require authenticated admin user
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }

  const db = getFirestore();
  const callerUid = request.auth.uid;

  // Verify caller has admin role
  const userSnap = await db.collection("users").doc(callerUid).get();
  const callerRole = userSnap.exists ? userSnap.data().role : null;
  if (!["admin", "superadmin", "owner"].includes(callerRole)) {
    throw new HttpsError("permission-denied", "Admin role required.");
  }

  const { stationId } = request.data;
  if (!stationId || typeof stationId !== "string") {
    throw new HttpsError("invalid-argument", "stationId is required.");
  }

  // Verify the station exists
  const stationSnap = await db.collection("stations").doc(stationId).get();
  if (!stationSnap.exists) {
    throw new HttpsError("not-found", `Station ${stationId} not found.`);
  }

  // Create a custom token with stationId claim
  // The UID is deterministic per station so tokens can be regenerated safely
  const agentUid = `station-agent-${stationId}`;
  const additionalClaims = { stationId };

  const token = await getAuth().createCustomToken(agentUid, additionalClaims);

  // Record that a token was generated (for audit; does not store the token itself)
  await db.collection("stations").doc(stationId).update({
    provisionedAt: new Date(),
    agentUid,
  });

  return { token };
});
