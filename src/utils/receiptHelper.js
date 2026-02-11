
/**
 * Normalizes order data for the SimpleReceipt component.
 * Ensures consistent field names, price calculations, and customer data regardless of the source (POS, Dashboard History, Transactions).
 * 
 * @param {Object} order - The raw order object (from DB or POS state).
 * @param {Object} options - Optional settings.
 * @param {string} options.staffName - Fallback staff name if not in order.
 * @param {boolean} options.isReprint - If true, keeps original timestamp. If false (new order), uses current time.
 */
export const normalizeReceiptData = (order, options = {}) => {
    if (!order) return null;

    const { staffName = 'Staff', isReprint = false } = options;

    // 1. Customer Data
    // Handle both flat fields (old) and nested object (new)
    const custName = order.customerName || order.customer?.fullName || '';
    const custPhone = order.customerPhone || order.customer?.phone || '';
    const custAddress = order.customerAddress || order.customer?.address || '';
    const custTin = order.customerTin || order.customer?.tin || '';

    // 2. Items
    // Ensure every item has a total. If subtotal/total is missing, calculate it.
    const items = (order.items || []).map(item => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        const calculatedTotal = qty * price;

        return {
            name: item.name || item.serviceName || item.item || 'Item',
            quantity: qty,
            price: price,
            subtotal: Number(item.subtotal || item.total || calculatedTotal),
            total: Number(item.total || item.subtotal || calculatedTotal)
        };
    });

    // 3. Totals
    const orderTotal = Number(order.total) || items.reduce((sum, i) => sum + i.total, 0);

    // 4. Timestamp
    // If it's a new order being printed right now, use new Date().
    // If it's a reprint, try to use the original timestamp, otherwise fallback to now.
    let timestamp = new Date();
    if (isReprint && order.timestamp) {
        if (order.timestamp.seconds) {
            timestamp = new Date(order.timestamp.seconds * 1000);
        } else if (order.timestamp instanceof Date) {
            timestamp = order.timestamp;
        }
        // If it's a string or other format, might need parsing, but usually it's Firestore Timestamp
    }

    return {
        ...order,
        // Normalized Fields
        orderNumber: order.orderNumber || order.id || '---',
        staffName: order.staffName || staffName,
        timestamp: timestamp,

        // Customer
        customerName: custName,
        customerPhone: custPhone,
        customerAddress: custAddress,
        customerTin: custTin,

        // Items & Totals
        items: items,
        total: orderTotal,
        amountTendered: Number(order.amountTendered) || 0,
        change: Number(order.change) || 0,
        paymentMethod: order.paymentMethod || 'Cash'
    };
};

// Global Print Lock
export const safePrint = (onAfterPrint, source = "Unknown") => {
    console.log(`[RECEIPT] Print requested from: ${source}`);
    if (window.globalPrintLock) {
        console.warn(`[RECEIPT] Print blocked: Already printing (Global Lock). Source: ${source}`);
        return;
    }

    window.globalPrintLock = true;

    try {
        window.print();
    } catch (e) {
        console.error("[RECEIPT] Print failed:", e);
    }

    // Reset lock after a delay to allow dialog to close and state to settle
    setTimeout(() => {
        window.globalPrintLock = false;
        console.log("[RECEIPT] Global lock released.");
        if (onAfterPrint) onAfterPrint();
    }, 2500); // 2.5s cooldown
};
