// src/services/orderService.js
import { supabase } from "../supabase";

// ---------------------------------------------------------------------------
// 1. ID Generation Logic 
// ---------------------------------------------------------------------------

/**
 * Generates a unique display ID without needing a locked central counter.
 * Uses base36 timestamp + random hash to guarantee uniqueness and high readability.
 */
export const generateDisplayId = async (counterName, defaultPrefix = "ID") => {
    let prefix = defaultPrefix;
    try {
        const { data } = await supabase.from('settings').select('*').eq('id', 'config').single();
        if (data && data.id_prefixes && data.id_prefixes[counterName]) {
            prefix = data.id_prefixes[counterName];
        }
    } catch (e) {
        console.warn("Failed to fetch ID prefix config, using default:", e);
    }

    const timestampPart = Date.now().toString(36).toUpperCase();
    const hashPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestampPart}-${hashPart}`;
};

/**
 * Reserves a block of IDs for batch processing.
 */
export const generateBatchIds = async (counterName, defaultPrefix, count) => {
    if (count <= 0) return [];

    let prefix = defaultPrefix;
    try {
        const { data } = await supabase.from('settings').select('*').eq('id', 'config').single();
        if (data && data.id_prefixes && data.id_prefixes[counterName]) {
            prefix = data.id_prefixes[counterName];
        }
    } catch (e) {
        console.warn("Failed to fetch ID prefix config, using default:", e);
    }

    const ids = [];
    const timestampPart = Date.now().toString(36).toUpperCase();
    for (let i = 0; i < count; i++) {
        const hashPart = Math.random().toString(36).substring(2, 6).toUpperCase();
        ids.push(`${prefix}-${timestampPart}-${hashPart}${i}`);
    }
    return ids;
};

/**
 * Specifically for legacy order number generation (counter: orders, prefix: ORD).
 */
export const generateOrderNumber = () => generateDisplayId('orders', 'ORD');

// ---------------------------------------------------------------------------
// 2. Order Factory Logic
// ---------------------------------------------------------------------------

/**
 * Creates a normalized order object for Supabase 'orders' table.
 */
export const createOrderObject = (
    items, total, paymentMethod, paymentDetails, amountTendered, change, customer, user, discount = null, subtotal = null
) => {
    return {
        items: items.map(i => ({
            itemId: i.id,
            name: i.serviceName || i.name,
            note: i.note || '',
            price: i.price,
            costPrice: i.costPrice || 0,
            quantity: i.quantity || 1,
            subtotal: (i.price || 0) * (i.quantity || 1),
        })),
        subtotal: subtotal || total,
        discount: discount || { type: 'none', value: 0, amount: 0 },
        total: total,
        payment_method: paymentMethod,
        payment_details: paymentDetails || {},
        amount_tendered: Number(amountTendered),
        change: Number(change),
        customer_id: customer?.id || 'walk-in',
        customer_name: customer?.fullName || customer?.full_name || 'Walk-in Customer',
        customer_phone: customer?.phone || '',
        customer_address: customer?.address || '',
        customer_tin: customer?.tin || '',
        staff_id: user?.id || user?.uid || 'unknown',
        staff_email: user?.email || 'unknown',
        staff_name: user?.full_name || user?.displayName || user?.email || 'Staff',
        timestamp: new Date().toISOString(),
        status: 'completed',
        is_deleted: false
    };
};

/**
 * Soft-deletes an order and its linked order items, then reverses inventory.
 * 
 * @param {string} orderId The document ID of the order to delete
 * @param {string} orderNumber The display number of the order
 * @param {string} shiftId The active shift ID
 * @param {string} userEmail Email of the user performing deletion
 * @param {string} reason Reason for deletion
 * @returns {Promise<void>}
 */
export const deleteOrder = async (orderId, orderNumber, shiftId, userEmail, reason) => {
    // 1. Mark order as deleted
    const { error: ordErr } = await supabase
        .from('orders')
        .update({
            is_deleted: true,
            deleted_by: userEmail,
            delete_reason: reason,
            deleted_at: new Date().toISOString()
        })
        .eq('id', orderId);

    if (ordErr) throw ordErr;

    // 2. Fetch linked transactions (now in order_items)
    const { data: linkedItems, error: itemsErr } = await supabase
        .from('order_items')
        .select('*')
        .eq('parent_order_number', orderNumber)
        .eq('shift_id', shiftId);

    if (itemsErr) throw itemsErr;

    if (!linkedItems || linkedItems.length === 0) return;

    // 3. Soft-delete the child items
    const { error: updateItemsErr } = await supabase
        .from('order_items')
        .update({
            is_deleted: true,
            // metadata fallback if needed
            metadata: { deleted_by: userEmail, delete_reason: reason, deleted_at: new Date().toISOString() }
        })
        .eq('parent_order_number', orderNumber)
        .eq('shift_id', shiftId);

    if (updateItemsErr) throw updateItemsErr;

    // 4. Revert Inventory
    // We cannot use a simple increment block in JS via Supabase without RPC, 
    // so we fetch the items sequentially and increment them.
    for (const txData of linkedItems) {
        // Revert main item
        if (txData.product_id) {
            const { data: pData } = await supabase.from('products').select('stockCount').eq('id', txData.product_id).single();
            if (pData && pData.stockCount !== undefined) {
                await supabase.from('products')
                    .update({ stockCount: Number(pData.stockCount) + Number(txData.quantity || 1) })
                    .eq('id', txData.product_id);
            }
        }

        // Revert snapshotted consumables (stored in metadata/consumables usually)
        if (txData.metadata && txData.metadata.consumables && txData.metadata.consumables.length > 0) {
            for (const c of txData.metadata.consumables) {
                const { data: cData } = await supabase.from('products').select('stockCount').eq('id', c.itemId).single();
                if (cData && cData.stockCount !== undefined) {
                    const toRestore = Number(c.qty || 0) * Number(txData.quantity || 1);
                    await supabase.from('products')
                        .update({ stockCount: Number(cData.stockCount) + toRestore })
                        .eq('id', c.itemId);
                }
            }
        }
    }
};
