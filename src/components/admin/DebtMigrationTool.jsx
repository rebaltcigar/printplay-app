import React, { useState, useRef, useEffect } from 'react';
import {
    Box, Button, Typography, Paper, LinearProgress, Stack, Alert, CircularProgress
} from '@mui/material';
import { db } from '../../firebase';
import {
    collection, getDocs, query, where, documentId, doc, writeBatch, serverTimestamp
} from 'firebase/firestore';
import { generateBatchIds } from '../../utils/idGenerator';
import { fmtCurrency } from '../../utils/formatters';

export default function DebtMigrationTool({ showSnackbar }) {
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [logs, setLogs] = useState([]);
    const [stats, setStats] = useState(null);
    const logsEndRef = useRef(null);

    const addLog = (msg) => {
        setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    const startMigration = async () => {
        if (!window.confirm("This will scan old 'New Debt' and 'Paid Debt' transactions and convert them into consolidated Invoices in the new system. Proceed?")) return;

        setProcessing(true);
        setLogs([]);
        setProgress(0);
        setStats(null);
        addLog("Migration started...");

        try {
            // STEP 1: Fetch transactions safely (no compound "in" arrays to avoid index issues if possible)
            // It's safer to just fetch where not deleted, and filter client-side if missing indexes, or do two queries.
            addLog("Querying legacy 'New Debt' transactions...");
            const qNewDebt = query(
                collection(db, "transactions"),
                where("item", "==", "New Debt"),
                where("isDeleted", "==", false)
            );
            const snapNewDebt = await getDocs(qNewDebt);

            addLog("Querying legacy 'Paid Debt' transactions...");
            const qPaidDebt = query(
                collection(db, "transactions"),
                where("item", "==", "Paid Debt"),
                where("isDeleted", "==", false)
            );
            const snapPaidDebt = await getDocs(qPaidDebt);

            setProgress(10);

            // Combine and filter locally for migrated items (Firestore doesn't allow != well with other equalities)
            const allTxs = [...snapNewDebt.docs, ...snapPaidDebt.docs]
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(tx => tx.migratedToInvoice !== true);

            const totalFound = allTxs.length;
            addLog(`Found ${totalFound} unmigrated debt transactions.`);

            if (totalFound === 0) {
                addLog("No eligible transactions found. Migration complete.");
                setProcessing(false);
                setProgress(100);
                return;
            }

            // STEP 2: Group by Customer
            addLog("Grouping and calculating net balances...");
            const customerGroups = {};

            allTxs.forEach(tx => {
                const cid = tx.customerId || tx.customerName || 'Walk-in';
                const cName = tx.customerName || 'Unknown Customer';

                if (!customerGroups[cid]) {
                    customerGroups[cid] = {
                        customerId: cid,
                        customerName: cName,
                        newDebt: 0,
                        paidDebt: 0,
                        txIds: []
                    };
                }

                if (tx.item === 'New Debt') customerGroups[cid].newDebt += Number(tx.total || 0);
                if (tx.item === 'Paid Debt') customerGroups[cid].paidDebt += Number(tx.total || 0);
                customerGroups[cid].txIds.push(tx.id);
            });

            setProgress(25);

            // STEP 3: Identify accounts that need an invoice wrapper
            const customersToInvoice = [];
            let zeroBalanceCount = 0;
            let negativeBalanceCount = 0;

            Object.values(customerGroups).forEach(group => {
                const netBalance = group.newDebt - group.paidDebt;
                if (netBalance > 0) {
                    customersToInvoice.push({
                        ...group,
                        netBalance
                    });
                } else if (netBalance === 0) {
                    zeroBalanceCount++;
                } else {
                    negativeBalanceCount++;
                }
            });

            addLog(`Analysis complete:`);
            addLog(` - ${customersToInvoice.length} customers with outstanding balances.`);
            addLog(` - ${zeroBalanceCount} fully paid/zero balance customers.`);
            if (negativeBalanceCount > 0) addLog(` - Warning: ${negativeBalanceCount} customers have negative debt (overpaid).`);

            setProgress(40);

            // STEP 4: Generate new invoices and update transactions
            addLog("Preparing database batches...");

            // We need custom display IDs for the new invoices
            let invoiceIds = [];
            if (customersToInvoice.length > 0) {
                invoiceIds = await generateBatchIds("invoices", "INV", customersToInvoice.length);
            }

            setProgress(50);

            const writeBatches = [];
            let currentBatch = writeBatch(db);
            let opCount = 0;

            const commitBatchIfFull = () => {
                if (opCount >= 450) {
                    writeBatches.push(currentBatch.commit());
                    currentBatch = writeBatch(db);
                    opCount = 0;
                }
            };

            // 4a. Write the Invoices
            let invoicesCreated = 0;
            customersToInvoice.forEach((cust, index) => {
                const newDocRef = doc(collection(db, "invoices"));
                const displayId = invoiceIds[index] || `INV-MIG-${Date.now()}-${index}`;

                currentBatch.set(newDocRef, {
                    invoiceNumber: displayId,
                    customerId: cust.customerId !== cust.customerName ? cust.customerId : null,
                    customerName: cust.customerName,
                    customerEmail: "",
                    customerPhone: "",
                    orderId: null,      // No parent order
                    orderNumber: 'LEGACY-DEBT',
                    items: [{
                        name: "Legacy Debt Forwarded Balance",
                        price: cust.netBalance,
                        quantity: 1,
                        total: cust.netBalance
                    }],
                    subtotal: cust.netBalance,
                    taxAmount: 0,
                    discountAmount: 0,
                    total: cust.netBalance,
                    amountPaid: 0,
                    balance: cust.netBalance,
                    status: 'unpaid',
                    payments: [], // Empty initially
                    createdAt: serverTimestamp(),
                    dueDate: serverTimestamp(), // Due immediately since it's legacy
                    shiftId: null,
                    staffEmail: "system_migration",
                    notes: "Auto-generated from legacy transaction migration."
                });

                opCount++;
                invoicesCreated++;
                commitBatchIfFull();
            });

            addLog(`Queued ${invoicesCreated} historical invoices for generation.`);
            setProgress(70);

            // 4b. Update ALL processed transactions (including zero/negative balance ones) to 'migratedToInvoice'
            let txUpdated = 0;
            allTxs.forEach(tx => {
                const txRef = doc(db, "transactions", tx.id);
                currentBatch.update(txRef, {
                    migratedToInvoice: true,
                    migrationTimestamp: serverTimestamp()
                });
                opCount++;
                txUpdated++;
                commitBatchIfFull();
            });

            addLog(`Queued ${txUpdated} legacy transactions for 'migrated' flagging.`);

            if (opCount > 0) {
                writeBatches.push(currentBatch.commit());
            }

            setProgress(85);
            addLog("Executing database writes (this may take a moment)...");

            await Promise.all(writeBatches);

            setProgress(100);
            addLog("Migration successfully completed!");

            setStats({
                txProcessed: txUpdated,
                invoicesCreated,
                zeroBalances: zeroBalanceCount
            });

            if (showSnackbar) showSnackbar("Debt migration completed!", "success");

        } catch (err) {
            console.error(err);
            addLog(`ERROR: ${err.message}`);
            if (showSnackbar) showSnackbar("Migration failed: " + err.message, "error");
        } finally {
            setProcessing(false);
        }
    };

    return (
        <Paper sx={{ p: 3, border: '1px solid', borderColor: 'warning.main', bgcolor: 'rgba(237, 108, 2, 0.05)' }}>
            <Typography variant="h6" color="warning.main" gutterBottom>Legacy Debt Migration Tool</Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
                This one-time utility sweeps through your old "New Debt" and "Paid Debt" transactions, calculates the net outstanding balance for each customer, and generates consolidated <strong>Invoices</strong> so they appear in the new Accounts Receivable system. Processed transactions are flagged so they are never migrated twice.
            </Typography>

            <Button
                variant="contained"
                color="warning"
                onClick={startMigration}
                disabled={processing}
                sx={{ mb: 3 }}
            >
                {processing ? <CircularProgress size={24} color="inherit" /> : "Start Migration"}
            </Button>

            {processing && (
                <Box sx={{ mb: 3 }}>
                    <Stack direction="row" justifyContent="space-between" mb={1}>
                        <Typography variant="caption">Migration Progress</Typography>
                        <Typography variant="caption">{progress}%</Typography>
                    </Stack>
                    <LinearProgress variant="determinate" value={progress} color="warning" />
                </Box>
            )}

            {stats && (
                <Alert severity="success" sx={{ mb: 3 }}>
                    Migration Complete!
                    Processed <strong>{stats.txProcessed}</strong> older transactions.
                    Created <strong>{stats.invoicesCreated}</strong> new consolidated Invoices.
                    ({stats.zeroBalances} customers were skipped because they already had a zero balance).
                </Alert>
            )}

            <Box
                sx={{
                    bgcolor: '#000',
                    color: '#0f0',
                    p: 2,
                    borderRadius: 1,
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    height: 200,
                    overflowY: 'auto'
                }}
            >
                {logs.length === 0 ? "Ready." : logs.map((log, i) => (
                    <div key={i}>{log}</div>
                ))}
                <div ref={logsEndRef} />
            </Box>
        </Paper>
    );
}
