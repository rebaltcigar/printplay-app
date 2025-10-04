const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.createNewUser = functions.https.onCall(async (data, context) => {
  // Check if the request is made by an authenticated user
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to create a user.",
    );
  }

  // Check if the calling user is a superadmin
  const callerUid = context.auth.uid;
  const callerDoc = await admin.firestore().collection("users").doc(callerUid).get();
  
  if (callerDoc.data().role !== "superadmin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "You must be a superadmin to create users.",
    );
  }

  const { email, password, fullName, role } = data;

  try {
    // 1. Create the user in Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: fullName,
    });

    // 2. Create the user document in Firestore
    await admin.firestore().collection("users").doc(userRecord.uid).set({
      email: email,
      fullName: fullName,
      role: role,
    });

    return { result: `Successfully created user ${email}` };
  } catch (error) {
    console.error("Error creating new user:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});