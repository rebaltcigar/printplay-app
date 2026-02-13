
/**
 * Normalizes order data for the ServiceInvoice component.
 * Separated from receiptHelper to allow specific customizations for the 8.5x11 Invoice format.
 * 
 * @param {Object} order - The raw order object.
 * @param {Object} options - Optional settings.
 */
export const normalizeInvoiceData = (order, options = {}) => {
    if (!order) return null;

    const { staffName = 'Staff', isReprint = false } = options;

    // 1. Customer Data
    // Ensure we capture all available fields for the invoice
    const custName = order.customerName || order.customer?.fullName || '';
    const custPhone = order.customerPhone || order.customer?.phone || '';
    const custAddress = order.customerAddress || order.customer?.address || '';
    const custTin = order.customerTin || order.customer?.tin || '';
    const custBusinessStyle = order.customerBusinessStyle || order.customer?.businessStyle || ''; // New field

    // 2. Items
    const items = (order.items || []).map(item => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        const calculatedTotal = qty * price;

        return {
            name: item.name || item.serviceName || item.item || 'Item',
            description: item.description || '', // Potential new field
            quantity: qty,
            price: price,
            subtotal: Number(item.subtotal || item.total || calculatedTotal),
            total: Number(item.total || item.subtotal || calculatedTotal),
            unit: item.unit || 'pc' // Default unit if missing
        };
    });

    // 3. Totals
    const orderTotal = Number(order.total) || items.reduce((sum, i) => sum + i.total, 0);

    // 4. Timestamp
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

        // Customer
        customerName: custName,
        customerPhone: custPhone,
        customerAddress: custAddress,
        customerTin: custTin,
        customerBusinessStyle: custBusinessStyle,

        // Items & Totals
        items: items,
        total: orderTotal,
        amountTendered: Number(order.amountTendered) || 0,
        change: Number(order.change) || 0,
        paymentMethod: order.paymentMethod || 'Cash'
    };
};

// Global Print Lock for Invoice
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
        console.log("[INVOICE] Global lock released.");
        if (onAfterPrint) onAfterPrint();
    }, 2500);
};
