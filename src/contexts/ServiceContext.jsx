// src/contexts/ServiceContext.jsx
import React, { createContext, useContext } from 'react';
import { useServiceList } from '../hooks/useServiceList';

export const ServiceContext = createContext(null);

export function ServiceProvider({ children }) {
    const value = useServiceList();
    return <ServiceContext.Provider value={value}>{children}</ServiceContext.Provider>;
}

export function useServices() {
    const ctx = useContext(ServiceContext);
    if (!ctx) throw new Error('useServices must be used inside ServiceProvider');
    return ctx;
}
