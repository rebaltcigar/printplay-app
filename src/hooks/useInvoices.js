// src/hooks/useInvoices.js
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { isOverdue } from '../services/invoiceService';

/**
 * @param {Object} filters
 * @param {string|null} filters.status  - 'unpaid'|'partial'|'paid'|'written_off'|'overdue'|null (null = all)
 * @param {string|null} filters.customerId
 * @param {Date|null}   filters.from
 * @param {Date|null}   filters.to
 */
export function useInvoices(filters = {}) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInvoices = async () => {
      let query = supabase.from('invoices').select('*, customer:customers!customer_id(full_name)').order('created_at', { ascending: false });

      if (filters.customerId) query = query.eq('customer_id', filters.customerId);
      if (filters.from) query = query.gte('created_at', filters.from.toISOString());
      if (filters.to) query = query.lte('created_at', filters.to.toISOString());
      // Push non-overdue status filters to the DB; 'overdue' requires client-side date logic
      if (filters.status && filters.status !== 'overdue') query = query.eq('status', filters.status);

      const { data, error } = await query;

      if (data) {
        let docs = data.map(d => ({
          ...d,
          createdAt: d.created_at,
          dueDate: d.due_date,
          customerId: d.customer_id,
          customerName: d.customer?.full_name || '',
          invoiceNumber: d.invoice_number,
          amountPaid: d.amount_paid
        }));

        // Client-side filter only for 'overdue' (needs date comparison)
        if (filters.status === 'overdue') {
          docs = docs.filter(isOverdue);
        }

        setInvoices(docs);
      }
      if (error) console.error('useInvoices error:', error);
      setLoading(false);
    };

    fetchInvoices();

    const channel = supabase.channel('public:invoices:useInvoices')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, fetchInvoices)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [filters.customerId, filters.from, filters.to, filters.status]);

  // Outstanding totals (excludes paid + written_off)
  const outstandingTotal = invoices
    .filter(inv => inv.status !== 'paid' && inv.status !== 'written_off')
    .reduce((sum, inv) => sum + (inv.balance || 0), 0);

  return { invoices, loading, outstandingTotal };
}

/** Lightweight hook for the dashboard KPI — just the outstanding total. */
export function useOutstandingReceivables() {
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchKPI = async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('balance')
        .in('status', ['unpaid', 'partial']);

      if (data) {
        const sum = data.reduce((acc, d) => acc + (d.balance || 0), 0);
        setTotal(sum);
      }
      if (error) console.error("Error fetching outstanding receivables:", error);
      setLoading(false);
    };

    fetchKPI();

    const channel = supabase.channel('public:invoices:useOutstandingReceivables')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, fetchKPI)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  return { total, loading };
}
