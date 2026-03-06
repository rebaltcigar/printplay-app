import React, { useState } from 'react';
import { Box, Button, Typography, Paper, Alert, LinearProgress, Stack, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import { db } from '../../firebase';
import { collection, getDocs, writeBatch, doc, serverTimestamp } from 'firebase/firestore';

export default function CustomerMigrationTool({ showSnackbar }) {
    const [status, setStatus] = useState('');
    const [progress, setProgress] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const handleConfirm = () => {
        setConfirmOpen(false);
        runMigration();
    };

    const runMigration = async () => {

        setLoading(true);
        setStatus("Fetching legacy orders...");
        setError(null);
        setProgress(0);

        try {
            // 1. Fetch Orders and Invoices missing customerId
            // Firestore doesn't support 'IS NULL' easily without a multiple field check or checking for undefined if missing. 
            // In JavaScript, we can just fetch all or fetch where customerId == null, but missing fields aren't fetched via where().
            // Let's just fetch all orders and invoices and filter in memory, assuming total volume is manageable for a one-time script.

            const ordersSnap = await getDocs(collection(db, 'orders'));
            const invoicesSnap = await getDocs(collection(db, 'invoices'));

            const allOrders = ordersSnap.docs.map(d => ({ docId: d.id, ref: d.ref, ...d.data() }));
            const allInvoices = invoicesSnap.docs.map(d => ({ docId: d.id, ref: d.ref, ...d.data() }));

            setStatus(`Processing ${allOrders.length} orders and ${allInvoices.length} invoices locally...`);
            setProgress(10);

            // Filter for docs lacking a real customerId (or walk-in/null)
            const legacyOrders = allOrders.filter(o => !o.customerId || o.customerId === 'walk-in' || o.customerId === o.customerName);
            const legacyInvoices = allInvoices.filter(i => !i.customerId || i.customerId === 'walk-in' || i.customerId === i.customerName);

            if (legacyOrders.length === 0 && legacyInvoices.length === 0) {
                setStatus("No legacy data found needing migration!");
                setLoading(false);
                if (showSnackbar) showSnackbar("Nothing to migrate.", "info");
                return;
            }

            // 2. Group by Normalized Name
            const customerMap = new Map();

            const processDoc = (docData, type) => {
                const rawName = docData.customerName || '';
                // Skip true walk-ins with no typed name
                if (!rawName || rawName.trim().toLowerCase() === 'walk-in customer' || rawName.trim().toLowerCase() === 'walk-in') return null;

                const normalized = rawName.trim().toLowerCase();

                if (!customerMap.has(normalized)) {
                    customerMap.set(normalized, {
                        originalName: rawName.trim(), // Keep capitalization from first hit
                        phone: '',
                        address: '',
                        tin: '',
                        lifetimeValue: 0,
                        totalOrders: 0,
                        outstandingBalance: 0,
                        linkedOrders: [],
                        linkedInvoices: []
                    });
                }

                const cust = customerMap.get(normalized);

                // Update metrics & links
                if (type === 'order') {
                    cust.linkedOrders.push(docData.ref);
                    if (docData.invoiceStatus === 'PAID') {
                        cust.totalOrders += 1;
                        cust.lifetimeValue += (Number(docData.total) || 0);
                    }
                    if (docData.customerPhone) cust.phone = docData.customerPhone;
                    if (docData.customerAddress) cust.address = docData.customerAddress;
                    if (docData.customerTin) cust.tin = docData.customerTin;
                } else if (type === 'invoice') {
                    cust.linkedInvoices.push(docData.ref);
                    if (docData.status === 'unpaid' || docData.status === 'partial') {
                        cust.outstandingBalance += (Number(docData.balance) || 0);
                    }
                    if (docData.customerTin) cust.tin = docData.customerTin;
                    if (docData.customerAddress) cust.address = docData.customerAddress;
                }

                return normalized;
            };

            legacyOrders.forEach(o => processDoc(o, 'order'));
            legacyInvoices.forEach(i => processDoc(i, 'invoice'));

            setProgress(40);
            setStatus(`Found ${customerMap.size} unique customers to create...`);

            if (customerMap.size === 0) {
                setStatus("Completed! No unique named customers required migration.");
                setLoading(false);
                return;
            }

            // 3. Batch Creation & Linking
            let batch = writeBatch(db);
            let opCount = 0;
            const BATCH_LIMIT = 450;
            let currentUniqueCust = 0;

            const commitBatch = async () => {
                await batch.commit();
                batch = writeBatch(db);
                opCount = 0;
            };

            for (const [normalizedKey, custData] of customerMap.entries()) {
                currentUniqueCust++;
                setStatus(`Writing customer ${currentUniqueCust} of ${customerMap.size}...`);
                setProgress(40 + (currentUniqueCust / customerMap.size) * 50);

                // Create Customer Doc
                const newDocRef = doc(collection(db, 'customers'));
                batch.set(newDocRef, {
                    fullName: custData.originalName,
                    phone: custData.phone,
                    address: custData.address,
                    tin: custData.tin,
                    lifetimeValue: custData.lifetimeValue,
                    outstandingBalance: custData.outstandingBalance,
                    totalOrders: custData.totalOrders,
                    createdAt: serverTimestamp(),
                    createdBy: 'migration_script'
                });
                opCount++;

                // Back-link Orders
                for (const orderRef of custData.linkedOrders) {
                    batch.update(orderRef, { customerId: newDocRef.id, customerName: custData.originalName });
                    opCount++;
                    if (opCount >= BATCH_LIMIT) await commitBatch();
                }

                // Back-link Invoices
                for (const invRef of custData.linkedInvoices) {
                    batch.update(invRef, { customerId: newDocRef.id, customerName: custData.originalName });
                    opCount++;
                    if (opCount >= BATCH_LIMIT) await commitBatch();
                }

                if (opCount >= BATCH_LIMIT) await commitBatch();
            }

            if (opCount > 0) await commitBatch();

            setProgress(100);
            setStatus("Migration completed successfully!");
            if (showSnackbar) showSnackbar("Historical data migrated to CRM", "success");

        } catch (err) {
            console.error("Migration Error:", err);
            setError(err.message);
            setStatus("Migration failed mid-way. Check console.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Paper elevation={3} sx={{ p: 3, borderLeft: '4px solid #f44336' }}>
            <Typography variant="h6" color="error" gutterBottom>
                Advanced Data Migration (v0.4 CRM)
            </Typography>
            <Typography variant="body2" sx={{ mb: 2, opacity: 0.8 }}>
                This script scans historical Orders and Invoices that lack a proper `customerId`. It aggregates exact name matches into distinct profiles in the new `customers` database, calculates lifetime value and unpaid AR, and finally back-links the documents.
            </Typography>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Stack spacing={2}>
                <Button
                    variant="outlined"
                    color="error"
                    onClick={() => setConfirmOpen(true)}
                    disabled={loading}
                    sx={{ alignSelf: 'flex-start' }}
                >
                    {loading ? "Running script..." : "Migrate Legacy Customer Data"}
                </Button>

                {loading && (
                    <Box sx={{ width: '100%' }}>
                        <Typography variant="caption" sx={{ mb: 0.5, display: 'block' }}>{status}</Typography>
                        <LinearProgress variant="determinate" value={progress} />
                    </Box>
                )}
                {!loading && status && !error && (
                    <Alert severity="success">{status}</Alert>
                )}
            </Stack>

            <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
                <DialogTitle>Confirm Migration</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        This will scan all historical orders & invoices, construct customer profiles, and back-link their IDs. This may take a moment depending on the volume of data. Continue?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
                    <Button onClick={handleConfirm} color="error" autoFocus>Migrate</Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
}
