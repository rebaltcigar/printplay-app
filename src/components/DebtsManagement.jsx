import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  Typography,
  Grid,
  TextField,
  MenuItem,
  Button,
  Divider,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  IconButton,
  Stack,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import PersonSearchIcon from "@mui/icons-material/PersonSearch";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import CustomerDialog from "./CustomerDialog";

// Convert rows to CSV text
function toCSV(rows) {
  const header = [
    "Customer Name",
    "Username",
    "Total Debt",
    "Total Payment",
    "Balance",
  ];
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const out = [header.join(",")];
  rows.forEach((r) => {
    out.push(
      [
        escape(r.customerName),
        escape(r.username),
        r.totalDebt.toFixed(2),
        r.totalPayment.toFixed(2),
        r.balance.toFixed(2),
      ].join(",")
    );
  });
  return out.join("\n");
}

export default function DebtsManagement({ adminEmail }) {
  // --- Form state ---
  const [entryType, setEntryType] = useState("Debt"); // "Debt" | "Payment"
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [customer, setCustomer] = useState(null);
  const [openCustomerDialog, setOpenCustomerDialog] = useState(false);
  const [saving, setSaving] = useState(false);

  // --- Data for balances ---
  const [customers, setCustomers] = useState([]); // { id, username, fullName }
  const [allTx, setAllTx] = useState([]); // all transactions (we filter to debts/payments)

  // Customers list
  useEffect(() => {
    const q = query(collection(db, "customers"), orderBy("username"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setCustomers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn("customers load error:", err)
    );
    return () => unsub();
  }, []);

  // All transactions (we filter in-memory to avoid composite index issues)
  useEffect(() => {
    const q = query(collection(db, "transactions"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setAllTx(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn("transactions load error:", err)
    );
    return () => unsub();
  }, []);

  // Filter to debt/payment and aggregate balances per customer
  const rows = useMemo(() => {
    const debts = allTx.filter(
      (t) => t.item === "New Debt" && !t.isDeleted && t.customerId
    );
    const pays = allTx.filter(
      (t) => t.item === "Paid Debt" && !t.isDeleted && t.customerId
    );

    const by = new Map(); // customerId -> agg
    const upsert = (cid) => {
      if (!by.has(cid)) {
        const c = customers.find((x) => x.id === cid) || {};
        by.set(cid, {
          customerId: cid,
          customerName: c.fullName || "",
          username: c.username || "",
          totalDebt: 0,
          totalPayment: 0,
        });
      }
      return by.get(cid);
    };

    debts.forEach((t) => {
      const node = upsert(t.customerId);
      node.totalDebt += Number(t.total || 0);
    });
    pays.forEach((t) => {
      const node = upsert(t.customerId);
      node.totalPayment += Number(t.total || 0);
    });

    return Array.from(by.values())
      .map((r) => ({ ...r, balance: r.totalDebt - r.totalPayment }))
      .filter((r) => r.balance >= 1)
      .sort(
        (a, b) =>
          b.balance - a.balance ||
          a.customerName.localeCompare(b.customerName)
      );
  }, [allTx, customers]);

  // Handlers
  const handleSelectCustomer = (c) => {
    setCustomer(c);
    setOpenCustomerDialog(false);
  };

  const handleAddEntry = async (e) => {
    e.preventDefault();
    if (!customer) {
      alert("Please choose a customer.");
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      alert("Please enter a valid amount.");
      return;
    }

    const item = entryType === "Debt" ? "New Debt" : "Paid Debt";
    const payload = {
      item,
      quantity: 1,
      price: amt,
      total: amt,
      notes: notes || null,
      customerId: customer.id,
      customerName: customer.fullName || null,
      shiftId: null, // admin entry, not tied to a staff shift
      isAdminEntry: true,
      timestamp: serverTimestamp(),
      staffEmail: adminEmail || null,
      isDeleted: false,
      isEdited: false,
    };

    try {
      setSaving(true);
      await addDoc(collection(db, "transactions"), payload);
      setAmount("");
      setNotes("");
    } catch (err) {
      console.error("Failed to add debt/payment:", err);
      alert("Failed to save entry.");
    } finally {
      setSaving(false);
    }
  };

  const handleExportCSV = () => {
    const csv = toCSV(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `debts_balances_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Grid container spacing={2}>
      {/* Form */}
      <Grid item xs={12} md={4}>
        <Card sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Add Debt / Payment
          </Typography>

          <Box
            component="form"
            onSubmit={handleAddEntry}
            sx={{ display: "grid", gap: 2 }}
          >
            <TextField
              select
              label="Type"
              value={entryType}
              onChange={(e) => setEntryType(e.target.value)}
              fullWidth
            >
              <MenuItem value="Debt">Debt</MenuItem>
              <MenuItem value="Payment">Payment</MenuItem>
            </TextField>

            <TextField
              label="Customer"
              value={
                customer ? `${customer.fullName} (${customer.username})` : ""
              }
              onClick={() => setOpenCustomerDialog(true)}
              placeholder="Select customer"
              fullWidth
              InputProps={{
                readOnly: true,
                endAdornment: (
                  <IconButton
                    size="small"
                    onClick={() => setOpenCustomerDialog(true)}
                  >
                    <PersonSearchIcon fontSize="small" />
                  </IconButton>
                ),
              }}
            />

            <TextField
              type="number"
              label="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputProps={{ min: 0, step: "0.01" }}
              required
              fullWidth
            />

            <TextField
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              fullWidth
              multiline
              rows={3}
            />

            <Stack direction="row" spacing={1}>
              <Button type="submit" variant="contained" disabled={saving} fullWidth>
                {entryType === "Debt" ? "Add Debt" : "Add Payment"}
              </Button>
            </Stack>
          </Box>
        </Card>
      </Grid>

      {/* Balances table */}
      <Grid item xs={12} md={8}>
        <Card sx={{ p: 2, height: "100%" }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 1,
            }}
          >
            <Typography variant="h6">Customer Balances</Typography>
            <Button startIcon={<DownloadIcon />} onClick={handleExportCSV}>
              Export CSV
            </Button>
          </Box>
          <Divider sx={{ mb: 2 }} />

          <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Customer</TableCell>
                  <TableCell>Username</TableCell>
                  <TableCell align="right">Total Debt</TableCell>
                  <TableCell align="right">Total Payment</TableCell>
                  <TableCell align="right">Balance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography color="text.secondary">
                        No outstanding balances (≥ ₱1.00).
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.customerId} hover>
                      <TableCell>{r.customerName || "—"}</TableCell>
                      <TableCell>{r.username || "—"}</TableCell>
                      <TableCell align="right">
                        ₱{r.totalDebt.toFixed(2)}
                      </TableCell>
                      <TableCell align="right">
                        ₱{r.totalPayment.toFixed(2)}
                      </TableCell>
                      <TableCell align="right">
                        <strong>₱{r.balance.toFixed(2)}</strong>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Grid>

      {/* Customer selector dialog */}
      <CustomerDialog
        open={openCustomerDialog}
        onClose={() => setOpenCustomerDialog(false)}
        onSelectCustomer={handleSelectCustomer}
        user={{ email: adminEmail }}
      />
    </Grid>
  );
}
