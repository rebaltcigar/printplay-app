// src/services/orderService.js
import { supabase } from "../supabase";
import { generateDisplayId, generateBatchIds, getStaffIdentity } from "../utils/idUtils";

export { generateDisplayId, generateBatchIds };

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
        subtotal: subtotal || total,
        total: total,
        payment_method: paymentMethod,
        payment_details: paymentDetails || {},
        amount_tendered: Number(amountTendered),
        change: Number(change),
        customer_id: customer?.id || null,
        customer_name: customer?.fullName || customer?.full_name || 'Walk-in Customer',
        customer_phone: customer?.phone || '',
        customer_address: customer?.address || '',
        customer_tin: customer?.tin || '',
        staff_id: getStaffIdentity(user),
        staff_name: user?.full_name || user?.displayName || user?.email || 'Staff',
        timestamp: new Date().toISOString(),
        status: 'completed',
    };
};

/**
 * Soft-deletes an order and its linked order items, then reverses inventory.
 */
export const deleteOrder = async (orderId, orderNumber, shiftId, userEmail, reason) => {
    // 1. Mark order as deleted
    const { error: ordErr } = await supabase
        .from('orders')
        .update({
            status: 'VOIDED',
            deleted_by: userEmail,
            delete_reason: reason,
            deleted_at: new Date().toISOString()
        })
        .eq('id', orderId);

    if (ordErr) throw ordErr;

    // 2. Fetch linked transactions (now in order_items)
    const { data: linkedItems, error: itemsErr } = await supabase
        .from('order_items')
        .select('product_id, quantity, metadata')
        .eq('order_id', orderId)
        .eq('shift_id', shiftId);

    if (itemsErr) throw itemsErr;

    // 3. Soft-delete the child items
    const { error: updateItemsErr } = await supabase
        .from('order_items')
        .update({
            is_deleted: true,
            metadata: { deleted_by: userEmail, delete_reason: reason, deleted_at: new Date().toISOString() }
        })
        .eq('order_id', orderId)
        .eq('shift_id', shiftId);

    if (updateItemsErr) throw updateItemsErr;

    if (!linkedItems || linkedItems.length === 0) return;

    // 4. Revert Inventory (Optimized Batch RPC)
    const inventoryItems = [];
    for (const txData of linkedItems) {
        if (txData.product_id) {
            inventoryItems.push({ id: txData.product_id, qty: Number(txData.quantity || 1) });
        }
        if (txData.metadata && txData.metadata.consumables) {
            for (const c of txData.metadata.consumables) {
                inventoryItems.push({ id: c.itemId, qty: Number(c.qty || 0) * Number(txData.quantity || 1) });
            }
        }
    }

    if (inventoryItems.length > 0) {
        const { error: invErr } = await supabase.rpc('batch_increment_stock', { p_items: inventoryItems });
        if (invErr) console.error("Batch inventory restoration failed:", invErr);
    }
};
