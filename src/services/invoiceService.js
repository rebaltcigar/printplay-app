// src/services/invoiceService.js
import { db } from '../firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { generateDisplayId } from './orderService';

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

/**
 * Normalizes order data for the ServiceInvoice UI component.
 */
export const normalizeInvoiceData = (order, options = {}) => {
    if (!order) return null;

    const { staffName = 'Staff', isReprint = false } = options;

    const custName = order.customerName || order.customer?.fullName || '';
    const custPhone = order.customerPhone || order.customer?.phone || '';
    const custAddress = order.customerAddress || order.customer?.address || '';
    const custTin = order.customerTin || order.customer?.tin || '';
    const custBusinessStyle = order.customerBusinessStyle || order.customer?.businessStyle || '';

    const items = (order.items || []).map(item => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        const calculatedTotal = qty * price;

        return {
            name: item.name || item.serviceName || item.item || 'Item',
            description: item.description || '',
            quantity: qty,
            price: price,
            subtotal: Number(item.subtotal || item.total || calculatedTotal),
            total: Number(item.total || item.subtotal || calculatedTotal),
            unit: item.unit || 'pc'
        };
    });

    const orderTotal = Number(order.total) || items.reduce((sum, i) => sum + i.total, 0);

    let timestamp = new Date();
    if (isReprint && order.timestamp) {
        if (order.timestamp.toDate) {
            timestamp = order.timestamp.toDate();
        } else if (order.timestamp.seconds) {
            timestamp = new Date(order.timestamp.seconds * 1000);
        } else if (order.timestamp instanceof Date) {
            timestamp = order.timestamp;
        } else {
            timestamp = new Date(order.timestamp);
        }
    }

    return {
        ...order,
        orderNumber: order.orderNumber || order.id || '---',
        staffName: order.staffName || staffName,
        timestamp: timestamp,
        customerName: custName,
        customerPhone: custPhone,
        customerAddress: custAddress,
        customerTin: custTin,
        customerBusinessStyle: custBusinessStyle,
        items: items,
        total: orderTotal,
        amountTendered: Number(order.amountTendered) || 0,
        change: Number(order.change) || 0,
        paymentMethod: order.paymentMethod || 'Cash'
    };
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

// ---------------------------------------------------------------------------
// 3. UI Helpers
// ---------------------------------------------------------------------------

export const safePrintInvoice = (onAfterPrint, source = "Unknown") => {
    console.log(`[INVOICE] Print requested from: ${source}`);
    if (window.globalPrintLock) {
        console.warn(`[INVOICE] Print blocked: Already printing. Source: ${source}`);
        return;
    }

    window.globalPrintLock = true;

    try {
        window.print();
    } catch (e) {
        console.error("[INVOICE] Print failed:", e);
    }

    setTimeout(() => {
        window.globalPrintLock = false;
        if (onAfterPrint) onAfterPrint();
    }, 2500);
};
