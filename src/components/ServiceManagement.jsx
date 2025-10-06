import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Paper,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot, where, getDocs
} from 'firebase/firestore';
import { db } from '../firebase';

export default function ServiceManagement() {
  const [services, setServices] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ serviceName: '', price: '', sortOrder: '', active: true });

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    const q = query(collection(db, 'services'), orderBy('sortOrder'));
    const unsub = onSnapshot(q, snap => {
      setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const resetAndOpen = () => {
    setEditing(null);
    setForm({ serviceName: '', price: '', sortOrder: services.length + 1, active: true });
    setOpen(true);
  };

  const startEdit = (svc) => {
    setEditing(svc);
    setForm({
      serviceName: svc.serviceName || '',
      price: Number(svc.price || 0),
      sortOrder: Number(svc.sortOrder || 0),
      active: Boolean(svc.active ?? true),
    });
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setEditing(null);
  };

  const onChange = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    const name = String(form.serviceName || '').trim();
    const price = Number(form.price);
    const sortOrder = Number(form.sortOrder);
    const active = Boolean(form.active);

    if (!name) return alert('Service name is required.');
    if (Number.isNaN(price)) return alert('Price must be a number.');
    if (Number.isNaN(sortOrder)) return alert('Sort order must be a number.');

    // prevent duplicate names (best-effort)
    const qDup = query(collection(db, 'services'), where('serviceName', '==', name));
    const dup = await getDocs(qDup);
    const isEditingSameName = editing && editing.serviceName === name;
    if (!isEditingSameName && !dup.empty) {
      return alert('A service with that name already exists.');
    }

    try {
      if (editing) {
        await updateDoc(doc(db, 'services', editing.id), { serviceName: name, price, sortOrder, active });
      } else {
        await addDoc(collection(db, 'services'), { serviceName: name, price, sortOrder, active });
      }
      close();
    } catch (e) {
      console.error('Save service failed:', e);
      alert('Failed to save service.');
    }
  };

  const remove = async (svc) => {
    if (!window.confirm(`Delete "${svc.serviceName}"?`)) return;
    try {
      await deleteDoc(doc(db, 'services', svc.id));
    } catch (e) {
      console.error('Delete service failed:', e);
      alert('Failed to delete service.');
    }
  };

  const activeCount = useMemo(() => services.filter(s => s.active).length, [services]);

  return (
    <Box sx={{ width: '100%' }}>
      {/* ---- WEB / DESKTOP (unchanged) ---- */}
      <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h5">Services</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={resetAndOpen}>
            Add Service
          </Button>
        </Stack>

        <Card>
          <CardContent>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {activeCount}/{services.length} services active
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width="40%">Name</TableCell>
                    <TableCell width="20%" align="right">Price</TableCell>
                    <TableCell width="20%" align="right">Sort</TableCell>
                    <TableCell width="10%" align="center">Active</TableCell>
                    <TableCell width="10%" align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {services.map((svc) => (
                    <TableRow key={svc.id} hover>
                      <TableCell>{svc.serviceName}</TableCell>
                      <TableCell align="right">₱{Number(svc.price || 0).toFixed(2)}</TableCell>
                      <TableCell align="right">{svc.sortOrder}</TableCell>
                      <TableCell align="center">{svc.active ? 'Yes' : 'No'}</TableCell>
                      <TableCell align="center">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => startEdit(svc)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={() => remove(svc)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {services.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Typography variant="body2" sx={{ opacity: 0.7 }}>
                          No services yet. Click “Add Service”.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Box>

      {/* ---- MOBILE (compact, scroll-friendly) ---- */}
      <Box
        sx={{
          display: { xs: 'block', sm: 'none' },
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          pb: 'calc(env(safe-area-inset-bottom, 0) + 8px)',
        }}
      >
        <Card sx={{ p: 2, mb: 1.25 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle1" fontWeight={600}>Services</Typography>
            <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={resetAndOpen}>
              Add
            </Button>
          </Stack>
          <Divider sx={{ my: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {activeCount}/{services.length} active
          </Typography>
        </Card>

        <Paper sx={{ p: 0, overflow: 'hidden' }}>
          <TableContainer
            sx={{
              maxHeight: 520,
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              borderRadius: 1,
            }}
          >
            <Table
              stickyHeader
              size="small"
              sx={{
                '& th, & td': { py: 0.6, px: 0.9, borderBottomWidth: 0.5 },
                '& thead th': { fontSize: '0.72rem', whiteSpace: 'nowrap' },
                '& tbody td': { fontSize: '0.86rem' },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell align="right">₱</TableCell>
                  <TableCell align="right">Sort</TableCell>
                  <TableCell align="center">Active</TableCell>
                  <TableCell align="right">⋯</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {services.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography variant="body2" sx={{ opacity: 0.7 }}>
                        No services yet. Tap “Add”.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  services.map((svc) => (
                    <TableRow key={svc.id} hover sx={{ '& td': { verticalAlign: 'middle' } }}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {svc.serviceName}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{Number(svc.price || 0).toFixed(0)}</TableCell>
                      <TableCell align="right">{svc.sortOrder}</TableCell>
                      <TableCell align="center">{svc.active ? 'Yes' : 'No'}</TableCell>
                      <TableCell align="right">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => startEdit(svc)}>
                            <EditIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={() => remove(svc)}>
                            <DeleteIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>

      {/* Add / Edit Dialog */}
      <Dialog
        open={open}
        onClose={close}
        fullWidth
        maxWidth="sm"
        fullScreen={isMobile}   // mobile: full-screen dialog for better typing
      >
        <DialogTitle>{editing ? 'Edit Service' : 'Add Service'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              label="Service Name"
              value={form.serviceName}
              onChange={(e) => onChange('serviceName', e.target.value)}
              fullWidth
              autoFocus
              size={isMobile ? 'small' : 'medium'}
            />
            <TextField
              label="Price"
              type="number"
              value={form.price}
              onChange={(e) => onChange('price', e.target.value)}
              fullWidth
              size={isMobile ? 'small' : 'medium'}
            />
            <TextField
              label="Sort Order"
              type="number"
              value={form.sortOrder}
              onChange={(e) => onChange('sortOrder', e.target.value)}
              fullWidth
              size={isMobile ? 'small' : 'medium'}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.active}
                  onChange={(e) => onChange('active', e.target.checked)}
                />
              }
              label="Active"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Cancel</Button>
          <Button variant="contained" onClick={save}>
            {editing ? 'Save Changes' : 'Add Service'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
