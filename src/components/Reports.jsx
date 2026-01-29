// src/components/Reports.jsx
import React, { useState } from 'react';
import ReportsLayout from './reports/ReportsLayout';
import FinancialPnL from './reports/FinancialPnL';
import SalesAnalysis from './reports/SalesAnalysis';
import StaffPerformance from './reports/StaffPerformance';
import ShiftAudit from './reports/ShiftAudit';

export default function Reports({ isActive = true }) {
    const [currentView, setCurrentView] = useState('financial');

    const renderContent = () => {
        // If not active, do not render the heavy chart components
        // This avoids Recharts width(0) errors while keeping the parent Reports component (and its state) alive.
        if (!isActive) return null;

        switch (currentView) {
            case 'financial':
                return <FinancialPnL />;
            case 'sales':
                return <SalesAnalysis />;
            case 'staff':
                return <StaffPerformance />;
            case 'shifts':
                return <ShiftAudit />;
            default:
                return <FinancialPnL />;
        }
    };

    return (
        <ReportsLayout currentView={currentView} onViewChange={setCurrentView}>
            {renderContent()}
        </ReportsLayout>
    );
}
