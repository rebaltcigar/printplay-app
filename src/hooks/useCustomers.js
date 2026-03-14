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
            const { data, error } = await supabase.rpc('get_customer_summaries');

            if (data) {
                // The RPC already projects and sorts correctly
                setCustomers(data);
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
