import React, { useEffect, useMemo, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  Box, Button, Card, CardContent, Checkbox, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem,
  Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography, Tabs, Tab,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ReorderIcon from '@mui/icons-material/Reorder';
import SaveIcon from '@mui/icons-material/Save';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, query, onSnapshot, writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import ConfirmationReasonDialog from './ConfirmationReasonDialog';

export default function ItemManagement({ showSnackbar }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [view, setView] = useState('all');
  const [form, setForm] = useState({
    serviceName: '', price: '', active: true,
    category: 'Debit', parentServiceId: null, adminOnly: false,
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

  useEffect(() => {
    const q = query(collection(db, 'services'));
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

  const filteredItems = useMemo(() => {
    if (view === 'all') return sortedAndGroupedItems;
    const categoryToShow = view === 'services' ? 'Debit' : 'Credit';
    return sortedAndGroupedItems.filter(item => item.category === categoryToShow);
  }, [sortedAndGroupedItems, view]);

  const resetAndOpen = () => {
    setEditing(null);
    setForm({
      serviceName: '', price: '', active: true,
      category: 'Debit', parentServiceId: null, adminOnly: false,
    });
    setOpen(true);
  };

  const startEdit = (item) => {
    setEditing(item);
    setForm({
      serviceName: item.serviceName || '', price: Number(item.price || 0),
      active: Boolean(item.active ?? true), category: item.category || 'Debit',
      parentServiceId: item.parentServiceId || null,
      adminOnly: Boolean(item.adminOnly ?? false),
    });
    setOpen(true);
  };

  const close = () => setOpen(false);

  const handleParentChange = (event) => {
    const parentId = event.target.value;
    if (parentId) {
      const parent = itemMap.get(parentId);
      setForm(prev => ({ ...prev, parentServiceId: parentId, category: parent.category }));
    } else {
      setForm(prev => ({ ...prev, parentServiceId: null }));
    }
  };

  const onChange = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    const payload = {
      serviceName: String(form.serviceName).trim(), price: Number(form.price || 0),
      active: Boolean(form.active), category: String(form.category),
      parentServiceId: form.parentServiceId || null,
      adminOnly: Boolean(form.adminOnly),
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
      showSnackbar?.('Item saved successfully!', 'success');
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
        <Typography variant="h5">Services & Item Types</Typography>
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

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={view} onChange={(e, newValue) => setView(newValue)} indicatorColor={editOrderMode ? 'secondary' : 'primary'}>
          <Tab label="All" value="all" disabled={editOrderMode} />
          <Tab label="Services" value="services" disabled={editOrderMode} />
          <Tab label="Expenses" value="expenses" disabled={editOrderMode} />
        </Tabs>
      </Box>

      <Card>
        <CardContent>
          <TableContainer>
            <DragDropContext onDragEnd={onDragEnd}>
              <Table size="small" sx={{ tableLayout: 'fixed' }}>
                <TableHead>
                  <TableRow>
                    {editOrderMode && <TableCell sx={{ width: 40 }} />}
                    <TableCell>Name</TableCell>
                    <TableCell sx={{ width: '15%' }}>Price</TableCell>
                    <TableCell sx={{ width: '20%' }}>Category</TableCell>
                    <TableCell align="center" sx={{ width: '10%' }}>Admin</TableCell>
                    <TableCell align="center" sx={{ width: '10%' }}>Active</TableCell>
                    <TableCell align="center" sx={{ width: '15%' }}>{editOrderMode ? 'Sort' : 'Actions'}</TableCell>
                  </TableRow>
                </TableHead>
                <Droppable droppableId="items">
                  {(provided) => (
                    <TableBody ref={provided.innerRef} {...provided.droppableProps}>
                      {filteredItems.map((item, index) => (
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
                              <TableCell>{item.price > 0 ? Number(item.price).toFixed(2) : '—'}</TableCell>
                              <TableCell>{item.category}</TableCell>
                              <TableCell align="center" sx={{ fontWeight: 'bold' }}>{item.adminOnly ? '✓' : ''}</TableCell>
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
              <InputLabel>Parent Item (Optional)</InputLabel>
              <Select value={form.parentServiceId || ''} label="Parent Item (Optional)" onChange={handleParentChange}>
                <MenuItem value=""><em>None (This is a top-level item)</em></MenuItem>
                {items.filter(i => !i.parentServiceId).map(p => <MenuItem key={p.id} value={p.id}>{p.serviceName}</MenuItem>)}
              </Select>
            </FormControl>

            <TextField label="Item Name" value={form.serviceName} onChange={(e) => onChange('serviceName', e.target.value)} fullWidth autoFocus />
            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select value={form.category} label="Category" onChange={(e) => onChange('category', e.target.value)} disabled={!!form.parentServiceId}>
                <MenuItem value="Debit">Debit (Service)</MenuItem>
                <MenuItem value="Credit">Credit (Expense)</MenuItem>
              </Select>
            </FormControl>

            <TextField label="Price" type="number" value={form.price} onChange={(e) => onChange('price', e.target.value)} />

            <FormControlLabel control={<Checkbox checked={form.active} onChange={(e) => onChange('active', e.target.checked)} />} label="Active" />
            <FormControlLabel control={<Checkbox checked={form.adminOnly} onChange={(e) => onChange('adminOnly', e.target.checked)} />} label="Admin Only (staff cannot see this item)" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Cancel</Button>
          <Button variant="contained" onClick={save}>Save</Button>
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