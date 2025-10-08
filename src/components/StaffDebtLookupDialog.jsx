// src/components/StaffDebtLookupDialog.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Box, Typography, Stack, IconButton, Paper,
  List as MUIList, ListItemButton, ListItemText, Divider
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import {
  collection, getDocs, onSnapshot, orderBy, query,
  startAt, endAt, where, limit
} from "firebase/firestore";
import { db } from "../firebase";

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
 * - selectToken: number  (increment to force reselect)
 */
export default function StaffDebtLookupDialog({ open, onClose, presetCustomer, selectToken }) {
  // search + results
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // selection + details
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [debtLoading, setDebtLoading] = useState(false);
  const [debtSummary, setDebtSummary] = useState({ newDebt: 0, paid: 0, balance: 0 });
  const [debtTx, setDebtTx] = useState([]);

  // prefer selected; fallback to preset
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
        console.error("StaffDebtLookup search error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = setTimeout(fetch, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, lowerSearch, nameVariants]);

  // realtime for active customer (non-deleted)
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

  const handleClose = () => {
    setSearch(""); setResults([]); setSelectedCustomer(null);
    setDebtTx([]); setDebtSummary({ newDebt: 0, paid: 0, balance: 0 });
    onClose?.();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ pr: 6 }}>
        Debt Lookup (Read-only)
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
              Select a customer from the search results, or open this from another table row.
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

              <Typography variant="subtitle2" sx={{ mb: 1 }}>Recent Debt Transactions</Typography>
              {debtLoading && <Typography variant="body2">Loading…</Typography>}
              {!debtLoading && debtTx.length === 0 && <Typography variant="body2" sx={{ opacity: 0.8 }}>No recent debt transactions.</Typography>}

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
    </Dialog>
  );
}