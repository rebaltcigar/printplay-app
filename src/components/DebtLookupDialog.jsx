import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent,
  TextField, Button, Box, List, ListItemButton, ListItemText,
  Divider, Typography, Stack, IconButton, Paper
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { db } from '../firebase';
import {
  collection, query, orderBy, startAt, endAt, getDocs, where, limit
} from 'firebase/firestore';

export default function DebtLookupDialog({ open, onClose }) {
  // search + results
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // selection + details
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [debtLoading, setDebtLoading] = useState(false);
  const [debtSummary, setDebtSummary] = useState({ newDebt: 0, paid: 0, balance: 0 });
  const [debtTx, setDebtTx] = useState([]); // recent debt rows

  const lowerSearch = useMemo(() => search.trim().toLowerCase(), [search]);

  // Case variants to make fullName prefix search more forgiving
  const nameVariants = useMemo(() => {
    const raw = search.trim();
    if (!raw) return [];
    const lower = raw.toLowerCase();
    const title = lower.replace(/\b\w/g, c => c.toUpperCase());
    const capFirst = raw.charAt(0).toUpperCase() + raw.slice(1);
    const seen = new Set();
    return [raw, lower, title, capFirst].filter(v => v && !seen.has(v) && seen.add(v));
  }, [search]);

  // Fetch customers only when typing begins
  useEffect(() => {
    let cancelled = false;

    const fetch = async () => {
      if (!open || lowerSearch.length === 0) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const customersCol = collection(db, 'customers');

        const qUser = query(
          customersCol,
          orderBy('username'),
          startAt(lowerSearch),
          endAt(`${lowerSearch}\uf8ff`),
          limit(20)
        );

        const nameQs = nameVariants.map(nv =>
          query(customersCol, orderBy('fullName'), startAt(nv), endAt(`${nv}\uf8ff`), limit(20))
        );

        const [snapUser, ...nameSnaps] = await Promise.all([
          getDocs(qUser),
          ...nameQs.map(q => getDocs(q)),
        ]);

        const map = new Map();
        snapUser.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
        nameSnaps.forEach(snap => snap.forEach(d => map.set(d.id, { id: d.id, ...d.data() })));

        const merged = Array.from(map.values());
        merged.sort((a, b) => (a.username || '').localeCompare(b.username || ''));

        if (!cancelled) setResults(merged.slice(0, 30));
      } catch (e) {
        if (!cancelled) setResults([]);
        console.error('DebtLookup search error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const t = setTimeout(fetch, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, lowerSearch, nameVariants]);

  // Load debt details for a selected customer from transactions
  const loadDebtFor = async (cust) => {
    setSelectedCustomer(cust);
    setDebtLoading(true);
    setDebtSummary({ newDebt: 0, paid: 0, balance: 0 });
    setDebtTx([]);

    try {
      // We assume “transactions” contains both: item === 'New Debt' and item === 'Paid Debt'
      // and each row stores `customerId`, `customerName`, `total`, `isDeleted`
      const txCol = collection(db, 'transactions');

      // Get recent debt-related tx for this customer
      const qRecent = query(
        txCol,
        where('customerId', '==', cust.id),
        where('isDeleted', '==', false),
        // Fetch more than we need and filter in memory for items of interest
        orderBy('timestamp', 'desc'),
        limit(50)
      );

      const snap = await getDocs(qRecent);
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(r => r.item === 'New Debt' || r.item === 'Paid Debt');

      // Summaries
      const newDebt = rows.filter(r => r.item === 'New Debt').reduce((s, r) => s + Number(r.total || 0), 0);
      const paid = rows.filter(r => r.item === 'Paid Debt').reduce((s, r) => s + Number(r.total || 0), 0);
      const balance = newDebt - paid;

      setDebtSummary({ newDebt, paid, balance });
      setDebtTx(rows.slice(0, 20)); // show most recent 20
    } catch (e) {
      console.error('Debt details error:', e);
    } finally {
      setDebtLoading(false);
    }
  };

  const handleClose = () => {
    setSearch('');
    setResults([]);
    setSelectedCustomer(null);
    setDebtTx([]);
    setDebtSummary({ newDebt: 0, paid: 0, balance: 0 });
    onClose?.();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ pr: 6 }}>
        Debt Lookup
        <IconButton
          onClick={handleClose}
          size="small"
          sx={{ position: 'absolute', right: 8, top: 8 }}
          aria-label="close"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 1.5 }}>
        {/* --- SEARCH SECTION --- */}
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 3, opacity: 0.85 }}>
            Search
          </Typography>

          <TextField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
            size="small"
            placeholder="Search by username or name…"
          />

          {search.trim().length > 0 && (
            <Box sx={{ maxHeight: 240, overflowY: 'auto', mt: 1 }}>
              {loading && <Typography variant="body2">Searching…</Typography>}
              {!loading && results.length === 0 && (
                <Typography variant="body2">No customers found.</Typography>
              )}
              {!loading && results.length > 0 && (
                <List dense>
                  {results.map((c) => (
                    <ListItemButton key={c.id} onClick={() => loadDebtFor(c)}>
                      <ListItemText
                        primary={c.fullName || c.username}
                        secondary={c.username && c.fullName ? c.username : undefined}
                      />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </Box>
          )}
        </Paper>

        {/* --- DETAILS SECTION --- */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 3, opacity: 0.85 }}>
            Details
          </Typography>

          {!selectedCustomer && (
            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              Select a customer from the search results to see their debt summary.
            </Typography>
          )}

          {selectedCustomer && (
            <>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                sx={{ mb: 2, alignItems: { xs: 'flex-start', sm: 'center' } }}
              >
                <Box>
                  <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
                    {selectedCustomer.fullName || selectedCustomer.username}
                  </Typography>
                  {selectedCustomer.fullName && selectedCustomer.username && (
                    <Typography variant="body2" sx={{ opacity: 0.8 }}>
                      {selectedCustomer.username}
                    </Typography>
                  )}
                </Box>

                <Box sx={{ flexGrow: 1 }} />

                <Stack direction="row" spacing={3}>
                  <Box>
                    <Typography variant="caption" sx={{ opacity: 0.75 }}>New Debt</Typography>
                    <Typography variant="h6">₱{debtSummary.newDebt.toFixed(2)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ opacity: 0.75 }}>Paid</Typography>
                    <Typography variant="h6">₱{debtSummary.paid.toFixed(2)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ opacity: 0.75 }}>Balance</Typography>
                    <Typography variant="h6" color={debtSummary.balance > 0 ? 'error' : 'success.main'}>
                      ₱{debtSummary.balance.toFixed(2)}
                    </Typography>
                  </Box>
                </Stack>
              </Stack>

              <Divider sx={{ my: 1.5 }} />

              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Recent Debt Transactions
              </Typography>

              {debtLoading && <Typography variant="body2">Loading…</Typography>}
              {!debtLoading && debtTx.length === 0 && (
                <Typography variant="body2" sx={{ opacity: 0.8 }}>No recent debt transactions.</Typography>
              )}

              {!debtLoading && debtTx.length > 0 && (
                <Box sx={{ maxHeight: 280, overflowY: 'auto' }}>
                  <List dense>
                    {debtTx.map(tx => (
                      <ListItemButton key={tx.id} disableRipple>
                        <ListItemText
                          primary={`${tx.item} • ₱${Number(tx.total || 0).toFixed(2)}`}
                          secondary={
                            tx.timestamp?.seconds
                              ? new Date(tx.timestamp.seconds * 1000).toLocaleString()
                              : ''
                          }
                        />
                      </ListItemButton>
                    ))}
                  </List>
                </Box>
              )}
            </>
          )}
        </Paper>
      </DialogContent>
    </Dialog>
  );
}
