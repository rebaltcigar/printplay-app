// src/components/AdminDebtLookupDialog.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Box, Typography, Stack, IconButton, Paper,
  List as MUIList, ListItemButton, ListItemText, Divider,
  FormControl, InputLabel, Select, MenuItem
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import ClearIcon from "@mui/icons-material/Clear";
import {
  collection, getDocs, onSnapshot, orderBy, query, startAt, endAt,
  where, limit, addDoc, updateDoc, doc, serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase";
import ConfirmationReasonDialog from "./ConfirmationReasonDialog";
import { generateDisplayId } from "../utils/idGenerator";

function formatPeso(n) {
  const val = Number(n || 0);
  return `₱${val.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

/**
 * Props:
 * - open
 * - onClose()
 * - presetCustomer: { id, fullName, username } | null
 * - selectToken: number
 * - user: { email }
 */
export default function AdminDebtLookupDialog({ open, onClose, presetCustomer, selectToken, user, showSnackbar }) {
  // search + results
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // selection + details
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [debtLoading, setDebtLoading] = useState(false);
  const [debtSummary, setDebtSummary] = useState({ newDebt: 0, paid: 0, balance: 0 });
  const [debtTx, setDebtTx] = useState([]);

  // form
  const [mode, setMode] = useState("add"); // add | edit
  const [editId, setEditId] = useState(null);
  const [formType, setFormType] = useState("New Debt");
  const [formAmount, setFormAmount] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formDate, setFormDate] = useState(toDateOnlyString(new Date()));

  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    message: "",
    onConfirm: null,
    requireReason: false,
  });

  const activeCustomer = useMemo(
    () => selectedCustomer || presetCustomer || null,
    [selectedCustomer, presetCustomer]
  );

  // HARD select preset when opened or token changes
  useEffect(() => {
    if (open && presetCustomer?.id) {
      setSelectedCustomer(presetCustomer);
      setSearch("");
      setResults([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectToken]);

  // search customers
  const lowerSearch = useMemo(() => search.trim().toLowerCase(), [search]);
  const nameVariants = useMemo(() => {
    const raw = search.trim();
    if (!raw) return [];
    const lower = raw.toLowerCase();
    const title = lower.replace(/\b\w/g, (c) => c.toUpperCase());
    const capFirst = raw.charAt(0).toUpperCase() + raw.slice(1);
    const seen = new Set();
    return [raw, lower, title, capFirst].filter((v) => v && !seen.has(v) && seen.add(v));
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      if (!open || lowerSearch.length === 0) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const customersCol = collection(db, "customers");
        const qUser = query(
          customersCol, orderBy("username"),
          startAt(lowerSearch), endAt(`${lowerSearch}\uf8ff`), limit(20)
        );
        const nameQs = nameVariants.map(nv =>
          query(customersCol, orderBy("fullName"), startAt(nv), endAt(`${nv}\uf8ff`), limit(20))
        );
        const [snapUser, ...nameSnaps] = await Promise.all([getDocs(qUser), ...nameQs.map(getDocs)]);
        const map = new Map();
        snapUser.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
        nameSnaps.forEach(s => s.forEach(d => map.set(d.id, { id: d.id, ...d.data() })));
        const merged = Array.from(map.values()).sort((a, b) => (a.username || "").localeCompare(b.username || ""));
        if (!cancelled) setResults(merged.slice(0, 30));
      } catch (e) {
        if (!cancelled) setResults([]);
        console.error("AdminDebtLookup search error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = setTimeout(fetch, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, lowerSearch, nameVariants]);

  // realtime for active (non-deleted)
  useEffect(() => {
    if (!open || !activeCustomer?.id) {
      setDebtTx([]); setDebtSummary({ newDebt: 0, paid: 0, balance: 0 });
      return;
    }
    setDebtLoading(true);
    const qRecent = query(
      collection(db, "transactions"),
      where("customerId", "==", activeCustomer.id),
      where("isDeleted", "==", false),
      where("item", "in", ["New Debt", "Paid Debt"]),
      orderBy("timestamp", "desc")
    );
    const unsub = onSnapshot(
      qRecent,
      (snap) => {
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const newDebt = rows.filter(r => r.item === "New Debt").reduce((s, r) => s + Number(r.total || 0), 0);
        const paid = rows.filter(r => r.item === "Paid Debt").reduce((s, r) => s + Number(r.total || 0), 0);
        setDebtSummary({ newDebt, paid, balance: newDebt - paid });
        setDebtTx(rows);
        setDebtLoading(false);
      },
      (err) => {
        console.error("Debt stream error:", err);
        setDebtTx([]);
        setDebtSummary({ newDebt: 0, paid: 0, balance: 0 });
        setDebtLoading(false);
      }
    );
    return () => unsub();
  }, [open, activeCustomer]);

  // form helpers
  const resetForm = () => {
    setMode("add");
    setEditId(null);
    setFormType("New Debt");
    setFormAmount("");
    setFormNotes("");
    setFormDate(toDateOnlyString(new Date()));
  };

  const beginEdit = (row) => {
    setMode("edit");
    setEditId(row.id);
    setFormType(row.item);
    setFormAmount(Number(row.total || 0));
    setFormNotes(row.notes || "");
    const dt = row.timestamp?.seconds
      ? new Date(row.timestamp.seconds * 1000)
      : row.timestamp instanceof Date
        ? row.timestamp
        : new Date();
    setFormDate(toDateOnlyString(dt));
  };

  const addOrSave = async () => {
    if (!activeCustomer?.id) {
      showSnackbar?.("Select a customer first.", 'warning');
      return;
    }
    const amt = Number(formAmount || 0);
    if (amt <= 0) {
      showSnackbar?.("Enter a valid amount.", 'warning');
      return;
    }

    const ts = new Date(formDate);
    ts.setHours(0, 0, 0, 0);

    const payload = {
      item: formType, // "New Debt" | "Paid Debt"
      quantity: 1,
      price: amt,
      total: amt,
      notes: formNotes || "",
      customerId: activeCustomer.id,
      customerName: activeCustomer.fullName || activeCustomer.username || "",
      shiftId: null,
      source: "admin_debt",
      timestamp: ts,
      staffEmail: user?.email || "admin",
      isDeleted: false,
    };

    try {
      if (mode === "add") {
        const displayId = await generateDisplayId("transactions", "TX");
        await addDoc(collection(db, "transactions"), {
          ...payload,
          displayId,
          isEdited: false,
          addedByAdmin: true,
          createdAt: serverTimestamp(),
        });
        resetForm();
      } else {
        setConfirmDialog({
          open: true,
          title: "Edit Debt Transaction",
          message: `Save changes to this ${formType.toLowerCase()} entry?`,
          requireReason: true,
          onConfirm: async (reason) => {
            try {
              await updateDoc(doc(db, "transactions", editId), {
                ...payload,
                isEdited: true,
                editedBy: user?.email || "admin",
                editReason: reason,
                lastUpdatedAt: serverTimestamp(),
              });
              resetForm();
            } catch (e) {
              console.error("Save debt tx failed", e);
              showSnackbar?.("Failed to save.", 'error');
            }
          }
        });
      }
    } catch (e) {
      console.error("Save debt tx failed", e);
      showSnackbar?.("Failed to save.", 'error');
    }
  };

  const softDelete = async (row) => {
    setConfirmDialog({
      open: true,
      title: "Delete Entry",
      message: `Soft delete this ${row.item.toLowerCase()}?`,
      requireReason: true,
      onConfirm: async (reason) => {
        try {
          await updateDoc(doc(db, "transactions", row.id), {
            isDeleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: user?.email || "admin",
            deleteReason: reason,
          });
          if (mode === "edit" && editId === row.id) resetForm();
        } catch (e) {
          console.error("Delete debt tx failed", e);
          showSnackbar?.("Failed to delete.", 'error');
        }
      }
    });
  };

  const handleClose = () => {
    setSearch(""); setResults([]); setSelectedCustomer(null);
    setDebtTx([]); setDebtSummary({ newDebt: 0, paid: 0, balance: 0 });
    resetForm();
    onClose?.();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ pr: 6 }}>
        Debt Lookup / Manage (Admin)
        <IconButton onClick={handleClose} size="small" sx={{ position: "absolute", right: 8, top: 8 }} aria-label="close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 1.5 }}>
        {!activeCustomer && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 3, opacity: 0.85 }}>Search</Typography>
            <TextField
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              fullWidth size="small" placeholder="Search by username or name…"
            />
            {search.trim().length > 0 && (
              <Box sx={{ maxHeight: 240, overflowY: "auto", mt: 1 }}>
                {loading && <Typography variant="body2">Searching…</Typography>}
                {!loading && results.length === 0 && <Typography variant="body2">No customers found.</Typography>}
                {!loading && results.length > 0 && (
                  <MUIList dense>
                    {results.map(c => (
                      <ListItemButton key={c.id} onClick={() => setSelectedCustomer(c)}>
                        <ListItemText
                          primary={c.fullName || c.username}
                          secondary={c.username && c.fullName ? c.username : undefined}
                        />
                      </ListItemButton>
                    ))}
                  </MUIList>
                )}
              </Box>
            )}
          </Paper>
        )}

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 3, opacity: 0.85 }}>Details</Typography>

          {!activeCustomer && (
            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              Select a customer from the search results, or open this from the Debts table.
            </Typography>
          )}

          {activeCustomer && (
            <>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2, alignItems: { xs: "flex-start", sm: "center" } }}>
                <Box>
                  <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
                    {activeCustomer.fullName || activeCustomer.username}
                  </Typography>
                  {activeCustomer.fullName && activeCustomer.username && (
                    <Typography variant="body2" sx={{ opacity: 0.8 }}>{activeCustomer.username}</Typography>
                  )}
                </Box>

                <Box sx={{ flexGrow: 1 }} />

                <Stack direction="row" spacing={3}>
                  <Box>
                    <Typography variant="caption" sx={{ opacity: 0.75 }}>New Debt</Typography>
                    <Typography variant="h6">{formatPeso(debtSummary.newDebt)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ opacity: 0.75 }}>Paid</Typography>
                    <Typography variant="h6">{formatPeso(debtSummary.paid)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ opacity: 0.75 }}>Balance</Typography>
                    <Typography variant="h6" color={debtSummary.balance > 0 ? "error" : "success.main"}>
                      {formatPeso(debtSummary.balance)}
                    </Typography>
                  </Box>
                </Stack>
              </Stack>

              <Divider sx={{ my: 1.5 }} />

              {/* Add/Edit form */}
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {mode === "add" ? "Add Transaction" : "Edit Transaction"}
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
                <FormControl sx={{ minWidth: 160 }}>
                  <InputLabel>Type</InputLabel>
                  <Select value={formType} label="Type" onChange={(e) => setFormType(e.target.value)}>
                    <MenuItem value="New Debt">New Debt</MenuItem>
                    <MenuItem value="Paid Debt">Paid Debt</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  type="number" label="Amount" value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  inputProps={{ min: 0, step: "0.01" }}
                />
                <TextField
                  type="date" label="Date" value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Notes (optional)" value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)} sx={{ flex: 1 }}
                />
                <Button variant="contained" startIcon={<SaveIcon />} onClick={addOrSave}>
                  {mode === "add" ? "Add" : "Save"}
                </Button>
                {mode === "edit" && (
                  <Button variant="text" startIcon={<ClearIcon />} onClick={resetForm}>
                    Cancel
                  </Button>
                )}
              </Stack>

              <Typography variant="subtitle2" sx={{ mb: 1 }}>Recent Debt Transactions</Typography>
              {debtLoading && <Typography variant="body2">Loading…</Typography>}
              {!debtLoading && debtTx.length === 0 && (
                <Typography variant="body2" sx={{ opacity: 0.8 }}>No recent debt transactions.</Typography>
              )}

              {!debtLoading && debtTx.length > 0 && (
                <Box sx={{ maxHeight: 300, overflowY: "auto" }}>
                  <MUIList dense>
                    {debtTx.map(tx => (
                      <ListItemButton key={tx.id} disableRipple>
                        <ListItemText
                          primary={`${tx.item} • ${formatPeso(tx.total)}`}
                          secondary={(tx.timestamp?.seconds
                            ? new Date(tx.timestamp.seconds * 1000)
                            : new Date()
                          ).toLocaleString()}
                        />
                        <IconButton size="small" sx={{ mr: 1 }} onClick={() => beginEdit(tx)}>
                          <EditIcon fontSize="inherit" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => softDelete(tx)}>
                          <DeleteIcon fontSize="inherit" />
                        </IconButton>
                      </ListItemButton>
                    ))}
                  </MUIList>
                </Box>
              )}
            </>
          )}
        </Paper>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>

      <ConfirmationReasonDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog(p => ({ ...p, open: false }))}
        title={confirmDialog.title}
        message={confirmDialog.message}
        requireReason={confirmDialog.requireReason}
        onConfirm={confirmDialog.onConfirm}
        confirmText={confirmDialog.confirmText}
        confirmColor={confirmDialog.confirmColor}
      />
    </Dialog>
  );
}

/* helper */
function toDateOnlyString(d) {
  const dt = new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}