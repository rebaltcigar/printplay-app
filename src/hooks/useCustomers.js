// src/hooks/useCustomers.js
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

/**
 * Real-time hook for fetching the normalized customer database.
 * Orders by full_name natively relying on Postgres indexes.
 */
export function useCustomers() {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCustomers = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('customers')
                .select('*')
                .order('full_name', { ascending: true });

            if (data) {
                // Map full_name to fullName for backward compatibility
                const mapped = data.map(d => ({
                    ...d,
                    fullName: d.full_name,
                    lifetimeValue: d.lifetime_value,
                    outstandingBalance: d.outstanding_balance,
                    totalOrders: d.total_orders,
                    createdAt: d.created_at
                }));
                // Client-side deleted check just in case legacy customers had it
                const activeDocs = mapped.filter(d => d.isDeleted !== true);
                setCustomers(activeDocs);
            }
            if (error) console.error('useCustomers error:', error);
            setLoading(false);
        };

        fetchCustomers();

        const channel = supabase.channel('public:customers:useCustomers')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, fetchCustomers)
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, []);

    return { customers, loading };
}
