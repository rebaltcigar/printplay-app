// src/components/ShiftDetailView.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Typography,
  Card,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Paper,
  IconButton,
  Tooltip,
  Divider,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Checkbox,
  Stack,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import HistoryIcon from "@mui/icons-material/History";
import ClearIcon from "@mui/icons-material/Clear";
import CommentIcon from "@mui/icons-material/Comment";

import { db, auth } from "../firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import CustomerDialog from "./CustomerDialog";
import logo from "/icon.ico";

/* ---------- Expense policy ---------- */
const EXPENSE_TYPES_ALL = [
  "Supplies",
  "Maintenance",
  "Utilities",
  "Rent",
  "Internet",
  "Salary",
  "Salary Advance",
  "Misc",
];

const BILL_DENOMS = [1000, 500, 200, 100, 50, 20];
const COIN_DENOMS = [20, 10, 5, 1];

export default function ShiftDetailView({ shift, userMap, onBack }) {
  // ----- form state (left) -----
  const [item, setItem] = useState("");
  const [expenseType, setExpenseType] = useState("");
  const [expenseStaffId, setExpenseStaffId] = useState("");
  const [expenseStaffName, setExpenseStaffName] = useState("");
  const [expenseStaffEmail, setExpenseStaffEmail] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const itemInputRef = useRef(null);

  const [serviceItems, setServiceItems] = useState([]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [currentlyEditing, setCurrentlyEditing] = useState(null);

  // dialogs
  const [openCustomerDialog, setOpenCustomerDialog] = useState(false);
  const [openDebtDialog, setOpenDebtDialog] = useState(false);

  // ----- table state -----
  const [transactions, setTransactions] = useState([]);
  const [selectedTransactions, setSelectedTransactions] = useState([]);

  // ----- reconciliation -----
  const [pcRental, setPcRental] = useState(
    typeof shift.pcRentalTotal === "number" ? String(shift.pcRentalTotal) : ""
  );
  const [recon, setRecon] = useState({});

  const isDebtItem = item === "New Debt" || item === "Paid Debt";

  // ----- load services, staff, recon -----
  useEffect(() => {
    const qServices = query(collection(db, "services"), orderBy("sortOrder"));
    const unsubServices = onSnapshot(qServices, (snap) => {
      setServiceItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    (async () => {
      try {
        const q = query(collection(db, "users"), where("role", "==", "staff"));
        const snap = await getDocs(q);
        const opts = snap.docs.map((d) => {
          const v = d.data() || {};
          return {
            id: d.id,
            fullName: v.fullName || v.name || v.displayName || v.email || "Staff",
            email: v.email || "",
          };
        });
        opts.sort((a, b) =>
          (a.fullName || "").localeCompare(b.fullName || "", "en", {
            sensitivity: "base",
          })
        );
        setStaffOptions(opts);
      } catch {
        setStaffOptions([]);
      }
    })();

    (async () => {
      const s = await getDoc(doc(db, "shifts", shift.id));
      const d = s.data() || {};
      setRecon(d.denominations || {});
      if (typeof d.pcRentalTotal === "number") {
        setPcRental(String(d.pcRentalTotal));
      }
    })();

    return () => unsubServices();
  }, [shift.id]);

  // load transactions for this shift
  useEffect(() => {
    if (!shift?.id) return;
    const qTx = query(
      collection(db, "transactions"),
      where("shiftId", "==", shift.id),
      where("isDeleted", "==", false),
      orderBy("timestamp", "desc")
    );
    const unsubTx = onSnapshot(qTx, (snap) => {
      setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubTx();
  }, [shift]);

  // preselect staff when Salary/S. Advance chosen
  useEffect(() => {
    if (
      (expenseType === "Salary" || expenseType === "Salary Advance") &&
      !expenseStaffId &&
      staffOptions.length
    ) {
      const s =
        staffOptions.find((o) => o.email === shift.staffEmail) ||
        staffOptions[0];
      if (s) {
        setExpenseStaffId(s.id);
        setExpenseStaffName(s.fullName);
        setExpenseStaffEmail(s.email);
      }
    }
  }, [expenseType, staffOptions, expenseStaffId, shift.staffEmail]);

  // when picking a service, prefill price
  const handleItemChange = (e) => {
    const val = e.target.value;
    setItem(val);
    const svc = serviceItems.find((s) => s.serviceName === val);
    if (svc && typeof svc.price === "number") setPrice(svc.price);
    else setPrice("");

    if (val !== "New Debt" && val !== "Paid Debt") setSelectedCustomer(null);
    if (val !== "Expenses") {
      setExpenseType("");
      setExpenseStaffId("");
      setExpenseStaffName("");
      setExpenseStaffEmail("");
    }
  };

  const handleStaffSelect = (uid) => {
    setExpenseStaffId(uid);
    const found = staffOptions.find((s) => s.id === uid);
    setExpenseStaffName(found?.fullName || "");
    setExpenseStaffEmail(found?.email || "");
  };

  const handleSelectCustomer = (c) => {
    setSelectedCustomer(c);
    setOpenCustomerDialog(false);
  };

  const identifierText = (tx) => {
    if (tx.item === "Expenses") {
      const staffChunk = tx.expenseStaffName ? ` · ${tx.expenseStaffName}` : "";
      return `${tx.expenseType || ""}${staffChunk}`;
    }
    if (tx.customerName) return tx.customerName;
    return "—";
  };

  // populate form when editing
  useEffect(() => {
    if (!currentlyEditing) return;
    const t = currentlyEditing;
    setItem(t.item || "");
    setExpenseType(t.expenseType || "");
    setExpenseStaffId(t.expenseStaffId || "");
    setExpenseStaffName(t.expenseStaffName || "");
    setExpenseStaffEmail(t.expenseStaffEmail || "");
    setQuantity(String(t.quantity ?? ""));
    setPrice(String(t.price ?? ""));
    setNotes(t.notes || "");
    if (t.customerId && t.customerName) {
      setSelectedCustomer({ id: t.customerId, fullName: t.customerName });
    } else {
      setSelectedCustomer(null);
    }
    setTimeout(() => itemInputRef.current?.focus(), 50);
  }, [currentlyEditing]);

  const clearForm = () => {
    setItem("");
    setExpenseType("");
    setExpenseStaffId("");
    setExpenseStaffName("");
    setExpenseStaffEmail("");
    setQuantity("");
    setPrice("");
    setNotes("");
    setSelectedCustomer(null);
    setCurrentlyEditing(null);
  };

  // ----- add / edit -----
  const handleSubmit = async (e) => {
    e?.preventDefault?.();

    // validations
    if (item === "Expenses") {
      if (!expenseType) return alert("Please select an expense type.");
      if (
        (expenseType === "Salary" || expenseType === "Salary Advance") &&
        !expenseStaffId
      ) {
        return alert("Please select a staff for Salary or Salary Advance.");
      }
    }
    if (isDebtItem && !selectedCustomer && !currentlyEditing) {
      return alert("Please select a customer for this transaction.");
    }

    const data = {
      item,
      expenseType: item === "Expenses" ? expenseType : null,
      expenseStaffId: item === "Expenses" ? expenseStaffId || null : null,
      expenseStaffName: item === "Expenses" ? expenseStaffName || null : null,
      expenseStaffEmail: item === "Expenses" ? expenseStaffEmail || null : null,
      quantity: Number(quantity),
      price: Number(price),
      total: Number(quantity) * Number(price),
      notes,
      customerId: selectedCustomer ? selectedCustomer.id : null,
      customerName: selectedCustomer ? selectedCustomer.fullName : null,
    };

    try {
      if (currentlyEditing) {
        const reason = window.prompt("Reason for this edit?");
        if (!reason) return alert("Update cancelled. Reason is required.");
        await updateDoc(doc(db, "transactions", currentlyEditing.id), {
          ...data,
          isEdited: true,
          editedBy: auth.currentUser?.email || "admin",
          editReason: reason,
          lastUpdatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "transactions"), {
          ...data,
          shiftId: shift.id,                       // keep associated with this shift
          staffEmail: shift.staffEmail,            // associate with the staff of the shift
          addedByAdmin: true,                      // note admin added
          addedBy: auth.currentUser?.email || "",  // which admin
          isDeleted: false,
          isEdited: false,
          timestamp: serverTimestamp(),
        });
      }
      clearForm();
    } catch (err) {
      console.error(err);
      alert("Failed to save transaction.");
    }
  };

  // ----- deletes -----
  const handleRowDelete = async (tx) => {
    const reason = window.prompt("Reason for deleting this entry?");
    if (!reason) return alert("Deletion cancelled. Reason is required.");
    if (!window.confirm("Delete this entry?")) return;
    try {
      await updateDoc(doc(db, "transactions", tx.id), {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: auth.currentUser?.email || "admin",
        deleteReason: reason,
      });
    } catch (e) {
      console.error(e);
      alert("Failed to delete entry.");
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedTransactions.length) return;
    const reason = window.prompt("Reason for deleting selected entries?");
    if (!reason) return alert("Deletion cancelled. Reason is required.");
    if (!window.confirm(`Delete ${selectedTransactions.length} entries?`)) return;

    try {
      const batch = writeBatch(db);
      selectedTransactions.forEach((id) => {
        batch.update(doc(db, "transactions", id), {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: auth.currentUser?.email || "admin",
          deleteReason: reason,
        });
      });
      await batch.commit();
      setSelectedTransactions([]);
    } catch (e) {
      console.error(e);
      alert("Failed to bulk delete.");
    }
  };

  // ----- reconciliation -----
  const handleReconChange = (den, val) =>
    setRecon((p) => ({ ...p, [den]: val }));

  const cashOnHand = useMemo(
    () =>
      Object.entries(recon).reduce(
        (sum, [den, count]) => sum + Number(den) * Number(count || 0),
        0
      ),
    [recon]
  );

  const servicesTotal = useMemo(
    () =>
      transactions.reduce((sum, tx) => {
        if (tx.item !== "Expenses" && tx.item !== "New Debt")
          return sum + (tx.total || 0);
        return sum;
      }, 0),
    [transactions]
  );

  const expensesTotal = useMemo(
    () =>
      transactions.reduce((sum, tx) => {
        if (tx.item === "Expenses" || tx.item === "New Debt")
          return sum + (tx.total || 0);
        return sum;
      }, 0),
    [transactions]
  );

  const systemTotal = useMemo(
    () => servicesTotal - expensesTotal + Number(pcRental || 0),
    [servicesTotal, expensesTotal, pcRental]
  );

  // Write back latest totals to the shift (debounced)
  useEffect(() => {
    let t;
    const write = async () => {
      try {
        await updateDoc(doc(db, "shifts", shift.id), {
          servicesTotal,
          expensesTotal,
          pcRentalTotal: Number(pcRental || 0),
          systemTotal,
        });
      } catch (e) {
        // non-fatal: user may not have perms to edit shift; ignore
        console.warn("Totals write skipped/failed:", e?.message || e);
      }
    };
    t = setTimeout(write, 500); // debounce small bursts
    return () => clearTimeout(t);
  }, [servicesTotal, expensesTotal, pcRental, systemTotal, shift.id]);

  const saveRecon = async () => {
    try {
      await updateDoc(doc(db, "shifts", shift.id), {
        denominations: recon,
        pcRentalTotal: Number(pcRental || 0),
        systemTotal,
      });
      alert("Reconciliation saved.");
    } catch (e) {
      console.error(e);
      alert("Failed to save reconciliation.");
    }
  };

  const formatTime = (ts) =>
    ts?.seconds ? new Date(ts.seconds * 1000).toLocaleTimeString() : "—";

  // ----- render -----
  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2, minHeight: "100%" }}>
      {/* header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <img src={logo} width={18} height={18} alt="" />
        <Button onClick={onBack} size="small" sx={{ ml: 0.5 }}>
          &larr; Back to All Shifts
        </Button>
      </Box>

      <Typography variant="h5">
        Shift Detail — {userMap[shift.staffEmail] || shift.staffEmail} — {shift.shiftPeriod} —{" "}
        {shift.startTime?.seconds
          ? new Date(shift.startTime.seconds * 1000).toLocaleDateString()
          : ""}
      </Typography>

      <Box sx={{ display: "flex", gap: 2, alignItems: "stretch", minHeight: 0 }}>
        {/* LEFT: Log Entry + Reconciliation */}
        <Box sx={{ width: 360, display: "flex", flexDirection: "column", gap: 2 }}>
          {/* Log Entry */}
          <Card sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Log Entry
            </Typography>

            <FormControl fullWidth required>
              <InputLabel>Item</InputLabel>
              <Select value={item} label="Item" onChange={handleItemChange} inputRef={itemInputRef}>
                {serviceItems.map((s) => (
                  <MenuItem key={s.id} value={s.serviceName}>
                    {s.serviceName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Expense details */}
            {item === "Expenses" && (
              <>
                <FormControl fullWidth required>
                  <InputLabel>Expense Type</InputLabel>
                  <Select
                    label="Expense Type"
                    value={expenseType}
                    onChange={(e) => setExpenseType(e.target.value)}
                  >
                    {EXPENSE_TYPES_ALL.map((t) => (
                      <MenuItem key={t} value={t}>
                        {t}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {(expenseType === "Salary" || expenseType === "Salary Advance") && (
                  <FormControl fullWidth required>
                    <InputLabel>Staff</InputLabel>
                    <Select
                      label="Staff"
                      value={expenseStaffId}
                      onChange={(e) => handleStaffSelect(e.target.value)}
                    >
                      {staffOptions.length === 0 ? (
                        <MenuItem value="" disabled>
                          No staff available
                        </MenuItem>
                      ) : (
                        staffOptions.map((s) => (
                          <MenuItem key={s.id} value={s.id}>
                            {s.fullName}
                          </MenuItem>
                        ))
                      )}
                    </Select>
                  </FormControl>
                )}
              </>
            )}

            {/* Debt customer picker */}
            {(item === "New Debt" || item === "Paid Debt") && (
              <Box sx={{ mt: 1, p: 1, border: "1px dashed grey", borderRadius: 1 }}>
                <Typography variant="caption">Customer</Typography>
                {selectedCustomer ? (
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Typography>
                      <strong>{selectedCustomer.fullName}</strong>
                    </Typography>
                    <IconButton size="small" onClick={() => setSelectedCustomer(null)}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ) : (
                  <Button
                    onClick={() => setOpenCustomerDialog(true)}
                    fullWidth
                    variant="outlined"
                    size="small"
                    sx={{ mt: 0.5 }}
                  >
                    Select Customer
                  </Button>
                )}
              </Box>
            )}

            <TextField
              type="number"
              label="Quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
            <TextField
              type="number"
              label="Price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
            <Typography variant="body2">
              Total: ₱{(Number(quantity || 0) * Number(price || 0)).toFixed(2)}
            </Typography>
            <TextField
              label="Notes (Optional)"
              multiline
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <Stack direction="row" spacing={1} sx={{ mt: "auto" }}>
              <Button
                onClick={handleSubmit}
                variant="contained"
                fullWidth
                disabled={isDebtItem && !selectedCustomer && !currentlyEditing}
              >
                {currentlyEditing ? "Update Entry" : "Add Entry"}
              </Button>
              {currentlyEditing && (
                <Button variant="outlined" onClick={clearForm} fullWidth>
                  Cancel
                </Button>
              )}
            </Stack>
          </Card>

          {/* Reconciliation under the form */}
          <Card sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Admin Cash Reconciliation
            </Typography>
            <TextField
              label="PC Rental Total"
              type="number"
              value={pcRental}
              onChange={(e) => setPcRental(e.target.value)}
              fullWidth
            />

            <Typography variant="subtitle2" sx={{ mt: 1 }}>
              Bills
            </Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {BILL_DENOMS.map((d) => (
                <TextField
                  key={d}
                  type="number"
                  size="small"
                  label={`₱${d} x`}
                  value={recon[d] || ""}
                  onChange={(e) => handleReconChange(d, e.target.value)}
                  sx={{ width: 110 }}
                />
              ))}
            </Box>

            <Typography variant="subtitle2">Coins</Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {COIN_DENOMS.map((d) => (
                <TextField
                  key={d}
                  type="number"
                  size="small"
                  label={`₱${d} x`}
                  value={recon[d] || ""}
                  onChange={(e) => handleReconChange(d, e.target.value)}
                  sx={{ width: 110 }}
                />
              ))}
            </Box>

            <Divider />
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography>System Total</Typography>
              <Typography>₱{systemTotal.toFixed(2)}</Typography>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography>Cash on Hand</Typography>
              <Typography>₱{cashOnHand.toFixed(2)}</Typography>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography variant="subtitle1">Difference</Typography>
              <Typography
                variant="subtitle1"
                color={cashOnHand - systemTotal !== 0 ? "error" : "inherit"}
              >
                ₱{(cashOnHand - systemTotal).toFixed(2)}
              </Typography>
            </Box>

            <Button onClick={saveRecon} variant="contained">
              Save Reconciliation
            </Button>
          </Card>
        </Box>

        {/* RIGHT: Transactions table */}
        <Paper sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <Box sx={{ p: 2, pt: 1, display: "flex", alignItems: "center", gap: 2 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Transactions
            </Typography>
            <Box sx={{ flexGrow: 1 }} />
            <Tooltip title="Delete Selected">
              <Box component="span">
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  onClick={handleBulkDelete}
                  disabled={selectedTransactions.length === 0}
                >
                  Delete Selected
                </Button>
              </Box>
            </Tooltip>
          </Box>

          <TableContainer sx={{ flex: 1, minHeight: 0 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>Time</TableCell>
                  <TableCell>Item</TableCell>
                  <TableCell align="right">Qty</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell>Identifier</TableCell>
                  <TableCell align="right">Controls</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id} hover>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={selectedTransactions.includes(tx.id)}
                        onChange={() =>
                          setSelectedTransactions((prev) =>
                            prev.includes(tx.id)
                              ? prev.filter((i) => i !== tx.id)
                              : [...prev, tx.id]
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>{formatTime(tx.timestamp)}</TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                        <Typography variant="body2" fontWeight={600}>
                          {tx.item}
                        </Typography>
                        {tx.notes && (
                          <Tooltip title={tx.notes}>
                            <CommentIcon fontSize="inherit" />
                          </Tooltip>
                        )}
                        {tx.isEdited && (
                          <Tooltip title="Edited">
                            <HistoryIcon fontSize="inherit" />
                          </Tooltip>
                        )}
                        {tx.addedByAdmin && (
                          <Typography
                            variant="caption"
                            sx={{ border: "1px solid", px: 0.5, borderColor: "divider" }}
                          >
                            admin
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="right">{tx.quantity}</TableCell>
                    <TableCell align="right">₱{(tx.price || 0).toFixed(2)}</TableCell>
                    <TableCell align="right">₱{(tx.total || 0).toFixed(2)}</TableCell>
                    <TableCell>{identifierText(tx)}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => setCurrentlyEditing(tx)}>
                        <EditIcon fontSize="inherit" />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleRowDelete(tx)}>
                        <DeleteIcon fontSize="inherit" color="error" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Divider sx={{ mx: 2, my: 1 }} />
          <Box sx={{ p: 2, pt: 0 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography>Services Total</Typography>
              <Typography>₱{servicesTotal.toFixed(2)}</Typography>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography>Expenses Total</Typography>
              <Typography>₱{expensesTotal.toFixed(2)}</Typography>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography variant="subtitle1">System Total</Typography>
              <Typography variant="subtitle1">₱{systemTotal.toFixed(2)}</Typography>
            </Box>
          </Box>
        </Paper>
      </Box>

      {/* dialogs */}
      <CustomerDialog
        open={openCustomerDialog}
        onClose={() => setOpenCustomerDialog(false)}
        onSelectCustomer={handleSelectCustomer}
        user={{ email: shift.staffEmail }}
      />
    </Box>
  );
}
