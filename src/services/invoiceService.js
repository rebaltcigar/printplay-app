// src/services/invoiceService.js
import { db } from '../firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { generateDisplayId } from './orderService';
import { normalizeInvoiceData, safePrintInvoice } from './printService';

// ---------------------------------------------------------------------------
// 1. Calculations & Normalization
// ---------------------------------------------------------------------------

/** Derive stored status from financials. */
export const calcInvoiceStatus = (total, amountPaid) => {
    if (amountPaid >= total) return 'paid';
    if (amountPaid > 0) return 'partial';
    return 'unpaid';
};

/** Display-only: is the invoice overdue? */
export const isOverdue = (invoice) => {
    if (!invoice || invoice.status === 'paid' || invoice.status === 'written_off') return false;
    if (!invoice.dueDate) return false;
    const due = invoice.dueDate?.toDate ? invoice.dueDate.toDate() : new Date(invoice.dueDate);
    return due < new Date();
};

/** Effective display status. */
export const displayStatus = (invoice) => {
    if (isOverdue(invoice) && invoice.status !== 'paid' && invoice.status !== 'written_off') return 'overdue';
    return invoice.status;
};


// ---------------------------------------------------------------------------
// 2. Data Operations
// ---------------------------------------------------------------------------

/**
 * Creates a new invoice document from a completed order.
 */
export const createInvoice = async (order, { staffEmail, shiftId, dueDate }) => {
    const invoiceNumber = await generateDisplayId('invoices', 'INV');

    const normalized = normalizeInvoiceData(order);
    const itemsForFirestore = normalized.items.map(i => ({
        description: i.name,
        quantity: i.quantity,
        price: i.price,
        total: i.total
    }));

    const total = normalized.total;

    const invoiceDoc = {
        invoiceNumber,
        orderId: order.id || null,
        orderNumber: normalized.orderNumber || null,

        customerId: normalized.customerId || null,
        customerName: normalized.customerName,
        customerAddress: normalized.customerAddress,
        customerTin: normalized.customerTin,

        items: itemsForFirestore,
        subtotal: total,
        total,
        amountPaid: 0,
        balance: total,

        status: 'unpaid',
        dueDate: dueDate instanceof Date ? dueDate : (dueDate ? new Date(dueDate) : null),

        notes: '',
        createdAt: serverTimestamp(),
        staffEmail,
        shiftId,

        payments: [],
    };

    const ref = await addDoc(collection(db, 'invoices'), invoiceDoc);
    return ref.id;
};

/**
 * Records a payment against an invoice.
 */
export const recordPayment = async (invoiceId, { amount, method, note = '', staffEmail, shiftId }, current) => {
    const entry = {
        paymentId: crypto.randomUUID(),
        amount: Number(amount),
        method,
        date: new Date(),
        staffEmail,
        note,
    };

    const newAmountPaid = Number(current.amountPaid || 0) + Number(amount);
    const newBalance = Math.max(0, Number(current.total) - newAmountPaid);
    const newStatus = calcInvoiceStatus(current.total, newAmountPaid);

    await updateDoc(doc(db, 'invoices', invoiceId), {
        payments: arrayUnion(entry),
        amountPaid: newAmountPaid,
        balance: newBalance,
        status: newStatus,
    });

    if (shiftId) {
        const tx = {
            price: Number(amount),
            quantity: 1,
            total: Number(amount),
            item: 'AR Payment',
            notes: `Payment for Invoice #${current.invoiceNumber || invoiceId.slice(-6).toUpperCase()}${note ? ` - ${note}` : ''}`,
            paymentMethod: method === 'gcash' ? 'GCash' : 'Cash',
            customerId: current.customerId || null,
            customerName: current.customerName || 'Walk-in',
            staffEmail,
            shiftId,
            timestamp: serverTimestamp(),
            isDeleted: false
        };
        await addDoc(collection(db, 'transactions'), tx);
    }
};

/**
 * Writes off the balance of an invoice.
 */
export const writeOffInvoice = async (invoiceId, { reason, staffEmail }, current) => {
    const entry = {
        paymentId: crypto.randomUUID(),
        amount: Number(current.balance),
        method: 'write_off',
        date: new Date(),
        staffEmail,
        note: reason,
    };

    await updateDoc(doc(db, 'invoices', invoiceId), {
        payments: arrayUnion(entry),
        amountPaid: Number(current.total),
        balance: 0,
        status: 'written_off',
    });
};

