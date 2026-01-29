import React, { useEffect, useMemo, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  Box, Button, Card, CardContent, Checkbox, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem,
  Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ReorderIcon from '@mui/icons-material/Reorder';
import SaveIcon from '@mui/icons-material/Save';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot, writeBatch
} from 'firebase/firestore';
import { db } from '../../firebase';
import ConfirmationReasonDialog from '../ConfirmationReasonDialog';

export default function ServiceCatalog({ showSnackbar }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  // Form State
  const [form, setForm] = useState({
    serviceName: '',
    price: '',
    active: true,
    category: 'Debit', // Always Debit for Catalog
    parentServiceId: null,
    adminOnly: false,
    type: 'service',
    costPrice: '',
    trackStock: false,
    stockCount: 0,
    lowStockThreshold: 5
  });

  const [editOrderMode, setEditOrderMode] = useState(false);
  const [orderedItems, setOrderedItems] = useState([]);

  // Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: '',
    message: '',
    requireReason: false,
    onConfirm: () => { },
    confirmText: 'Confirm',
    confirmColor: 'error'
  });

  // Load ONLY Debit items (Services/Retail)
  useEffect(() => {
    const q = query(collection(db, 'services'), where('category', '==', 'Debit'));
    const unsub = onSnapshot(q, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const itemMap = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);

  const sortedAndGroupedItems = useMemo(() => {
    const sourceItems = editOrderMode ? orderedItems : items;
    const topLevelItems = sourceItems.filter(i => !i.parentServiceId).sort((a, b) => a.sortOrder - b.sortOrder);
    const childrenMap = sourceItems.reduce((acc, item) => {
      if (item.parentServiceId) {
        if (!acc[item.parentServiceId]) acc[item.parentServiceId] = [];
        acc[item.parentServiceId].push(item);
      }
      return acc;
    }, {});

    for (const parentId in childrenMap) {
      childrenMap[parentId].sort((a, b) => a.sortOrder - b.sortOrder);
    }

    const result = [];
    topLevelItems.forEach(parent => {
      result.push(parent);
      if (childrenMap[parent.id]) {
        result.push(...childrenMap[parent.id]);
      }
    });

    return result;
  }, [items, editOrderMode, orderedItems]);

  const resetAndOpen = () => {
    setEditing(null);
    setForm({
      serviceName: '', price: '', active: true,
      category: 'Debit', parentServiceId: null, adminOnly: false,
      type: 'service', costPrice: '', trackStock: false, stockCount: 0, lowStockThreshold: 5
    });
    setOpen(true);
  };

  const startEdit = (item) => {
    setEditing(item);
    setForm({
      serviceName: item.serviceName || '',
      price: Number(item.price || 0),
      active: Boolean(item.active ?? true),
      category: 'Debit',
      parentServiceId: item.parentServiceId || null,
      adminOnly: Boolean(item.adminOnly ?? false),
      type: item.type || 'service',
      costPrice: item.costPrice || '',
      trackStock: Boolean(item.trackStock),
      stockCount: item.stockCount || 0,
      lowStockThreshold: item.lowStockThreshold || 5,
    });
    setOpen(true);
  };

  const close = () => setOpen(false);

  const handleParentChange = (event) => {
    const parentId = event.target.value;
    if (parentId) {
      // const parent = itemMap.get(parentId); // No longer needed as all are Debit here
      setForm(prev => ({ ...prev, parentServiceId: parentId }));
    } else {
      setForm(prev => ({ ...prev, parentServiceId: null }));
    }
  };

  const onChange = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    const payload = {
      serviceName: String(form.serviceName).trim(),
      price: Number(form.price || 0),
      active: Boolean(form.active),
      category: 'Debit',
      parentServiceId: form.parentServiceId || null,
      adminOnly: Boolean(form.adminOnly),
      // Fields
      type: form.type,
      costPrice: Number(form.costPrice || 0),
      trackStock: Boolean(form.trackStock),
      stockCount: Number(form.stockCount || 0),
      lowStockThreshold: Number(form.lowStockThreshold || 0),
    };
    if (!payload.serviceName) {
      showSnackbar?.('Item name is required.', 'error');
      return;
    }

    try {
      if (editing) {
        await updateDoc(doc(db, 'services', editing.id), payload);
      } else {
        let maxSortOrder = 0;
        if (payload.parentServiceId) {
          const children = items.filter(i => i.parentServiceId === payload.parentServiceId);
          maxSortOrder = children.reduce((max, item) => Math.max(max, item.sortOrder || 0), 0);
        } else {
          const topLevelItems = items.filter(i => !i.parentServiceId);
          maxSortOrder = topLevelItems.reduce((max, item) => Math.max(max, item.sortOrder || 0), 0);
        }
        payload.sortOrder = maxSortOrder + 1;
        await addDoc(collection(db, 'services'), payload);
      }
      close();
      showSnackbar?.('Catalog item saved!', 'success');
    } catch (e) {
      console.error('Save item failed:', e);
      showSnackbar?.('Failed to save item.', 'error');
    }
  };

  const remove = (item) => {
    const childrenToDelete = items.filter(i => i.parentServiceId === item.id);

    let message = `Are you sure you want to permanently delete "${item.serviceName}"?`;
    if (childrenToDelete.length > 0) {
      message += ` This will also delete its ${childrenToDelete.length} sub-item(s).`;
    }

    setConfirmDialog({
      open: true,
      title: "Delete Item",
      message: message,
      requireReason: false,
      confirmText: "Delete Permanently",
      confirmColor: "error",
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);
          const parentRef = doc(db, 'services', item.id);
          batch.delete(parentRef);
          childrenToDelete.forEach(child => {
            batch.delete(doc(db, 'services', child.id));
          });
          await batch.commit();
          showSnackbar?.('Item deleted successfully.', 'success');
        } catch (e) {
          console.error("Failed to delete item:", e);
          showSnackbar?.('Failed to delete item.', 'error');
        }
      }
    });
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;

    const reordered = Array.from(orderedItems);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);

    const movedItem = reordered[result.destination.index];
    const itemBefore = reordered[result.destination.index - 1];

    if (movedItem.parentServiceId !== (itemBefore?.parentServiceId || null)) {
      if (itemBefore && itemBefore.parentServiceId && !movedItem.parentServiceId) {
        showSnackbar?.("Cannot move a parent item into a child group.", 'warning');
        return;
      }
    }

    setOrderedItems(reordered);
  };

  const startReorder = () => {
    setOrderedItems(sortedAndGroupedItems);
    setEditOrderMode(true);
  };

  const saveReorder = async () => {
    const batch = writeBatch(db);
    const groupCounters = {};

    orderedItems.forEach((item) => {
      const groupId = item.parentServiceId || 'toplevel';
      if (groupCounters[groupId] === undefined) {
        groupCounters[groupId] = 0;
      }
      groupCounters[groupId]++;

      const docRef = doc(db, 'services', item.id);
      batch.update(docRef, { sortOrder: groupCounters[groupId] });
    });

    try {
      await batch.commit();
      showSnackbar?.('New order saved!', 'success');
      setEditOrderMode(false);
    } catch (e) {
      console.error("Failed to save new order:", e);
      showSnackbar?.("Error saving new order.", 'error');
    }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5">Service & Product Catalog</Typography>
          <Typography variant="body2" color="text.secondary">Manage items available for sale in POS.</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          {editOrderMode ? (
            <>
              <Button variant="outlined" onClick={() => setEditOrderMode(false)}>Cancel</Button>
              <Button variant="contained" startIcon={<SaveIcon />} onClick={saveReorder}>Save Order</Button>
            </>
          ) : (
            <>
              <Button variant="outlined" startIcon={<ReorderIcon />} onClick={startReorder}>Edit Order</Button>
              <Button variant="contained" startIcon={<AddIcon />} onClick={resetAndOpen}>Add Item</Button>
            </>
          )}
        </Stack>
      </Stack>

      <Card>
        <CardContent>
          <TableContainer>
            <DragDropContext onDragEnd={onDragEnd}>
              <Table size="small" sx={{ tableLayout: 'fixed' }}>
                <TableHead>
                  <TableRow>
                    {editOrderMode && <TableCell sx={{ width: 40 }} />}
                    <TableCell>Name</TableCell>
                    <TableCell sx={{ width: '12%' }}>Type</TableCell>
                    <TableCell sx={{ width: '12%' }}>Price</TableCell>
                    {/* Cost/Stock is arguably less important here if we use Inventory Tab, but good for quick view */}
                    <TableCell sx={{ width: '10%' }}>Stock</TableCell>
                    <TableCell align="center" sx={{ width: '8%' }}>Active</TableCell>
                    <TableCell align="center" sx={{ width: '12%' }}>{editOrderMode ? 'Sort' : 'Actions'}</TableCell>
                  </TableRow>
                </TableHead>
                <Droppable droppableId="items">
                  {(provided) => (
                    <TableBody ref={provided.innerRef} {...provided.droppableProps}>
                      {sortedAndGroupedItems.map((item, index) => (
                        <Draggable key={item.id} draggableId={item.id} index={index} isDragDisabled={!editOrderMode}>
                          {(provided, snapshot) => (
                            <TableRow
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              style={{ ...provided.draggableProps.style, backgroundColor: snapshot.isDragging ? '#e3f2fd' : 'transparent' }}
                              hover
                            >
                              {editOrderMode && <TableCell><ReorderIcon sx={{ cursor: 'grab', opacity: 0.5 }} /></TableCell>}
                              <TableCell sx={{ pl: item.parentServiceId ? 4 : 2, fontWeight: item.parentServiceId ? 400 : 600 }}>{item.serviceName}</TableCell>
                              <TableCell>
                                <span style={{
                                  textTransform: 'uppercase', fontSize: '0.75rem',
                                  padding: '2px 6px', borderRadius: 4,
                                  background: item.type === 'retail' ? '#e8f5e9' : '#e3f2fd',
                                  color: item.type === 'retail' ? '#2e7d32' : '#1565c0'
                                }}>
                                  {item.type || 'service'}
                                </span>
                              </TableCell>
                              <TableCell>{item.price > 0 ? Number(item.price).toFixed(2) : '—'}</TableCell>
                              <TableCell>
                                {item.trackStock ? (
                                  <span style={{ color: item.stockCount <= (item.lowStockThreshold || 0) ? 'red' : 'inherit', fontWeight: 'bold' }}>
                                    {item.stockCount}
                                  </span>
                                ) : <span style={{ opacity: 0.5 }}>—</span>}
                              </TableCell>
                              <TableCell align="center" sx={{ fontWeight: 'bold' }}>{item.active ? '✓' : ''}</TableCell>
                              <TableCell align="center">
                                {editOrderMode ? <Typography variant="caption">{item.sortOrder}</Typography> : (
                                  <>
                                    <IconButton size="small" onClick={() => startEdit(item)}><EditIcon fontSize="small" /></IconButton>
                                    <IconButton size="small" color="error" onClick={() => remove(item)}><DeleteIcon fontSize="small" /></IconButton>
                                  </>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </TableBody>
                  )}
                </Droppable>
              </Table>
            </DragDropContext>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? 'Edit Item' : 'Add Item'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Parent Item (For grouping)</InputLabel>
              <Select value={form.parentServiceId || ''} label="Parent Item (For grouping)" onChange={handleParentChange}>
                <MenuItem value=""><em>None (Top Level)</em></MenuItem>
                {items.filter(i => !i.parentServiceId).map(p => <MenuItem key={p.id} value={p.id}>{p.serviceName}</MenuItem>)}
              </Select>
            </FormControl>

            <TextField label="Item Name" value={form.serviceName} onChange={(e) => onChange('serviceName', e.target.value)} fullWidth autoFocus />

            <Stack direction="row" spacing={2}>
              <TextField label="Price (Retail)" type="number" fullWidth value={form.price} onChange={(e) => onChange('price', e.target.value)} />
              {/* Cost Price is hidden here, manage it in Inventory */}
            </Stack>

            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select value={form.type} label="Type" onChange={(e) => onChange('type', e.target.value)}>
                <MenuItem value="service">Service (Labor/Time)</MenuItem>
                <MenuItem value="retail">Retail (Physical Good)</MenuItem>
              </Select>
            </FormControl>

            {form.type === 'retail' && (
              <Card variant="outlined" sx={{ p: 2, bgcolor: '#f9f9f9' }}>
                <Typography variant="subtitle2" gutterBottom>Quick Inventory Setup</Typography>
                <Typography variant="caption" display="block" mb={1} color="text.secondary">
                  Use Inventory Tab for full management (Restocking, Audits).
                </Typography>
                <FormControlLabel control={<Checkbox checked={form.trackStock} onChange={(e) => onChange('trackStock', e.target.checked)} />} label="Track Stock Levels" />

                {form.trackStock && (
                  <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                    <TextField label="Initial Stock" type="number" fullWidth size="small" value={form.stockCount} onChange={(e) => onChange('stockCount', e.target.value)} />
                    <TextField label="Low Stock Alert" type="number" fullWidth size="small" value={form.lowStockThreshold} onChange={(e) => onChange('lowStockThreshold', e.target.value)} />
                  </Stack>
                )}
              </Card>
            )}

            <FormControlLabel control={<Checkbox checked={form.active} onChange={(e) => onChange('active', e.target.checked)} />} label="Active (Show in POS)" />
            <FormControlLabel control={<Checkbox checked={form.adminOnly} onChange={(e) => onChange('adminOnly', e.target.checked)} />} label="Admin Allowed Only" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Cancel</Button>
          <Button variant="contained" onClick={save}>Save Catalog Item</Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation Dialog */}
      <ConfirmationReasonDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        requireReason={confirmDialog.requireReason}
        confirmText={confirmDialog.confirmText}
        confirmColor={confirmDialog.confirmColor}
      />
    </Box>
  );
}