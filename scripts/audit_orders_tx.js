import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const serviceAccount = JSON.parse(fs.readFileSync(path.resolve('./firebase-service-account-dev.json'), 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
    console.log('--- AUDIT ORDERS & TRANSACTIONS ---');

    const ordSnap = await db.collection('orders').limit(5).get();
    const sampleOrderIds = [];

    console.log('SAMPLE ORDERS:');
    ordSnap.forEach(d => {
        const data = d.data();
        console.log(` - fsId: ${d.id}, displayId: ${data.displayId}, orderNumber: ${data.orderNumber}`);
        sampleOrderIds.push(d.id);
        if (data.displayId) sampleOrderIds.push(data.displayId);
    });

    console.log('\nSAMPLE TRANSACTIONS WITH orderId:');
    const txSnap = await db.collection('transactions').where('orderId', '!=', null).limit(10).get();
    txSnap.forEach(d => {
        const data = d.data();
        console.log(` - fsId: ${d.id}, orderId: ${data.orderId}, parentOrderId: ${data.parentOrderId}, type: ${data.type}`);
    });

    console.log('\nSAMPLE TRANSACTIONS WITHOUT orderId:');
    const txNoOrdSnap = await db.collection('transactions').where('orderId', '==', null).limit(5).get();
    txNoOrdSnap.forEach(d => {
        const data = d.data();
        console.log(` - fsId: ${d.id}, type: ${data.type}, category: ${data.category}, parentOrderId: ${data.parentOrderId}`);
    });

    process.exit(0);
}

run().catch(console.error);
