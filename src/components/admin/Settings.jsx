// src/components/admin/Settings.jsx
import React, { useState } from 'react';
import SettingsLayout from './SettingsLayout';
import StoreSettings from './StoreSettings';
import DataAggregator from './DataAggregator';
import ExpenseSettings from './ExpenseSettings';

export default function Settings({ user, showSnackbar, isActive = true }) {
    const [currentView, setCurrentView] = useState('store');

    const renderContent = () => {
        if (!isActive) return null;

        switch (currentView) {
            case 'store':
            case 'pos':
            case 'hardware':
            case 'receipt':
            case 'security':
                return <StoreSettings section={currentView} user={user} showSnackbar={showSnackbar} />;
            case 'datacore':
                return <DataAggregator showSnackbar={showSnackbar} />;
            case 'expensetypes':
                return <ExpenseSettings showSnackbar={showSnackbar} />;
            default:
                return <StoreSettings section="store" user={user} showSnackbar={showSnackbar} />;
        }
    };

    return (
        <SettingsLayout currentView={currentView} onViewChange={setCurrentView}>
            {renderContent()}
        </SettingsLayout>
    );
}
