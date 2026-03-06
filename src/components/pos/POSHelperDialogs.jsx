import React, { useState, useEffect, useRef } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Typography,
    List, ListItem, ListItemButton, ListItemText, Divider, ListSubheader, IconButton, Box
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { fmtCurrency } from '../../utils/formatters';

const currency = fmtCurrency;

export function VariablePriceDialog({ open, item, onClose, onSubmit }) {
    const [price, setPrice] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        if (open) {
            setPrice('');
            // Auto focus for quick entry
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [open]);

    const handleSumbit = (e) => {
        e.preventDefault();
        const p = Number(price);
        if (p >= 0) {
            onSubmit(p);
        }
    };

    if (!item) return null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <form onSubmit={handleSumbit}>
                <DialogTitle>Enter Price: {item.serviceName}</DialogTitle>
                <DialogContent>
                    {item.pricingNote && (
                        <Typography variant="caption" color="primary" display="block" mb={2}>
                            Hint: {item.pricingNote}
                        </Typography>
                    )}
                    <TextField
                        inputRef={inputRef}
                        autoFocus
                        fullWidth
                        label="Override Price (₱)"
                        type="number"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        required
                        inputProps={{ min: 0, step: 'any' }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={price === '' || Number(price) < 0}>Add to Cart</Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}

export function POSVariantPicker({ open, parentItem, variants, onClose, onSelectVariant }) {

    // Group variants by the group name to match catalog implementation
    const groupedVariants = React.useMemo(() => {
        if (!variants || variants.length === 0) return {};

        const groups = {};
        variants.forEach(v => {
            const groupName = v.variantGroup || 'Other Variations';
            if (!groups[groupName]) groups[groupName] = [];
            groups[groupName].push(v);
        });

        // Try to respect parent's variantGroups ordering if available
        if (parentItem?.variantGroups && Array.isArray(parentItem.variantGroups)) {
            const orderedGroups = {};
            parentItem.variantGroups.forEach(g => {
                if (groups[g]) {
                    orderedGroups[g] = groups[g];
                    delete groups[g];
                }
            });
            // Combine with any leftover groups not in the parent array
            return { ...orderedGroups, ...groups };
        }

        return groups;

    }, [variants, parentItem]);

    if (!parentItem) return null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ m: 0, p: 2, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" fontWeight="bold">Select: {parentItem.serviceName}</Typography>
                <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
            </DialogTitle>
            <DialogContent dividers sx={{ p: 0 }}>
                {Object.keys(groupedVariants).length === 0 ? (
                    <Box p={3} textAlign="center">
                        <Typography color="text.secondary">No active variants available.</Typography>
                    </Box>
                ) : (
                    <List subheader={<li />} sx={{ pt: 0 }}>
                        {Object.entries(groupedVariants).map(([group, vars]) => (
                            <li key={`section-${group}`}>
                                <ul style={{ padding: 0 }}>
                                    <ListSubheader sx={{ bgcolor: 'background.default', fontWeight: 'bold', lineHeight: '36px' }}>
                                        {group}
                                    </ListSubheader>
                                    {vars.map((variant) => (
                                        <ListItem key={variant.id} disablePadding>
                                            <ListItemButton onClick={() => onSelectVariant(variant)}>
                                                <ListItemText
                                                    primary={variant.posLabel || variant.serviceName.replace(parentItem.serviceName, '').trim() || variant.serviceName}
                                                />
                                                <Typography variant="body2" fontWeight="bold">
                                                    {variant.priceType === 'Variable' ? 'Variable' : currency(variant.price || 0)}
                                                </Typography>
                                            </ListItemButton>
                                        </ListItem>
                                    ))}
                                </ul>
                            </li>
                        ))}
                    </List>
                )}
            </DialogContent>
        </Dialog>
    );
}

