// src/components/Reports.jsx
import React, { useState } from 'react';
import ReportsLayout from './reports/ReportsLayout';
import FinancialPnL from './reports/FinancialPnL';
import SalesAnalysis from './reports/SalesAnalysis';
import StaffPerformance from './reports/StaffPerformance';
import ShiftAudit from './reports/ShiftAudit';

export default function Reports() {
    const [currentView, setCurrentView] = useState('financial');

    const renderContent = () => {
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
