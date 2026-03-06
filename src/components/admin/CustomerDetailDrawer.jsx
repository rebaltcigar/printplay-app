import React, { useState, useEffect } from "react";
import DetailDrawer from '../common/DetailDrawer';
import { Button, CircularProgress } from '@mui/material';
import CustomerForm from "../common/CustomerForm";
import { createCustomer, updateCustomer } from "../../services/customerService";

/**
 * Standard Customer Drawer for Admin management.
 * Handles both editing existing and creating new customers via centralized service.
 */
export default function CustomerDetailDrawer({ open, customer, onClose }) {
    const [formData, setFormData] = useState({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open && customer) {
            setFormData(customer);
        } else {
            setFormData({ fullName: '', email: '', phone: '', address: '', tin: '' });
        }
    }, [open, customer]);

    const handleSave = async () => {
        if (!formData.fullName?.trim()) return;

        setSaving(true);
        try {
            let result;
            if (customer?.id && !customer?.isNew) {
                result = await updateCustomer(customer.id, formData);
            } else {
                result = await createCustomer(formData);
            }
            if (onClose) onClose(result);
        } catch (err) {
            console.error(err);
            alert("Failed to save customer");
        } finally {
            setSaving(false);
        }
    };

    return (
        <DetailDrawer
            open={open}
            onClose={() => { if (onClose) onClose(customer); }}
            title={customer?.isNew || !customer?.id ? "New Customer Profile" : "Edit Customer Profile"}
            loading={saving}
            actions={
                <>
                    <Button onClick={() => { if (onClose) onClose(customer); }} disabled={saving}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={handleSave}
                        disabled={saving || !formData.fullName?.trim()}
                    >
                        {saving ? <CircularProgress size={24} /> : "Save Profile"}
                    </Button>
                </>
            }
        >
            <Box sx={{ mt: 1 }}>
                <CustomerForm
                    formData={formData}
                    onChange={setFormData}
                    disabled={saving}
                />
            </Box>
        </DetailDrawer>
    );
}

// Ensure Box is imported if used. Wait, I didn't import Box. Let me add it.
import { Box } from "@mui/material";
