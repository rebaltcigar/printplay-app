import React from 'react';
import {
    Box, Typography, TextField, Stack, FormControl, InputLabel, Select, MenuItem, Button, Collapse, Autocomplete
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

const POSEntryPanel = ({
    posView,
    manualEntryOpen,
    setManualEntryOpen,
    item,
    setItem,
    expenseType,
    setExpenseType,
    expenseStaffEmail,
    setExpenseStaffEmail,
    expenseStaffId,
    setExpenseStaffId,
    expenseStaffName,
    setExpenseStaffName,
    staffOptions,
    notes,
    setNotes,
    quantity,
    setQuantity,
    price,
    setPrice,
    handleAddEntry,
    handleItemChange,
    services,
    expenseServiceItems,
    quantityInputRef,
    priceInputRef
}) => {
    const isClassic = posView === 'legacy';

    const renderContent = () => (
        <Box sx={{ p: isClassic ? 1.5 : 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* Header for classic */}
            {isClassic && (
                <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1.5, fontSize: '0.65rem', display: 'block', mb: 0.75 }}>
                    Add to Order
                </Typography>
            )}

            {/* Contextual: Expense type + staff */}
            {item === 'Expenses' && (
                <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                    <FormControl fullWidth size="small">
                        <InputLabel>Type</InputLabel>
                        <Select value={expenseType} label="Type" onChange={e => setExpenseType(e.target.value)}>
                            {expenseServiceItems.map(e => <MenuItem key={e.id} value={e.serviceName}>{e.serviceName}</MenuItem>)}
                        </Select>
                    </FormControl>
                    {(expenseType === 'Salary' || expenseType === 'Salary Advance') && (
                        <FormControl fullWidth size="small">
                            <InputLabel>Staff</InputLabel>
                            <Select value={expenseStaffEmail} label="Staff" onChange={e => {
                                const s = staffOptions.find(o => o.email === e.target.value);
                                if (s) {
                                    setExpenseStaffEmail(s.email);
                                    setExpenseStaffId(s.id);
                                    if (setExpenseStaffName) setExpenseStaffName(s.fullName);
                                }
                            }}>
                                {staffOptions.map(s => <MenuItem key={s.id} value={s.email}>{s.fullName}</MenuItem>)}
                            </Select>
                        </FormControl>
                    )}
                </Stack>
            )}

            {/* Notes for expenses — shown above main row */}
            {item === 'Expenses' && (
                <TextField
                    label="Notes"
                    size="small"
                    fullWidth
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    sx={{ mb: 1 }}
                />
            )}

            {/* Main row: Item | Qty | Price | Add */}
            <Stack direction="row" spacing={1} alignItems="flex-start">
                <Autocomplete
                    sx={{ flex: 3 }}
                    size="small"
                    freeSolo
                    options={[...new Set([...services.map(s => s.serviceName), "Expenses"])]}
                    value={item}
                    onChange={(e, newVal) => handleItemChange({ target: { value: newVal || '' } })}
                    renderInput={(params) => <TextField {...params} label="Item / Service" placeholder="Search or type..." />}
                />
                <TextField
                    label="Qty"
                    type="number"
                    size="small"
                    inputRef={quantityInputRef}
                    sx={{ flex: 1, minWidth: 60 }}
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    disabled={!item}
                    onKeyDown={e => e.key === 'Enter' && handleAddEntry()}
                />
                <TextField
                    label="Price"
                    type="number"
                    size="small"
                    inputRef={priceInputRef}
                    sx={{ flex: 1, minWidth: 70 }}
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    disabled={!item}
                    onKeyDown={e => e.key === 'Enter' && handleAddEntry()}
                />
                <Button
                    variant="contained"
                    size="small"
                    onClick={handleAddEntry}
                    disabled={!item || !quantity || !price}
                    sx={{ height: 40, px: 2, whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                    {item === 'Expenses' ? 'Log' : 'Add'}
                </Button>
            </Stack>
        </Box>
    );

    if (isClassic) return <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.default' }}>{renderContent()}</Box>;

    return (
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Box
                p={1}
                bgcolor="background.default"
                display="flex"
                alignItems="center"
                sx={{ cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setManualEntryOpen(o => !o)}
            >
                <AddIcon sx={{ mr: 1, opacity: 0.6, fontSize: '1.2rem' }} />
                <Typography variant="body2" fontWeight="bold" color="text.primary" sx={{ flex: 1 }}>Manual Entry / Misc</Typography>
                {manualEntryOpen
                    ? <ExpandLessIcon fontSize="small" sx={{ opacity: 0.4 }} />
                    : <ExpandMoreIcon fontSize="small" sx={{ opacity: 0.4 }} />}
            </Box>
            <Collapse in={manualEntryOpen}>
                {renderContent()}
            </Collapse>
        </Box>
    );
};

export default POSEntryPanel;
