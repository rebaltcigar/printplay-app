// src/services/invoiceService.js
import { supabase } from '../supabase';
import { generateDisplayId, getStaffIdentity } from '../utils/idUtils';
import { generateUUID } from '../utils/uuid';

// ... (existing code OMITTED for brevity in contiguous block, but I need to replace from line 1)

/**
 * Creates a new invoice document from a completed order.
 */
export const createInvoice = async (order, { staffId, staffEmail, user, shiftId, dueDate }) => {
    const newId = await generateDisplayId('invoices', 'IV');
    const invoiceNumber = newId;

    const normalized = normalizeInvoiceData(order);
    const itemsForPg = normalized.items.map(i => ({
        description: i.name,
        quantity: i.quantity,
        price: i.price,
        total: i.total
    }));

    const total = normalized.total;
    const finalStaffId = staffId || getStaffIdentity(user) || staffEmail;

    // Mapping payload to Supabase schema v2.0
    const invoiceDoc = {
        id: newId,
        invoice_number: invoiceNumber,
        order_id: order.id || null,

        customer_id: normalized.customerId || normalized.customer_id || null,
        customer_name: normalized.customerName,

        items: itemsForPg,
        subtotal: total,
        total,
        amount_paid: 0,
        balance: total,

        status: 'unpaid',
        due_date: dueDate instanceof Date ? dueDate.toISOString() : (dueDate ? new Date(dueDate).toISOString() : null),

        notes: '',
        created_at: new Date().toISOString(),
        staff_id: finalStaffId,
        shift_id: shiftId,

        payments: [],
    };

    const { error } = await supabase.from('invoices').insert([invoiceDoc]);
    if (error) throw error;

    return newId;
};

/**
 * Records a payment against an invoice.
 */
export const recordPayment = async (invoiceId, { amount, method, note = '', staffId, staffEmail, user, shiftId }, current) => {
    const finalStaffId = staffId || getStaffIdentity(user) || staffEmail;
    
    const entry = {
        paymentId: generateUUID(),
        amount: Number(amount),
        method,
        date: new Date().toISOString(),
        staffId: finalStaffId,
        note,
    };

    const currentPayments = Array.isArray(current.payments) ? current.payments : [];
    const newPayments = [...currentPayments, entry];

    const currentAmountPaid = Number(current.amountPaid || current.amount_paid || 0);
    const newAmountPaid = currentAmountPaid + Number(amount);
    const newBalance = Math.max(0, Number(current.total) - newAmountPaid);
    const newStatus = calcInvoiceStatus(current.total, newAmountPaid);

    const { error: invErr } = await supabase
        .from('invoices')
        .update({
            payments: newPayments,
            amount_paid: newAmountPaid,
            balance: newBalance,
            status: newStatus,
            updated_at: new Date().toISOString()
        })
        .eq('id', invoiceId);

    if (invErr) throw invErr;

    if (shiftId) {
        const txId = await generateDisplayId('transactions', 'TX');
        const tx = {
            id: txId,
            price: Number(amount),
            quantity: 1,
            amount: Number(amount),
            name: 'AR Payment',
            metadata: {
                note: `Payment for Invoice #${current.invoiceNumber || current.invoice_number || invoiceId.slice(-6).toUpperCase()}${note ? ` - ${note}` : ''}`,
            },
            payment_method: method === 'gcash' ? 'GCash' : 'Cash',
            customer_id: current.customerId || current.customer_id || null,
            customer_name: current.customerName || current.customer_name || 'Walk-in',
            staff_id: finalStaffId,
            shift_id: shiftId,
            timestamp: new Date().toISOString(),
            is_deleted: false,
            financial_category: 'Revenue',
            category: 'Revenue'
        };
        const { error: txErr } = await supabase.from('order_items').insert([tx]);
        if (txErr) console.error("Failed to insert AR Payment tx:", txErr);
    }
};


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
    if (!invoice.due_date && !invoice.dueDate) return false;

    // Fallback between legacy and Supabase schema
    const rawDueDate = invoice.due_date || invoice.dueDate;
    const due = new Date(rawDueDate);
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

    const custName = order.customerName || order.customer_name || order.customer?.fullName || '';
    const custPhone = order.customerPhone || order.customer_phone || order.customer?.phone || '';
    const custAddress = order.customerAddress || order.customer_address || order.customer?.address || '';
    const custTin = order.customerTin || order.customer_tin || order.customer?.tin || '';
    const custBusinessStyle = order.customerBusinessStyle || order.customer_business_style || order.customer?.businessStyle || '';

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
    if (isReprint && (order.timestamp || order.created_at)) {
        timestamp = new Date(order.timestamp || order.created_at);
    }

    return {
        ...order,
        orderNumber: order.orderNumber || order.order_number || order.id || '---',
        staffName: order.staffName || order.staff_name || staffName,
        timestamp: timestamp,
        customerName: custName,
        customerPhone: custPhone,
        customerAddress: custAddress,
        customerTin: custTin,
        customerBusinessStyle: custBusinessStyle,
        items: items,
        total: orderTotal,
        amountTendered: Number(order.amountTendered || order.amount_tendered) || 0,
        change: Number(order.change) || 0,
        paymentMethod: order.paymentMethod || order.payment_method || 'Cash'
    };
};

// ---------------------------------------------------------------------------
// 2. Data Operations
// ---------------------------------------------------------------------------

/**
 * Writes off the balance of an invoice.
 */
export const writeOffInvoice = async (invoiceId, { reason, staffId, staffEmail, user }, current) => {
    const finalStaffId = staffId || getStaffIdentity(user) || staffEmail;
    
    const entry = {
        paymentId: generateUUID(),
        amount: Number(current.balance),
        method: 'write_off',
        date: new Date().toISOString(),
        staffId: finalStaffId,
        note: reason,
    };

    const currentPayments = Array.isArray(current.payments) ? current.payments : [];
    const newPayments = [...currentPayments, entry];

    const { error } = await supabase
        .from('invoices')
        .update({
            payments: newPayments,
            amount_paid: Number(current.total),
            balance: 0,
            status: 'written_off',
            updated_at: new Date().toISOString()
        })
        .eq('id', invoiceId);

    if (error) throw error;
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
