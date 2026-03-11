// src/contexts/StaffContext.jsx
import React, { createContext, useContext } from 'react';
import { useStaffList } from '../hooks/useStaffList';

export const StaffContext = createContext(null);

export function StaffProvider({ children }) {
    const value = useStaffList();
    return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export function useStaff() {
    const ctx = useContext(StaffContext);
    if (!ctx) throw new Error('useStaff must be used inside StaffProvider');
    return ctx;
}
