// src/services/printService.js
// Consolidated logic for receipt and invoice printing.
import { fetchLiveItemsForOrder } from './orderService';

let _printLock = false;

/**
 * Triggers window.print() with a global lock to prevent concurrent prints.
 */
export const safePrint = (onAfterPrint, source = 'Unknown') => {
    console.log(`[PRINT] Requested from: ${source}`);
    if (_printLock) {
        console.warn(`[PRINT] Blocked: already printing. Source: ${source}`);
        return;
    }

    _printLock = true;

    try {
        window.print();
    } catch (e) {
        console.error('[PRINT] Failed:', e);
    }

    setTimeout(() => {
        _printLock = false;
        console.log('[PRINT] Lock released.');
        if (onAfterPrint) onAfterPrint();
    }, 2500);
};

/**
 * Alias for safePrint — preserves backward compatibility with invoiceHelper imports.
 */
export const safePrintInvoice = safePrint;

// ---------------------------------------------------------------------------
// Normalization Helpers
// ---------------------------------------------------------------------------

function extractCustomer(order) {
    return {
        customerName: order.customerName || order.customer?.fullName || '',
        customerPhone: order.customerPhone || order.customer?.phone || '',
        customerAddress: order.customerAddress || order.customer?.address || '',
        customerTin: order.customerTin || order.customer?.tin || '',
        customerBusinessStyle: order.customerBusinessStyle || order.customer?.businessStyle || '',
    };
}

function resolveTimestamp(ts) {
    if (!ts) return new Date();
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    if (ts instanceof Date) return ts;
    return new Date(ts);
}

/**
 * Core normalization logic.
 */
export const normalizeOrderData = (order, options = {}) => {
    if (!order) return null;

    const { staffName = 'Staff', isReprint = false, invoiceMode = false } = options;
    const customer = extractCustomer(order);

    const items = (order.items || []).map(item => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        const calculatedTotal = qty * price;

        const base = {
            name: item.name || item.serviceName || item.item || 'Item',
            quantity: qty,
            price: price,
            subtotal: Number(item.subtotal || item.total || calculatedTotal),
            total: Number(item.total || item.subtotal || calculatedTotal),
        };

        if (invoiceMode) {
            base.description = item.description || '';
            base.unit = item.unit || 'pc';
        }

        return base;
    });

    const orderTotal = Number(order.total ?? items.reduce((sum, i) => sum + i.total, 0)) || 0;
    const timestamp = isReprint ? resolveTimestamp(order.timestamp) : new Date();

    return {
        ...order,
        ...customer,
        orderNumber: order.orderNumber || order.id || '---',
        staffName: order.staffName || staffName,
        timestamp,
        items,
        total: orderTotal,
        amountTendered: Number(order.amountTendered) || 0,
        change: Number(order.change) || 0,
        paymentMethod: order.paymentMethod || 'Cash',
    };
};

/**
 * Normalizes for thermal receipts.
 */
export const normalizeReceiptData = (order, options = {}) =>
    normalizeOrderData(order, { ...options, invoiceMode: false });

/**
 * Normalizes for 8.5x11 invoices.
 */
export const normalizeInvoiceData = (order, options = {}) =>
    normalizeOrderData(order, { ...options, invoiceMode: true });

// ---------------------------------------------------------------------------
// Async helpers — fetch live transactions then normalize (for reprints)
// ---------------------------------------------------------------------------

const enrichWithLiveItems = async (order) => {
    const liveItems = await fetchLiveItemsForOrder(order.orderNumber);
    return liveItems ? { ...order, items: liveItems } : order;
};

/**
 * Enriches an order with live transactions, then normalizes for receipt printing.
 * Use for reprints — fresh checkouts should call normalizeReceiptData directly.
 */
export const prepareReceiptData = async (order, options = {}) =>
    normalizeReceiptData(await enrichWithLiveItems(order), options);

/**
 * Enriches an order with live transactions, then normalizes for invoice printing.
 * Use for reprints — fresh checkouts should call normalizeInvoiceData directly.
 */
export const prepareInvoiceData = async (order, options = {}) =>
    normalizeInvoiceData(await enrichWithLiveItems(order), options);
