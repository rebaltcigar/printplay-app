import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const isProd = process.argv.includes('--prod');
const envFile = isProd ? '.env.production' : '.env.development';
const serviceAccountPath = isProd
    ? './firebase-service-account-prod.json'
    : './firebase-service-account-dev.json';

const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(serviceAccountPath), 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function analyze() {
    const collections = await db.listCollections();
    console.log(`--- FIRESTORE COLLECTIONS (${isProd ? 'PROD' : 'DEV'}) ---`);

    for (const col of collections) {
        console.log('\n=======================================');
        console.log(`COLLECTION: ${col.id}`);
        const snapshot = await col.limit(3).get();

        // Also get total count
        const allDocs = await col.select().get();
        console.log(`Total Documents: ${allDocs.size}`);

        if (!snapshot.empty) {
            for (const doc of snapshot.docs) {
                console.log(`\nDoc ID: ${doc.id}`);
                const data = doc.data();
                const keys = Object.keys(data);
                console.log(`Fields: ${keys.join(', ')}`);

                if (data.displayId) console.log(`  -> displayId pattern: ${data.displayId}`);
                if (data.orderId) console.log(`  -> orderId: ${data.orderId}`);
                if (data.parentOrderId) console.log(`  -> parentOrderId: ${data.parentOrderId}`);
                if (data.shiftId) console.log(`  -> shiftId: ${data.shiftId}`);
                if (data.type) console.log(`  -> type: ${data.type}`);
                if (data.amount !== undefined) console.log(`  -> amount: ${data.amount}`);
                if (data.items) console.log(`  -> items array length: ${Array.isArray(data.items) ? data.items.length : 'not array'}`);

                // Find subcollections
                const subcols = await doc.ref.listCollections();
                if (subcols.length > 0) {
                    console.log(`  -> SUBCOLLECTIONS FOUND: ${subcols.map(c => c.id).join(', ')}`);
                    for (const subc of subcols) {
                        const subSnap = await subc.limit(1).get();
                        if (!subSnap.empty) {
                            console.log(`    -> Subcol ${subc.id} sample fields: ${Object.keys(subSnap.docs[0].data()).join(', ')}`);
                        }
                    }
                }
            }
        }
    }
    process.exit(0);
}
analyze().catch(console.error);
