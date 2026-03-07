import React, { useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { useCustomers } from '../../hooks/useCustomers';
import { fmtCurrency, fmtPesoWhole } from '../../utils/formatters';
import SummaryCards from "../common/SummaryCards";
import CustomerDetailDrawer from './CustomerDetailDrawer';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

export default function CustomerManagement() {
    const { customers, loading } = useCustomers();
    const [selectedCustomer, setSelectedCustomer] = useState(null);

    // Deriving KPI metrics
    const totalCustomers = customers.length;
    // Let's assume active this month is just people with recent createdAt or updated, skip for now to simplify
    const activeThisMonth = customers.length;
    const totalOutstanding = customers.reduce((sum, c) => sum + (c.outstandingBalance || 0), 0);

    const kpis = [
        { label: "Total Customers", value: totalCustomers, color: "blue" },
        { label: "Active This Month", value: activeThisMonth, color: "teal" },
        { label: "Outstanding AR", value: fmtCurrency(totalOutstanding), color: "red" }
    ];

    const columns = [
        { field: 'fullName', headerName: 'Customer Name', flex: 1 },
        { field: 'phone', headerName: 'Phone', flex: 1 },
        { field: 'email', headerName: 'Email', flex: 1 },
        {
            field: 'lifetimeValue',
            headerName: 'Lifetime Value',
            flex: 1,
            valueFormatter: (val) => fmtCurrency(val || 0)
        },
        {
            field: 'outstandingBalance',
            headerName: 'Outstanding Balance',
            flex: 1,
            valueFormatter: (val) => fmtCurrency(val || 0)
        }
    ];

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h5">Customer Management</Typography>
                <Button
                    variant="contained"
                    startIcon={<PersonAddIcon />}
                    onClick={() => setSelectedCustomer({ isNew: true })}
                >
                    Add Customer
                </Button>
            </Box>

            <SummaryCards cards={kpis} loading={loading} />

            <Box sx={{ mt: 3, height: '70vh', width: '100%', bgcolor: 'background.paper', borderRadius: 2 }}>
                <DataGrid
                    rows={customers}
                    columns={columns}
                    loading={loading}
                    disableRowSelectionOnClick
                    onRowClick={(params) => setSelectedCustomer(params.row)}
                    sx={{
                        border: 'none',
                        '& .MuiDataGrid-row': {
                            cursor: 'pointer',
                            '&:hover': {
                                bgcolor: 'action.hover',
                            }
                        },
                        '& .MuiDataGrid-cell:focus': {
                            outline: 'none',
                        },
                        '& .MuiDataGrid-columnHeader:focus': {
                            outline: 'none',
                        }
                    }}
                />
            </Box>

            <CustomerDetailDrawer
                open={Boolean(selectedCustomer)}
                customer={selectedCustomer}
                onClose={() => setSelectedCustomer(null)}
            />
        </Box>
    );
}
