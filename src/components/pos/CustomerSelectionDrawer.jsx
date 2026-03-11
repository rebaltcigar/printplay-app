import React, { useState, useEffect } from 'react';
import { Box, Button, Typography, Stack, Divider, CircularProgress } from '@mui/material';
import DetailDrawer from '../common/DetailDrawer';
import CustomerSearchAutocomplete from './CustomerSearchAutocomplete';
import CustomerForm from '../common/CustomerForm';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { createCustomer } from "../../services/customerService";

export default function CustomerSelectionDrawer({ open, onClose, currentCustomer, onSelectCustomer }) {
    const [view, setView] = useState('search'); // 'search' or 'create'
    const [formData, setFormData] = useState({
        fullName: '',
        username: '',
        password: '123',
        email: '',
        phone: '',
        address: '',
        tin: ''
    });
    const [saving, setSaving] = useState(false);

    // Reset state when drawer opens
    useEffect(() => {
        if (open) {
            setView('search');
            setFormData({ fullName: '', username: '', password: '123', email: '', phone: '', address: '', tin: '' });
        }
    }, [open]);

    const handleCreateNew = () => {
        setView('create');
    };

    const handleBackToSearch = () => {
        setView('search');
    };

    const handleSaveNewCustomer = async () => {
        if (!formData.fullName.trim()) return;

        setSaving(true);
        try {
            const finalData = {
                email: formData.email,
                phone: formData.phone,
                address: formData.address.trim(),
                tin: formData.tin.trim(),
                full_name: formData.fullName.trim(),
            };

            // Member-specific logic if username is provided
            if (formData.username.trim()) {
                finalData.username = formData.username.trim().toLowerCase();
                finalData.minutes_remaining = 0;
                finalData.force_password_change = true;
            }

            const newCust = await createCustomer(finalData);
            onSelectCustomer(newCust);
            onClose();
        } catch (err) {
            console.error(err);
            alert("Failed to create customer");
        } finally {
            setSaving(false);
        }
    };

    return (
        <DetailDrawer
            open={open}
            onClose={onClose}
            title={view === 'create' ? "New Customer Profile" : "Customer Selection"}
            subtitle={view === 'create' ? "Fill in the details to register" : "Attach a named customer to this order"}
            actions={view === 'create' ? (
                <>
                    <Button onClick={handleBackToSearch} disabled={saving}>Back</Button>
                    <Button
                        variant="contained"
                        onClick={handleSaveNewCustomer}
                        disabled={saving || !formData.fullName.trim()}
                    >
                        {saving ? <CircularProgress size={24} /> : "Save & Select"}
                    </Button>
                </>
            ) : null}
        >
            <Stack spacing={3} sx={{ mt: 1 }}>
                {view === 'search' ? (
                    <>
                        <Box>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                Search Existing Customer
                            </Typography>
                            <CustomerSearchAutocomplete
                                label="Customer Name, Phone, or TIN"
                                value={currentCustomer}
                                onChange={(newVal) => {
                                    if (newVal?.isNew) {
                                        setFormData(prev => ({ ...prev, fullName: newVal.fullName || '' }));
                                        setView('create');
                                    } else if (newVal) {
                                        onSelectCustomer(newVal);
                                        onClose();
                                    }
                                }}
                            />
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Divider sx={{ flex: 1 }} />
                            <Typography variant="body2" color="text.secondary">OR</Typography>
                            <Divider sx={{ flex: 1 }} />
                        </Box>

                        <Box sx={{ textAlign: 'center' }}>
                            <Button
                                variant="outlined"
                                color="primary"
                                fullWidth
                                startIcon={<PersonAddIcon />}
                                onClick={handleCreateNew}
                                sx={{ py: 1.5, borderStyle: 'dashed' }}
                            >
                                Register New Customer
                            </Button>
                        </Box>

                        {currentCustomer && (
                            <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 2, textAlign: 'center' }}>
                                <Typography variant="body2" color="text.secondary" gutterBottom>
                                    Linked: <strong>{currentCustomer.fullName}</strong>
                                </Typography>
                                <Button
                                    color="error"
                                    size="small"
                                    onClick={() => {
                                        onSelectCustomer(null);
                                        onClose();
                                    }}
                                >
                                    Unlink / Reset to Walk-in
                                </Button>
                            </Box>
                        )}
                    </>
                ) : (
                    <CustomerForm
                        formData={formData}
                        onChange={setFormData}
                        disabled={saving}
                        autoFocusName={true}
                    />
                )}
            </Stack>
        </DetailDrawer>
    );
}
