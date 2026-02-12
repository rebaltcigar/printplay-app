import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ReportsLayout from './reports/ReportsLayout';
import FinancialPnL from './reports/FinancialPnL';
import SalesAnalysis from './reports/SalesAnalysis';
import StaffPerformance from './reports/StaffPerformance';
import ShiftAudit from './reports/ShiftAudit';

export default function Reports({ isActive = true }) {
    if (!isActive) return null;

    return (
        <ReportsLayout>
            <Routes>
                {/* Default: Financials */}
                <Route index element={<FinancialPnL />} />

                {/* Sub-routes */}
                <Route path="sales" element={<SalesAnalysis />} />
                <Route path="staff" element={<StaffPerformance />} />
                <Route path="shifts" element={<ShiftAudit />} />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="" replace />} />
            </Routes>
        </ReportsLayout>
    );
}
