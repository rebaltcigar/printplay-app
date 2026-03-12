import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccountPath = './firebase-service-account-prod.json';
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function test() {
  try {
    const snap = await db.collection('settings').limit(1).get();
    console.log('Successfully read Firestore:', snap.docs.length);
  } catch (error) {
    console.error('Error reading Firestore:', error);
  }
}

test();
