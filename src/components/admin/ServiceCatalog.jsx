import React, { useMemo, useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  Box, Button, Card, CardContent, Checkbox, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem,
  Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Tooltip, Typography
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import ReorderIcon from '@mui/icons-material/Reorder';
import SaveIcon from '@mui/icons-material/Save';
import CategoryIcon from '@mui/icons-material/Category';
import StoreIcon from '@mui/icons-material/Store';
import AssignmentIcon from '@mui/icons-material/Assignment';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import { supabase } from '../../supabase';
import ConfirmationReasonDialog from '../ConfirmationReasonDialog';
import PageHeader from '../common/PageHeader';
import SummaryCards from '../common/SummaryCards';
import { fmtCurrency, fmtDate } from '../../utils/formatters';
import { POS_ICON_OPTIONS } from '../../utils/posIcons.jsx';
import { generateUUID } from '../../utils/uuid';


const BLANK_FORM = {
  serviceName: '', price: '', active: true,
  adminOnly: false, type: 'service', costPrice: '',
  trackStock: false, stockCount: 0, lowStockThreshold: 5,
  hasVariants: false, posIcon: '', priceType: 'fixed', pricingNote: '',
  consumables: [], // Array of { itemId: string, qty: number }
};

const BLANK_VARIANT_FORM = {
  serviceName: '', variantGroup: '', posLabel: '',
  priceType: 'fixed', price: '', pricingNote: '', active: true,
};

export default function ServiceCatalog({ showSnackbar }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);

  // Variant inline management
  const [variantAddOpen, setVariantAddOpen] = useState(false);
  const [variantAddForm, setVariantAddForm] = useState(BLANK_VARIANT_FORM);
  const [editingVariantId, setEditingVariantId] = useState(null);
  const [variantEditForm, setVariantEditForm] = useState({});

  // Group management
  const [newGroupName, setNewGroupName] = useState('');

  const [editOrderMode, setEditOrderMode] = useState(false);
  const [orderedItems, setOrderedItems] = useState([]);

  const [confirmDialog, setConfirmDialog] = useState({
    open: false, title: '', message: '', requireReason: false,
    onConfirm: () => { }, confirmText: 'Confirm', confirmColor: 'error'
  });

  useEffect(() => {
    const channel = supabase
      .channel('products-sale-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'products',
        filter: 'category=eq.Sale',
      }, () => {
        // Reload on any change
        supabase.from('products').select('*').eq('category', 'Sale')
          .then(({ data }) => {
            if (data) setItems(data);
          });
      })
      .subscribe();

    // Initial load
    supabase.from('products').select('*').eq('category', 'Sale')
      .then(({ data }) => {
        if (data) setItems(data);
      });

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Live view of the editing parent doc (reactive — updates when items changes)
  const editingParent = useMemo(() =>
    editing && !editing.parent_service_id ? items.find(i => i.id === editing.id) : null,
    [items, editing]
  );

  const variantChildren = useMemo(() =>
    editing
      ? items.filter(i => i.parent_service_id === editing.id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      : [],
    [items, editing]
  );

  // Canonical groups: defined on parent doc first (in stored order), then infer from children
  const allGroups = useMemo(() => {
    const defined = editingParent?.variantGroups || [];
    const result = [...defined];
    variantChildren.forEach(c => {
      if (c.variantGroup && !result.includes(c.variantGroup)) result.push(c.variantGroup);
    });
    return result;
  }, [editingParent, variantChildren]);

  // Groups for editing a child opened via table Edit button
  const parentGroupsForChild = useMemo(() => {
    if (!editing?.parent_service_id) return [];
    const parentDoc = items.find(i => i.id === editing.parent_service_id);
    const defined = parentDoc?.variantGroups || [];
    const result = [...defined];
    items.filter(i => i.parent_service_id === editing.parent_service_id).forEach(s => {
      if (s.variantGroup && !result.includes(s.variantGroup)) result.push(s.variantGroup);
    });
    return result;
  }, [editing, items]);

  const itemMap = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);

  const sortedAndGroupedItems = useMemo(() => {
    const source = editOrderMode ? orderedItems : items;
    const top = source.filter(i => !i.parent_service_id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const childMap = source.reduce((acc, item) => {
      if (item.parent_service_id) {
        if (!acc[item.parent_service_id]) acc[item.parent_service_id] = [];
        acc[item.parent_service_id].push(item);
      }
      return acc;
    }, {});
    for (const pid in childMap) childMap[pid].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const result = [];
    top.forEach(parent => {
      result.push(parent);
      if (childMap[parent.id]) result.push(...childMap[parent.id]);
    });
    return result;
  }, [items, editOrderMode, orderedItems]);

  const summaryCards = useMemo(() => {
    const total = items.length;
    const services = items.filter(i => i.category === 'service').length;
    const retail = items.filter(i => i.category === 'retail').length;
    const inactive = items.filter(i => !i.active).length;
    return [
      { label: 'Total Items', value: String(total), icon: <CategoryIcon />, color: 'primary.main', highlight: true },
      { label: 'Services', value: String(services), icon: <AssignmentIcon />, color: 'info.main' },
      { label: 'Retail Goods', value: String(retail), icon: <StoreIcon />, color: 'success.main' },
      { label: 'Inactive', value: String(inactive), icon: <VisibilityOffIcon />, color: inactive > 0 ? 'warning.main' : 'text.secondary' },
    ];
  }, [items]);

  const onChange = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const isEditingChild = Boolean(editing?.parent_service_id);
  // Two-pane layout only when editing an existing variant parent
  const isTwoPane = form.hasVariants && !isEditingChild && Boolean(editing);

  const closeDialog = () => {
    setOpen(false);
    setEditing(null);
    setForm(BLANK_FORM);
    setVariantAddOpen(false);
    setVariantAddForm(BLANK_VARIANT_FORM);
    setEditingVariantId(null);
    setVariantEditForm({});
    setNewGroupName('');
  };

  const openAdd = () => {
    setEditing(null);
    setForm(BLANK_FORM);
    setVariantAddOpen(false);
    setVariantAddForm(BLANK_VARIANT_FORM);
    setEditingVariantId(null);
    setNewGroupName('');
    setOpen(true);
  };

  const startEdit = (item) => {
    setEditing(item);
    setForm({
      serviceName: item.name || '',
      price: Number(item.price || 0),
      active: Boolean(item.active ?? true),
      adminOnly: Boolean(item.admin_only ?? false),
      type: item.category || 'service',
      costPrice: item.cost_price || '',
      trackStock: Boolean(item.track_stock),
      stockCount: item.stock_count || 0,
      lowStockThreshold: item.low_stock_threshold || 5,
      hasVariants: Boolean(item.has_variants),
      posIcon: item.pos_icon || '',
      priceType: item.price_type || (item.price > 0 ? 'fixed' : 'variable'),
      pricingNote: item.pricing_note || '',
      variantGroup: item.variant_group || '',
      posLabel: item.pos_label || '',
      parent_service_id: item.parent_service_id || null,
      consumables: item.consumables || [],
    });
    setVariantAddOpen(false);
    setVariantAddForm(BLANK_VARIANT_FORM);
    setEditingVariantId(null);
    setNewGroupName('');
    setOpen(true);
  };

  // ── Group management ──

  const addGroup = async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const current = editingParent?.variantGroups || [];
    if (current.includes(trimmed)) {
      showSnackbar?.('Group already exists.', 'info');
      return;
    }
    try {
      const { error } = await supabase.from('products').update({ variantGroups: [...current, trimmed] }).eq('id', editing.id);
      if (error) throw error;
      setNewGroupName('');
    } catch (e) {
      showSnackbar?.('Failed to add group.', 'error');
    }
  };

  const removeGroup = async (name) => {
    const inGroup = variantChildren.filter(c => c.variantGroup === name);
    if (inGroup.length > 0) {
      showSnackbar?.(`"${name}" has ${inGroup.length} variant(s). Reassign or delete them first.`, 'warning');
      return;
    }
    const current = editingParent?.variantGroups || [];
    try {
      const { error } = await supabase.from('products').update({ variantGroups: current.filter(g => g !== name) }).eq('id', editing.id);
      if (error) throw error;
    } catch (e) {
      showSnackbar?.('Failed to remove group.', 'error');
    }
  };

  // ── Save item ──

  const save = async () => {
    const isVariantParent = Boolean(form.hasVariants) && !isEditingChild;
    const payload = {
      name: String(form.serviceName).trim(),
      price: isVariantParent ? 0 : Number(form.price || 0),
      active: Boolean(form.active),
      category: 'Sale',
      parent_service_id: isEditingChild ? editing.parent_service_id : null,
      admin_only: Boolean(form.adminOnly),
      financial_category: isVariantParent ? 'Service' : (form.type === 'service' ? 'Service' : 'Retail'),
      cost_price: Number(form.costPrice || 0),
      track_stock: Boolean(form.trackStock),
      stock_count: Number(form.stockCount || 0),
      low_stock_threshold: Number(form.lowStockThreshold || 0),
      has_variants: isVariantParent,
      pos_icon: isEditingChild ? '' : (form.posIcon || ''),
      price_type: form.priceType || 'fixed',
      pricing_note: form.pricingNote?.trim() || '',
      variant_group: isEditingChild ? (form.variantGroup?.trim() || '') : '',
      pos_label: isEditingChild ? (form.posLabel?.trim() || '') : '',
      consumables: form.consumables || [],
    };
    if (!payload.name) {
      showSnackbar?.('Item name is required.', 'error');
      return;
    }
    if (!isVariantParent && payload.priceType === 'fixed' && payload.price <= 0) {
      showSnackbar?.('Fixed price must be greater than 0. Use Variable if the price is entered at POS.', 'error');
      return;
    }
    try {
      if (editing) {
        const { error } = await supabase.from('products').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const topLevel = items.filter(i => !i.parent_service_id);
        const maxSort = topLevel.reduce((m, i) => Math.max(m, i.sort_order || 0), 0);
        payload.sort_order = maxSort + 1;
          const newId = generateUUID();
        const { data: newData, error } = await supabase.from('products').insert([{ id: newId, ...payload }]).select().single();
        if (error) throw error;
        if (isVariantParent) {
          // Reopen in edit mode — two-pane activates so admin can add groups + variants
          setEditing({ id: newId, ...payload });
          showSnackbar?.('Item saved! Define groups and add variants.', 'success');
          return;
        }
      }
      closeDialog();
      showSnackbar?.('Catalog item saved!', 'success');
    } catch (e) {
      console.error('Save item failed:', e);
      showSnackbar?.('Failed to save item.', 'error');
    }
  };

  // ── Variant CRUD ──

  const saveVariant = async () => {
    if (!variantAddForm.serviceName.trim()) {
      showSnackbar?.('Variant name is required.', 'error');
      return;
    }
    if (variantAddForm.priceType === 'fixed' && Number(variantAddForm.price || 0) <= 0) {
      showSnackbar?.('Fixed price must be greater than 0.', 'error');
      return;
    }
    const siblings = items.filter(i => i.parent_service_id === editing.id);
    const maxSort = siblings.reduce((m, i) => Math.max(m, i.sort_order || 0), 0);
    try {
      const { error } = await supabase.from('products').insert([{
        id: generateUUID(),
        name: variantAddForm.serviceName.trim(),
        price: variantAddForm.priceType === 'variable' ? 0 : Number(variantAddForm.price || 0),
        active: variantAddForm.active,
        category: 'Sale',
        parent_service_id: editing.id,
        admin_only: false,
        financial_category: editing.financial_category || 'Service',
        cost_price: 0, track_stock: false, stock_count: 0, low_stock_threshold: 5,
        has_variants: false,
        variant_group: variantAddForm.variantGroup,
        pos_label: variantAddForm.posLabel.trim(),
        pos_icon: '',
        price_type: variantAddForm.priceType,
        pricing_note: variantAddForm.pricingNote.trim(),
        sort_order: maxSort + 1,
      }]);
      if (error) throw error;
      setVariantAddForm(BLANK_VARIANT_FORM);
      setVariantAddOpen(false);
      showSnackbar?.('Variant added!', 'success');
    } catch (e) {
      showSnackbar?.('Failed to add variant.', 'error');
    }
  };

  const saveVariantEdit = async () => {
    if (variantEditForm.priceType === 'fixed' && Number(variantEditForm.price || 0) <= 0) {
      showSnackbar?.('Fixed price must be greater than 0.', 'error');
      return;
    }
    try {
      const { error } = await supabase.from('products').update({
        name: variantEditForm.serviceName.trim(),
        price: variantEditForm.priceType === 'variable' ? 0 : Number(variantEditForm.price || 0),
        active: variantEditForm.active,
        variant_group: variantEditForm.variantGroup,
        pos_label: variantEditForm.posLabel.trim(),
        price_type: variantEditForm.priceType,
        pricing_note: variantEditForm.pricingNote.trim(),
      }).eq('id', editingVariantId);
      if (error) throw error;
      setEditingVariantId(null);
      setVariantEditForm({});
      showSnackbar?.('Variant updated!', 'success');
    } catch (e) {
      showSnackbar?.('Failed to update variant.', 'error');
    }
  };

  const startEditVariant = (child) => {
    setEditingVariantId(child.id);
    setVariantEditForm({
      serviceName: child.name || '',
      variantGroup: child.variantGroup || '',
      posLabel: child.posLabel || '',
      priceType: child.priceType || 'fixed',
      price: child.price || '',
      pricingNote: child.pricingNote || '',
      active: Boolean(child.active ?? true),
    });
    setVariantAddOpen(false);
  };

  const removeVariant = (variant) => {
    setConfirmDialog({
      open: true, title: 'Delete Variant',
      message: `Delete "${variant.name}"? This cannot be undone.`,
      requireReason: false, confirmText: 'Delete', confirmColor: 'error',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('products').delete().eq('id', variant.id);
          if (error) throw error;
          if (editingVariantId === variant.id) setEditingVariantId(null);
          showSnackbar?.('Variant deleted.', 'success');
        } catch (e) {
          showSnackbar?.('Failed to delete variant.', 'error');
        }
      }
    });
  };

  const remove = (item) => {
    const children = items.filter(i => i.parent_service_id === item.id);
    let message = `Delete "${item.name}"?`;
    if (children.length > 0) message += ` This will also delete its ${children.length} variant(s).`;
    setConfirmDialog({
      open: true, title: 'Delete Item', message,
      requireReason: false, confirmText: 'Delete Permanently', confirmColor: 'error',
      onConfirm: async () => {
        try {
          const idsToDelete = [item.id, ...children.map(c => c.id)];
          const { error } = await supabase.from('products').delete().in('id', idsToDelete);
          if (error) throw error;
          showSnackbar?.('Item deleted.', 'success');
        } catch (e) {
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
    if (movedItem.parent_service_id !== (itemBefore?.parent_service_id || null)) {
      if (itemBefore?.parent_service_id && !movedItem.parent_service_id) {
        showSnackbar?.('Cannot move a parent item into a child group.', 'warning');
        return;
      }
    }
    setOrderedItems(reordered);
  };

  const startReorder = () => { setOrderedItems(sortedAndGroupedItems); setEditOrderMode(true); };

  const saveReorder = async () => {
    const counters = {};
    const updates = orderedItems.map(item => {
      const gid = item.parent_service_id || 'toplevel';
      counters[gid] = (counters[gid] || 0) + 1;
      return supabase.from('products').update({ sort_order: counters[gid] }).eq('id', item.id);
    });
    try {
      await Promise.all(updates);
      showSnackbar?.('New order saved!', 'success');
      setEditOrderMode(false);
    } catch (e) {
      showSnackbar?.('Error saving order.', 'error');
    }
  };

  // ── Group Select helper ──
  const GroupSelect = ({ value, onChange: onChangeFn, groups }) => (
    <FormControl size="small" fullWidth>
      <InputLabel>Group</InputLabel>
      <Select value={value} label="Group" onChange={e => onChangeFn(e.target.value)}>
        <MenuItem value=""><em>No group</em></MenuItem>
        {groups.map(g => <MenuItem key={g} value={g}>{g}</MenuItem>)}
      </Select>
      {groups.length === 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          Add groups in the panel on the right first
        </Typography>
      )}
    </FormControl>
  );

  // ── Left pane: item settings form ──
  const renderItemForm = () => (
    <Stack spacing={2.5}>
      <TextField
        label="Item Name"
        value={form.serviceName}
        onChange={(e) => onChange('serviceName', e.target.value)}
        fullWidth autoFocus
      />

      {!isEditingChild && (
        <Box sx={{
          p: 2, bgcolor: 'action.hover', borderRadius: 1, border: '1px solid',
          borderColor: form.hasVariants ? 'primary.main' : 'divider'
        }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={Boolean(form.hasVariants)}
                onChange={(e) => onChange('hasVariants', e.target.checked)}
              />
            }
            label={
              <Box>
                <Typography variant="body2" fontWeight="bold">Has Variants</Typography>
                <Typography variant="caption" color="text.secondary">
                  Cashiers pick a variant at POS (e.g., B&W, Color, Size). Not sold directly.
                </Typography>
              </Box>
            }
          />
          {form.hasVariants && !editing && (
            <Typography variant="caption" color="primary" sx={{ display: 'block', mt: 1, pl: 4 }}>
              Save the item first, then add groups and variants.
            </Typography>
          )}
        </Box>
      )}

      {isEditingChild && (
        <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" gutterBottom sx={{ mb: 1.5 }}>VARIANT SETTINGS</Typography>
          <Stack spacing={2}>
            {parentGroupsForChild.length > 0
              ? (
                <FormControl fullWidth size="small">
                  <InputLabel>Group</InputLabel>
                  <Select value={form.variantGroup} label="Group"
                    onChange={(e) => onChange('variantGroup', e.target.value)}>
                    <MenuItem value=""><em>No group</em></MenuItem>
                    {parentGroupsForChild.map(g => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                  </Select>
                </FormControl>
              ) : (
                <TextField label="Variant Group" fullWidth size="small"
                  placeholder="e.g., B&W, Color, Size"
                  helperText="Section header inside the picker at POS"
                  value={form.variantGroup}
                  onChange={(e) => onChange('variantGroup', e.target.value)}
                />
              )
            }
            <TextField label="POS Label (Short Name)" fullWidth size="small"
              placeholder="e.g., B&W Short, Color A4"
              helperText="Short tile label in picker. Falls back to item name."
              value={form.posLabel}
              onChange={(e) => onChange('posLabel', e.target.value)}
            />
          </Stack>
        </Box>
      )}

      {!form.hasVariants && (
        <>
          <Stack direction="row" spacing={2}>
            <FormControl fullWidth>
              <InputLabel>Price Type</InputLabel>
              <Select value={form.priceType || 'fixed'} label="Price Type"
                onChange={(e) => onChange('priceType', e.target.value)}>
                <MenuItem value="fixed">Fixed — pre-fills at POS</MenuItem>
                <MenuItem value="variable">Variable — cashier enters price</MenuItem>
              </Select>
            </FormControl>
            {form.priceType !== 'variable' && (
              <TextField label="Price" type="number" fullWidth
                value={form.price}
                onChange={(e) => onChange('price', e.target.value)}
              />
            )}
          </Stack>
          {form.priceType === 'variable' && (
            <TextField label="Pricing Note (shown to cashier)" fullWidth
              placeholder="e.g., ₱5–₱20 depending on content"
              value={form.pricingNote}
              onChange={(e) => onChange('pricingNote', e.target.value)}
            />
          )}
        </>
      )}

      {!isEditingChild && (
        <FormControl fullWidth>
          <InputLabel>Type</InputLabel>
          <Select value={form.type} label="Type" onChange={(e) => onChange('type', e.target.value)}>
            <MenuItem value="service">Service (Labor / Time)</MenuItem>
            <MenuItem value="retail">Retail (Physical Good)</MenuItem>
          </Select>
        </FormControl>
      )}

      {!isEditingChild && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            POS Icon{form.posIcon ? ` — ${POS_ICON_OPTIONS.find(o => o.value === form.posIcon)?.label ?? ''}` : ' — None'}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {/* None option */}
            <Tooltip title="None" placement="top">
              <IconButton
                size="small"
                onClick={() => onChange('posIcon', '')}
                sx={{
                  width: 40, height: 40, borderRadius: 1, border: '1px solid',
                  borderColor: !form.posIcon ? 'primary.main' : 'divider',
                  bgcolor: !form.posIcon ? 'primary.main' : 'transparent',
                  color: !form.posIcon ? 'primary.contrastText' : 'text.disabled',
                  fontSize: '0.75rem', fontWeight: 700,
                  '&:hover': { bgcolor: !form.posIcon ? 'primary.dark' : 'action.hover' },
                }}
              >
                —
              </IconButton>
            </Tooltip>
            {POS_ICON_OPTIONS.map(({ value, label, Icon }) => (
              <Tooltip key={value} title={label} placement="top">
                <IconButton
                  size="small"
                  onClick={() => onChange('posIcon', value)}
                  sx={{
                    width: 40, height: 40, borderRadius: 1, border: '1px solid',
                    borderColor: form.posIcon === value ? 'primary.main' : 'divider',
                    bgcolor: form.posIcon === value ? 'primary.main' : 'transparent',
                    color: form.posIcon === value ? 'primary.contrastText' : 'text.secondary',
                    '&:hover': { bgcolor: form.posIcon === value ? 'primary.dark' : 'action.hover' },
                  }}
                >
                  <Icon fontSize="small" />
                </IconButton>
              </Tooltip>
            ))}
          </Box>
        </Box>
      )}

      {form.type === 'retail' && !isEditingChild && (
        <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" gutterBottom>INVENTORY SETTINGS</Typography>
          <FormControlLabel
            control={<Checkbox checked={form.trackStock} onChange={(e) => onChange('trackStock', e.target.checked)} />}
            label="Track Stock Levels"
          />
          {form.trackStock && (
            <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
              <TextField label="Current Stock" type="number" fullWidth size="small"
                value={form.stockCount}
                onChange={(e) => onChange('stockCount', e.target.value)}
              />
              <TextField label="Low Stock Alert" type="number" fullWidth size="small"
                value={form.lowStockThreshold}
                onChange={(e) => onChange('lowStockThreshold', e.target.value)}
              />
            </Stack>
          )}
        </Box>
      )}

      {/* Linked Consumables Section */}
      {!isEditingChild && !form.hasVariants && (
        <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" gutterBottom>LINKED CONSUMABLES</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            Items that are automatically deducted from stock when this service is sold (e.g., Paper, Ink).
          </Typography>

          <Stack spacing={1.5}>
            {(form.consumables || []).map((cons, idx) => {
              const baseItem = items.find(i => i.id === cons.itemId);
              return (
                <Stack key={cons.itemId} direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" sx={{ flex: 1 }}>{baseItem?.name || 'Unknown Item'}</Typography>
                  <TextField
                    size="small"
                    label="Qty used"
                    type="number"
                    value={cons.qty}
                    onChange={(e) => {
                      const newCons = [...form.consumables];
                      newCons[idx].qty = Number(e.target.value);
                      onChange('consumables', newCons);
                    }}
                    sx={{ width: 80 }}
                  />
                  <IconButton size="small" color="error" onClick={() => {
                    const newCons = form.consumables.filter((_, i) => i !== idx);
                    onChange('consumables', newCons);
                  }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              );
            })}

            <Divider />

            <Stack direction="row" spacing={1}>
              <FormControl fullWidth size="small">
                <InputLabel>Add Consumable...</InputLabel>
                <Select
                  value=""
                  label="Add Consumable..."
                  onChange={(e) => {
                    const itemId = e.target.value;
                    if (form.consumables.some(c => c.itemId === itemId)) return;
                    onChange('consumables', [...(form.consumables || []), { itemId, qty: 1 }]);
                  }}
                >
                  {items
                    .filter(i => i.category === 'retail' && i.id !== editing?.id)
                    .map(i => <MenuItem key={i.id} value={i.id}>{i.name}</MenuItem>)
                  }
                </Select>
              </FormControl>
            </Stack>
          </Stack>
        </Box>
      )}

      <Stack direction="row" spacing={2}>
        <FormControlLabel
          control={<Checkbox checked={form.active} onChange={(e) => onChange('active', e.target.checked)} />}
          label="Active (Show in POS)"
        />
        {!isEditingChild && (
          <FormControlLabel
            control={<Checkbox checked={form.adminOnly} onChange={(e) => onChange('adminOnly', e.target.checked)} />}
            label="Admin Only"
          />
        )}
      </Stack>
    </Stack>
  );

  // ── Right pane: groups + variants management ──
  const renderVariantsPane = () => {
    const displayGroups = [];
    const seen = new Set();
    allGroups.forEach(g => {
      if (variantChildren.some(c => (c.variantGroup || '') === g)) {
        seen.add(g); displayGroups.push(g);
      }
    });
    variantChildren.forEach(c => {
      const g = c.variantGroup || '';
      if (!seen.has(g)) { seen.add(g); displayGroups.push(g); }
    });

    return (
      <Stack spacing={0} sx={{ height: '100%' }}>

        {/* Groups section */}
        <Box sx={{ pb: 2, borderBottom: '1px solid', borderColor: 'divider', mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 700 }}>
            Groups
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            Define group names here. The Group field on variants is a dropdown from this list — no free typing, no typos.
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5, minHeight: 28, alignItems: 'center' }}>
            {allGroups.length === 0
              ? <Typography variant="caption" color="text.disabled">No groups defined yet</Typography>
              : allGroups.map(g => (
                <Chip key={g} label={g} size="small" onDelete={() => removeGroup(g)} variant="outlined" color="primary" />
              ))
            }
          </Box>
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              placeholder="Group name (e.g., B&W, Color, Size)"
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGroup(newGroupName); } }}
              sx={{ flex: 1 }}
            />
            <Button size="small" variant="outlined" onClick={() => addGroup(newGroupName)} disabled={!newGroupName.trim()}>
              Add Group
            </Button>
          </Stack>
        </Box>

        {/* Variants list */}
        <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Variants <Typography component="span" variant="body2" color="text.secondary">({variantChildren.length})</Typography>
          </Typography>
          <Button size="small" startIcon={<AddIcon />}
            onClick={() => { setVariantAddOpen(true); setEditingVariantId(null); }}
            disabled={variantAddOpen}>
            Add Variant
          </Button>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto', pr: 0.5 }}>
          {variantChildren.length === 0 && !variantAddOpen && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              No variants yet. Click "Add Variant" to get started.
            </Typography>
          )}

          {displayGroups.map(group => (
            <Box key={group || '__ungrouped__'} sx={{ mb: 2 }}>
              {group && (
                <Typography variant="caption" color="text.secondary"
                  sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 0.5, fontWeight: 600 }}>
                  {group}
                </Typography>
              )}
              {variantChildren.filter(c => (c.variantGroup || '') === group).map(child => (
                editingVariantId === child.id
                  ? (
                    <Box key={child.id} sx={{ p: 1.5, mb: 0.5, bgcolor: 'action.selected', borderRadius: 1 }}>
                      <Stack spacing={1.5}>
                        <TextField size="small" label="Name" fullWidth autoFocus
                          value={variantEditForm.serviceName}
                          onChange={e => setVariantEditForm(p => ({ ...p, serviceName: e.target.value }))}
                        />
                        <GroupSelect
                          value={variantEditForm.variantGroup}
                          onChange={v => setVariantEditForm(p => ({ ...p, variantGroup: v }))}
                          groups={allGroups}
                        />
                        <Stack direction="row" spacing={1}>
                          <FormControl size="small" fullWidth>
                            <InputLabel>Price Type</InputLabel>
                            <Select value={variantEditForm.priceType} label="Price Type"
                              onChange={e => setVariantEditForm(p => ({ ...p, priceType: e.target.value }))}>
                              <MenuItem value="fixed">Fixed</MenuItem>
                              <MenuItem value="variable">Variable</MenuItem>
                            </Select>
                          </FormControl>
                          {variantEditForm.priceType === 'fixed' && (
                            <TextField size="small" label="Price" type="number" fullWidth
                              value={variantEditForm.price}
                              onChange={e => setVariantEditForm(p => ({ ...p, price: e.target.value }))}
                            />
                          )}
                        </Stack>
                        {variantEditForm.priceType === 'variable' && (
                          <TextField size="small" label="Pricing Note" fullWidth placeholder="e.g., ₱5–₱20"
                            value={variantEditForm.pricingNote}
                            onChange={e => setVariantEditForm(p => ({ ...p, pricingNote: e.target.value }))}
                          />
                        )}
                        <TextField size="small" label="POS Label (optional)" fullWidth
                          value={variantEditForm.posLabel}
                          onChange={e => setVariantEditForm(p => ({ ...p, posLabel: e.target.value }))}
                        />
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <FormControlLabel
                            control={<Checkbox size="small" checked={variantEditForm.active}
                              onChange={e => setVariantEditForm(p => ({ ...p, active: e.target.checked }))} />}
                            label="Active"
                          />
                          <Stack direction="row" spacing={1}>
                            <Button size="small" onClick={() => setEditingVariantId(null)}>Cancel</Button>
                            <Button size="small" variant="contained" onClick={saveVariantEdit}>Save</Button>
                          </Stack>
                        </Stack>
                      </Stack>
                    </Box>
                  ) : (
                    <Box key={child.id} sx={{
                      display: 'flex', alignItems: 'center', px: 1, py: 0.75,
                      borderRadius: 1, '&:hover': { bgcolor: 'action.hover' }
                    }}>
                      <Box flex={1} minWidth={0}>
                        <Typography variant="body2" noWrap>{child.name}</Typography>
                        {child.posLabel && (
                          <Typography variant="caption" color="text.secondary" noWrap>{child.posLabel}</Typography>
                        )}
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ mx: 1.5, whiteSpace: 'nowrap' }}>
                        {child.priceType === 'variable' ? 'variable' : fmtCurrency(child.price)}
                      </Typography>
                      <Typography variant="caption" sx={{ mr: 0.5, color: child.active ? 'success.main' : 'text.disabled' }}>
                        {child.active ? 'Active' : 'Off'}
                      </Typography>
                      <IconButton size="small" onClick={() => startEditVariant(child)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => removeVariant(child)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  )
              ))}
            </Box>
          ))}

          {/* Add variant form */}
          {variantAddOpen && (
            <Box sx={{ p: 1.5, mt: 0.5, border: '1px dashed', borderColor: 'primary.main', borderRadius: 1 }}>
              <Typography variant="caption" color="primary" sx={{ mb: 1.5, display: 'block', fontWeight: 600 }}>
                NEW VARIANT
              </Typography>
              <Stack spacing={1.5}>
                <TextField size="small" label="Name" fullWidth autoFocus
                  value={variantAddForm.serviceName}
                  onChange={e => setVariantAddForm(p => ({ ...p, serviceName: e.target.value }))}
                />
                <GroupSelect
                  value={variantAddForm.variantGroup}
                  onChange={v => setVariantAddForm(p => ({ ...p, variantGroup: v }))}
                  groups={allGroups}
                />
                <Stack direction="row" spacing={1}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Price Type</InputLabel>
                    <Select value={variantAddForm.priceType} label="Price Type"
                      onChange={e => setVariantAddForm(p => ({ ...p, priceType: e.target.value }))}>
                      <MenuItem value="fixed">Fixed</MenuItem>
                      <MenuItem value="variable">Variable</MenuItem>
                    </Select>
                  </FormControl>
                  {variantAddForm.priceType === 'fixed' && (
                    <TextField size="small" label="Price" type="number" fullWidth
                      value={variantAddForm.price}
                      onChange={e => setVariantAddForm(p => ({ ...p, price: e.target.value }))}
                    />
                  )}
                </Stack>
                {variantAddForm.priceType === 'variable' && (
                  <TextField size="small" label="Pricing Note" fullWidth placeholder="e.g., ₱5–₱20"
                    value={variantAddForm.pricingNote}
                    onChange={e => setVariantAddForm(p => ({ ...p, pricingNote: e.target.value }))}
                  />
                )}
                <TextField size="small" label="POS Label (optional)" fullWidth
                  helperText="Falls back to item name if blank"
                  value={variantAddForm.posLabel}
                  onChange={e => setVariantAddForm(p => ({ ...p, posLabel: e.target.value }))}
                />
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <FormControlLabel
                    control={<Checkbox size="small" checked={variantAddForm.active}
                      onChange={e => setVariantAddForm(p => ({ ...p, active: e.target.checked }))} />}
                    label="Active"
                  />
                  <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={() => { setVariantAddOpen(false); setVariantAddForm(BLANK_VARIANT_FORM); }}>
                      Cancel
                    </Button>
                    <Button size="small" variant="contained" onClick={saveVariant}>Add</Button>
                  </Stack>
                </Stack>
              </Stack>
            </Box>
          )}
        </Box>
      </Stack>
    );
  };

  // ── Dialog title ──
  const dialogTitle = editing
    ? (isEditingChild
      ? `Edit Variant — ${itemMap.get(editing.parent_service_id)?.name ?? ''}`
      : `Edit: ${editing.name}`)
    : 'Add New Catalog Item';
  const dialogSubtitle = editing
    ? (isEditingChild
      ? `Variant of: ${itemMap.get(editing.parent_service_id)?.name ?? '—'}`
      : isTwoPane ? 'Item settings on the left · Groups and variants on the right' : 'Service or retail product')
    : 'Configure a new service or retail product';

  return (
    <Box>
      <PageHeader
        title="Service & Product Catalog"
        subtitle="Manage items available for sale in POS."
        actions={
          <Stack direction="row" spacing={1}>
            {editOrderMode ? (
              <>
                <Button variant="outlined" onClick={() => setEditOrderMode(false)}>Cancel</Button>
                <Button variant="contained" startIcon={<SaveIcon />} onClick={saveReorder}>Save Order</Button>
              </>
            ) : (
              <>
                <Button variant="outlined" startIcon={<ReorderIcon />} onClick={startReorder}>Edit Order</Button>
                <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>Add Item</Button>
              </>
            )}
          </Stack>
        }
      />

      <SummaryCards cards={summaryCards} sx={{ mb: 3 }} />

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
                              <TableCell sx={{ pl: item.parent_service_id ? 4 : 2, fontWeight: item.parent_service_id ? 400 : 600 }}>
                                <Box display="flex" alignItems="center" gap={1}>
                                  {item.name}
                                  {item.has_variants && (
                                    <Tooltip title={`${sortedAndGroupedItems.filter(i => i.parent_service_id === item.id).length} variant(s) — click Edit to manage`}>
                                      <Chip
                                        size="small"
                                        icon={<AccountTreeIcon sx={{ fontSize: '0.75rem !important' }} />}
                                        label={sortedAndGroupedItems.filter(i => i.parent_service_id === item.id).length}
                                        sx={{ height: 18, fontSize: '0.7rem', '& .MuiChip-label': { px: 0.75 } }}
                                        variant="outlined" color="primary"
                                      />
                                    </Tooltip>
                                  )}
                                  {item.variantGroup && (
                                    <Chip size="small" label={item.variantGroup}
                                      sx={{ height: 18, fontSize: '0.7rem', '& .MuiChip-label': { px: 0.75 }, opacity: 0.7 }}
                                      variant="outlined"
                                    />
                                  )}
                                </Box>
                              </TableCell>
                              <TableCell>
                                <span style={{
                                  textTransform: 'uppercase', fontSize: '0.75rem',
                                  padding: '2px 6px', borderRadius: 4,
                                  background: item.category === 'retail' ? '#e8f5e9' : '#e3f2fd',
                                  color: item.category === 'retail' ? '#2e7d32' : '#1565c0'
                                }}>
                                  {item.category || 'service'}
                                </span>
                              </TableCell>
                              <TableCell>
                                {item.has_variants
                                  ? <span style={{ opacity: 0.4, fontSize: '0.75rem' }}>varies</span>
                                  : item.price_type === 'variable' || (!item.price_type && item.price === 0)
                                    ? <span style={{ opacity: 0.6, fontSize: '0.75rem' }}>variable</span>
                                    : item.price > 0 ? fmtCurrency(item.price) : '—'
                                }
                              </TableCell>
                              <TableCell>
                                {item.track_stock
                                  ? <span style={{ color: item.stock_count <= (item.low_stock_threshold || 0) ? 'red' : 'inherit', fontWeight: 'bold' }}>{item.stock_count}</span>
                                  : <span style={{ opacity: 0.5 }}>—</span>
                                }
                              </TableCell>
                              <TableCell align="center" sx={{ fontWeight: 'bold' }}>{item.active ? '✓' : ''}</TableCell>
                              <TableCell align="center">
                                {editOrderMode
                                  ? <Typography variant="caption">{item.sort_order}</Typography>
                                  : (
                                    <>
                                      <IconButton size="small" onClick={() => startEdit(item)}><EditIcon fontSize="small" /></IconButton>
                                      <IconButton size="small" color="error" onClick={() => remove(item)}><DeleteIcon fontSize="small" /></IconButton>
                                    </>
                                  )
                                }
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

      {/* ── Edit / Add Dialog ── */}
      <Dialog
        open={open}
        onClose={closeDialog}
        maxWidth={isTwoPane ? 'lg' : 'sm'}
        fullWidth
        PaperProps={{ sx: { height: isTwoPane ? '85vh' : 'auto', maxHeight: '90vh', display: 'flex', flexDirection: 'column' } }}
      >
        {/* Header */}
        <DialogTitle sx={{ pb: 1, flexShrink: 0 }}>
          <Box display="flex" alignItems="flex-start" justifyContent="space-between">
            <Box>
              <Typography variant="h6" fontWeight={700}>{dialogTitle}</Typography>
              <Typography variant="body2" color="text.secondary">{dialogSubtitle}</Typography>
            </Box>
            <IconButton onClick={closeDialog} size="small" sx={{ mt: 0.25 }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </DialogTitle>
        <Divider />

        {/* Content */}
        <DialogContent sx={{ p: 0, flex: 1, overflow: 'hidden', display: 'flex' }}>
          {isTwoPane ? (
            // Two-pane layout for variant parents
            <>
              {/* Left: item settings */}
              <Box sx={{
                width: '42%', minWidth: 0, overflowY: 'auto',
                px: 3, py: 3,
                borderRight: '1px solid', borderColor: 'divider',
              }}>
                <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                  Item Settings
                </Typography>
                {renderItemForm()}
              </Box>

              {/* Right: groups + variants */}
              <Box sx={{
                flex: 1, minWidth: 0, overflowY: 'auto',
                px: 3, py: 3, display: 'flex', flexDirection: 'column',
              }}>
                <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                  Variant Management
                </Typography>
                {renderVariantsPane()}
              </Box>
            </>
          ) : (
            // Single-column layout for simple items and variant children
            <Box sx={{ overflowY: 'auto', px: 3, py: 3, width: '100%' }}>
              {renderItemForm()}
            </Box>
          )}
        </DialogContent>

        <Divider />
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button variant="contained" onClick={save}>
            {editing ? 'Save Changes' : 'Save Item'}
          </Button>
        </DialogActions>
      </Dialog>

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
