import { supabase } from "../supabase";
import { createOrderObject } from "./orderService";
import { createInvoice } from "./invoiceService";
import { generateDisplayId, generateBatchIds, getStaffIdentity } from "../utils/idUtils";


// ---------------------------------------------------------------------------
// Shared helper: create a new customer doc if isNew, otherwise pass through
// ---------------------------------------------------------------------------
const resolveCustomer = async (customer, userEmail) => {
    if (!customer || !customer.isNew) return customer || null;

    const newCustId = await generateDisplayId('customers', 'CU');
    const { error } = await supabase.from('customers').insert([{
        id: newCustId,
        full_name: customer.fullName,
        created_at: new Date().toISOString()
    }]);

    if (error) {
        console.error("Error creating customer:", error);
        throw error;
    }

    return { id: newCustId, fullName: customer.fullName };
};

/**
 * Handles the complete checkout process for a new order.
 */
export const saveCheckout = async ({ currentOrder, paymentData, user, activeShiftId, currentTotal }) => {
    const { discount, subtotal } = paymentData;
    const staffId = getStaffIdentity(user);

    // Prepare Payload for perform_checkout RPC
    const payload = {
        staff_id: staffId,
        staff_name: user?.full_name || user?.displayName || user?.email || 'Staff',
        shift_id: activeShiftId,
        payment_method: paymentData.paymentMethod,
        payment_details: paymentData.paymentDetails || {},
        amount_tendered: Number(paymentData.amountTendered),
        change: Number(paymentData.change),
        subtotal: Number(subtotal || currentTotal),
        total: Number(paymentData.total || currentTotal),
        discount: discount || {},
        due_date: paymentData.dueDate || null,
        customer: {
            isNew: currentOrder.customer?.isNew || false,
            id: currentOrder.customer?.id || null,
            fullName: currentOrder.customer?.fullName || currentOrder.customer?.full_name || 'Walk-in Customer',
            phone: currentOrder.customer?.phone || '',
            address: currentOrder.customer?.address || '',
            tin: currentOrder.customer?.tin || ''
        },
        items: currentOrder.items.map(item => ({
            serviceId: item.serviceId || null,
            name: item.serviceName || item.name,
            price: Number(item.price),
            costPrice: Number(item.costPrice || 0),
            quantity: Number(item.quantity),
            category: item.category || 'Revenue',
            note: item.note || '',
            consumables: item.consumables || [],
            trackStock: item.trackStock || false
        }))
    };

    const { data, error } = await supabase.rpc('perform_checkout', { p_payload: payload });
    if (error) {
        console.error("Checkout RPC failed:", error);
        throw error;
    }

    return { ...payload, id: data.id, order_number: data.order_number };
};

/**
 * Updates an existing order (re-checkout/edit).
 */
export const updateCheckout = async ({ order, paymentData, user, activeShiftId, currentTotal }) => {
    const staffId = getStaffIdentity(user);

    const itemsToInsert = [];
    const itemsToUpdate = [];
    const inventoryAdjustments = []; // Array of { id, delta }

    // 1. Process Items (Calculate deltas for inventory if needed, though RPC update is safer)
    // To keep the RPC simple, we can pass inventory deltas from the frontend
    // or let the RPC handle it if we pass the original state.
    // For now, let's keep it consistent: the RPC updates stock based on deltas provided.
    
    // NOTE: This implementation assumes the frontend knows the delta.
    // However, a better way is to pass current items and let RPC reconcile.
    // Given the request for efficiency, a single RPC with a well-defined payload is best.

    for (const item of order.items) {
        const itemAmount = Number(item.price) * Number(item.quantity);
        if (item.transactionId) {
            itemsToUpdate.push({
                id: item.transactionId,
                price: Number(item.price),
                quantity: Number(item.quantity),
                amount: itemAmount,
                payment_method: paymentData.paymentMethod
            });
        } else {
            itemsToInsert.push({
                serviceId: item.serviceId || null,
                name: item.name || item.serviceName,
                price: Number(item.price),
                costPrice: Number(item.costPrice || 0),
                quantity: Number(item.quantity),
                category: item.category || 'Revenue',
                note: item.note || '',
                consumables: item.consumables || [],
                trackStock: item.trackStock || false
            });
        }
    }

    const payload = {
        order_id: order.originalId || order.id,
        staff_id: staffId,
        shift_id: activeShiftId,
        payment_method: paymentData.paymentMethod,
        payment_details: paymentData.paymentDetails || {},
        amount_tendered: Number(paymentData.amountTendered),
        change: Number(paymentData.change),
        subtotal: Number(paymentData.subtotal || currentTotal),
        total: Number(paymentData.total || currentTotal),
        customer: {
            isNew: order.customer?.isNew || false,
            id: order.customer?.id || null,
            fullName: order.customer?.fullName || order.customer?.full_name || 'Walk-in Customer',
            phone: order.customer?.phone || '',
            address: order.customer?.address || '',
            tin: order.customer?.tin || ''
        },
        itemsToInsert,
        itemsToUpdate,
        itemsToDelete: (order.deletedItems || []).map(d => ({
            id: d.transactionId,
            reason: d.deleteReason || 'Unknown',
            deleted_by: user.email
        })),
        inventoryAdjustments: [] // Assuming stock is handled separately or by a separate RPC call if complex
    };

    const { data, error } = await supabase.rpc('update_checkout', { p_payload: payload });
    if (error) {
        console.error("Update Checkout RPC failed:", error);
        throw error;
    }

    return { ...payload, id: data.id, order_number: order.orderNumber };
};
