// src/hooks/useInvoices.js
// Real-time Firestore listener for the invoices collection.
// Supports filtering by status, customerId, and date range.

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { isOverdue } from '../utils/invoiceService';

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
    setLoading(true);
    const constraints = [orderBy('createdAt', 'desc')];

    // 'overdue' is display-only — fetch unpaid+partial, filter client-side
    const statusFilter = filters.status === 'overdue' ? null : filters.status;
    if (statusFilter) constraints.push(where('status', '==', statusFilter));
    if (filters.customerId) constraints.push(where('customerId', '==', filters.customerId));
    if (filters.from) constraints.push(where('createdAt', '>=', filters.from));
    if (filters.to)   constraints.push(where('createdAt', '<=', filters.to));

    const q = query(collection(db, 'invoices'), ...constraints);
    const unsub = onSnapshot(q, (snap) => {
      let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Client-side overdue filter
      if (filters.status === 'overdue') docs = docs.filter(isOverdue);
      setInvoices(docs);
      setLoading(false);
    }, (err) => {
      console.error('useInvoices error:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [filters.status, filters.customerId, filters.from, filters.to]);

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
    const q = query(
      collection(db, 'invoices'),
      where('status', 'in', ['unpaid', 'partial'])
    );
    const unsub = onSnapshot(q, (snap) => {
      const sum = snap.docs.reduce((acc, d) => acc + (d.data().balance || 0), 0);
      setTotal(sum);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  return { total, loading };
}
