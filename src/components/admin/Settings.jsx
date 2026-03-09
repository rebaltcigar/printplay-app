import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import SettingsLayout from './SettingsLayout';
import StoreSettings from './StoreSettings';
import DataAggregator from './DataAggregator';
import ExpenseSettings from './ExpenseSettings';
import ShiftTemplateSettings from './ShiftTemplateSettings';

export default function Settings({ user, showSnackbar, isActive = true }) {
    if (!isActive) return null;

    return (
        <SettingsLayout>
            <Routes>
                {/* Default: Store Profile */}
                <Route index element={<StoreSettings section="store" user={user} showSnackbar={showSnackbar} />} />

                {/* Store Profile (Explicit) */}
                <Route path="store" element={<StoreSettings section="store" user={user} showSnackbar={showSnackbar} />} />

                {/* POS Config */}
                <Route path="pos" element={<StoreSettings section="pos" user={user} showSnackbar={showSnackbar} />} />

                {/* Hardware */}
                <Route path="hardware" element={<StoreSettings section="hardware" user={user} showSnackbar={showSnackbar} />} />

                {/* Receipt */}
                <Route path="receipt" element={<StoreSettings section="receipt" user={user} showSnackbar={showSnackbar} />} />

                {/* Security */}
                <Route path="security" element={<StoreSettings section="security" user={user} showSnackbar={showSnackbar} />} />

                {/* Expense Types */}
                <Route path="expensetypes" element={<ExpenseSettings showSnackbar={showSnackbar} />} />

                {/* Shift Templates */}
                <Route path="shifttemplates" element={<ShiftTemplateSettings showSnackbar={showSnackbar} />} />

                {/* Payment Methods */}
                <Route path="payments" element={<StoreSettings section="payments" user={user} showSnackbar={showSnackbar} />} />

                {/* ID System */}
                <Route path="ids" element={<StoreSettings section="ids" user={user} showSnackbar={showSnackbar} />} />

                {/* Data Core */}
                <Route path="datacore" element={<DataAggregator showSnackbar={showSnackbar} />} />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="" replace />} />
            </Routes>
        </SettingsLayout>
    );
}
