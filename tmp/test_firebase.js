import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccountPath = './firebase-service-account-prod.json';
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function test() {
  try {
    const listUsersResult = await admin.auth().listUsers(1);
    console.log('Successfully listed users:', listUsersResult.users.length);
  } catch (error) {
    console.error('Error listing users:', error);
  }
}

test();
