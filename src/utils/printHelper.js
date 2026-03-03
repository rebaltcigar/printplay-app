// src/utils/printHelper.js
// Merged replacement for receiptHelper.js + invoiceHelper.js.
// Both old module names are preserved as aliases for backward compatibility.
//
// MIGRATION: Replace imports like:
//   import { normalizeReceiptData, safePrint } from '../utils/receiptHelper';
//   import { normalizeInvoiceData, safePrintInvoice } from '../utils/invoiceHelper';
// with:
//   import { normalizeReceiptData, normalizeInvoiceData, safePrint, safePrintInvoice } from '../utils/printHelper';

// ---------------------------------------------------------------------------
// Global Print Lock (shared by both receipt and invoice)
// ---------------------------------------------------------------------------
// Using a module-level variable ensures the lock survives re-renders.
let _printLock = false;

/**
 * Triggers window.print() with a global lock to prevent concurrent prints.
 * The lock is released after 2500ms to give the print dialog time to open.
 *
 * @param {Function} onAfterPrint - Called after the lock is released.
 * @param {string}   source       - Label for debug logging (e.g. "Transactions").
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
// Order Normalization
// ---------------------------------------------------------------------------

/**
 * Shared helper: normalize customer fields from either flat or nested format.
 */
function extractCustomer(order) {
    return {
        customerName: order.customerName || order.customer?.fullName || '',
        customerPhone: order.customerPhone || order.customer?.phone || '',
        customerAddress: order.customerAddress || order.customer?.address || '',
        customerTin: order.customerTin || order.customer?.tin || '',
        customerBusinessStyle: order.customerBusinessStyle || order.customer?.businessStyle || '',
    };
}

/**
 * Shared helper: convert a Firestore Timestamp or Date value to a JS Date.
 */
function resolveTimestamp(ts) {
    if (!ts) return new Date();
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    if (ts instanceof Date) return ts;
    return new Date(ts);
}

/**
 * Normalizes order data for printing (receipt or invoice).
 *
 * @param {Object}  order            - Raw order document from Firestore or POS state.
 * @param {Object}  options
 * @param {string}  options.staffName  - Fallback staff name if not in order.
 * @param {boolean} options.isReprint  - If true, uses original timestamp instead of now.
 * @param {boolean} options.invoiceMode - If true, adds invoice-specific item fields (unit, description).
 */
export const normalizeOrderData = (order, options = {}) => {
    if (!order) return null;

    const { staffName = 'Staff', isReprint = false, invoiceMode = false } = options;

    // Customer fields
    const customer = extractCustomer(order);

    // Items — ensure every item has a calculated total
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

    // Grand total
    const orderTotal = Number(order.total) || items.reduce((sum, i) => sum + i.total, 0);

    // Timestamp
    const timestamp = isReprint ? resolveTimestamp(order.timestamp) : new Date();

    return {
        ...order,
        ...customer,
        // Normalized fields
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
 * Normalizes order data for the SimpleReceipt (thermal / small format) component.
 * Alias of normalizeOrderData with invoiceMode = false.
 */
export const normalizeReceiptData = (order, options = {}) =>
    normalizeOrderData(order, { ...options, invoiceMode: false });

/**
 * Normalizes order data for the ServiceInvoice (8.5×11 format) component.
 * Alias of normalizeOrderData with invoiceMode = true — adds unit + description on items.
 */
export const normalizeInvoiceData = (order, options = {}) =>
    normalizeOrderData(order, { ...options, invoiceMode: true });
