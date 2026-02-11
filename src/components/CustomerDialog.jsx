import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent,
  TextField, Button, Box, List, ListItemButton, ListItemText,
  Divider, Typography, Stack, IconButton, Paper
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { db } from '../firebase';
import {
  collection, addDoc, query, orderBy, startAt, endAt,
  getDocs, where, serverTimestamp, limit
} from 'firebase/firestore';

/**
 * Props:
 * - open: boolean
 * - onClose: () => void
 * - onSelectCustomer: (customerDoc) => void
 * - user: Firebase user (for createdBy)
 */
export default function CustomerDialog({ open, onClose, onSelectCustomer, user, showSnackbar }) {
  const [search, setSearch] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  // Phone removed
  const [address, setAddress] = useState('');
  const [tin, setTin] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const lowerSearch = useMemo(() => search.trim().toLowerCase(), [search]);
  const lowerUsername = useMemo(() => username.trim().toLowerCase(), [username]);

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

  // Fetch results only after the user starts typing (>=1 char)
  useEffect(() => {
    let cancelled = false;

    const fetch = async () => {
      if (!open || lowerSearch.length === 0) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        // username (stored lowercase) -> case-insensitive
        const qUser = query(
          collection(db, 'customers'),
          orderBy('username'),
          startAt(lowerSearch),
          endAt(`${lowerSearch}\uf8ff`),
          limit(20)
        );

        // fullName variants (best-effort case flexibility)
        const nameQs = nameVariants.map(nv =>
          query(
            collection(db, 'customers'),
            orderBy('fullName'),
            startAt(nv),
            endAt(`${nv}\uf8ff`),
            limit(20)
          )
        );

        const [snapUser, ...nameSnaps] = await Promise.all([getDocs(qUser), ...nameQs.map(q => getDocs(q))]);

        // merge + dedupe
        const map = new Map();
        snapUser.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
        nameSnaps.forEach(snap => snap.forEach(d => map.set(d.id, { id: d.id, ...d.data() })));

        const merged = Array.from(map.values());

        // Prioritize prefix hits, then alpha by username
        merged.sort((a, b) => {
          const aHit =
            (a.username || '').startsWith(lowerSearch) ||
              nameVariants.some(nv => (a.fullName || '').startsWith(nv))
              ? 0 : 1;
          const bHit =
            (b.username || '').startsWith(lowerSearch) ||
              nameVariants.some(nv => (b.fullName || '').startsWith(nv))
              ? 0 : 1;
          if (aHit !== bHit) return aHit - bHit;
          return (a.username || '').localeCompare(b.username || '');
        });

        if (!cancelled) setResults(merged.slice(0, 20));
      } catch (e) {
        if (!cancelled) setResults([]);
        console.error('Customer search error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const t = setTimeout(fetch, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, lowerSearch, nameVariants]);

  const usernameError =
    lowerUsername.length > 0 && /\s/.test(lowerUsername)
      ? 'Username must not contain spaces'
      : '';

  const handleAddAndSelect = async () => {
    try {
      const u = lowerUsername;
      const f = fullName.trim();

      if (!u || !f) {
        showSnackbar?.('Please fill in both Username and Full Name.', 'warning');
        return;
      }
      if (/\s/.test(u)) {
        showSnackbar?.('Username must not contain spaces.', 'warning');
        return;
      }

      // best-effort uniqueness check
      const dupQ = query(collection(db, 'customers'), where('username', '==', u));
      const dupSnap = await getDocs(dupQ);
      if (!dupSnap.empty) {
        showSnackbar?.('That username is already taken. Please choose another.', 'warning');
        return;
      }

      const docRef = await addDoc(collection(db, 'customers'), {
        username: u,                // lowercase for stable search
        fullName: f,
        address: address.trim(),
        tin: tin.trim(),
        createdAt: serverTimestamp(),
        createdBy: user?.email || 'unknown',
      });

      onSelectCustomer?.({
        id: docRef.id,
        username: u,
        fullName: f,
        address: address.trim(),
        tin: tin.trim()
      });
    } catch (e) {
      console.error('Error adding new customer:', e);
      showSnackbar?.('Failed to add new customer.', 'error');
    }
  };

  const handleChoose = (cust) => onSelectCustomer?.(cust);

  const handleClose = () => {
    setSearch('');
    setUsername('');
    setFullName('');
    setAddress('');
    setTin('');
    setResults([]);
    onClose?.();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pr: 6 }}>
        Select or Add Customer
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
            <>
              <Box sx={{ maxHeight: 220, overflowY: 'auto', mt: 1 }}>
                {loading && <Typography variant="body2">Searching…</Typography>}
                {!loading && results.length === 0 && (
                  <Typography variant="body2">No customers found.</Typography>
                )}
                {!loading && results.length > 0 && (
                  <List dense>
                    {results.map((c) => (
                      <ListItemButton key={c.id} onClick={() => handleChoose(c)}>
                        <ListItemText
                          primary={c.fullName || c.username}
                          secondary={c.username && c.fullName ? c.username : undefined}
                        />
                      </ListItemButton>
                    ))}
                  </List>
                )}
              </Box>
            </>
          )}
        </Paper>

        {/* --- ADD NEW CUSTOMER SECTION --- */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 3, opacity: 0.85 }}>
            Add New Customer
          </Typography>

          <TextField
            label="Username (unique, no spaces) *"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            fullWidth
            size="small"
            error={Boolean(usernameError)}
            helperText={usernameError}
            inputProps={{ autoCapitalize: 'none' }}
            sx={{ mb: 3 }}   // was 2 — more space now
          />


          <TextField
            label="Full Name *"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            fullWidth
            size="small"
          />

          <TextField
            label="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            fullWidth
            size="small"
            multiline
            rows={2}
            sx={{ mt: 2 }}
          />

          <TextField
            label="TIN (Tax Identification Number)"
            value={tin}
            onChange={(e) => setTin(e.target.value)}
            fullWidth
            size="small"
            sx={{ mt: 2 }}
          />

          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button
              variant="contained"
              onClick={handleAddAndSelect}
              disabled={!username || !fullName || Boolean(usernameError)}
              sx={{ flex: 1 }}
            >
              ADD AND SELECT
            </Button>
            <Button
              variant="text"
              color="inherit"
              onClick={() => {
                setUsername('');
                setFullName('');
                setAddress('');
                setTin('');
              }}
              size="small"
              sx={{ minWidth: 88 }}
            >
              CLEAR
            </Button>
          </Stack>
        </Paper>
      </DialogContent>
    </Dialog>
  );
}
