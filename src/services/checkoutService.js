import { supabase } from "../supabase";
import { generateOrderNumber, createOrderObject, generateBatchIds } from "./orderService";
import { createInvoice } from "./invoiceService";

// ---------------------------------------------------------------------------
// Shared helper: create a new customer doc if isNew, otherwise pass through
// ---------------------------------------------------------------------------
const resolveCustomer = async (customer, userEmail) => {
    if (!customer || !customer.isNew) return customer || null;

    const newCustId = crypto.randomUUID();
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

    // 1. Resolve customer (create if new)
    const finalCustomer = await resolveCustomer(currentOrder.customer, user?.email);

    const isUnpaid = paymentData.paymentMethod === 'Charge' || paymentData.paymentMethod === 'Pay Later';
    const orderNum = await generateOrderNumber();
    const orderId = crypto.randomUUID();

    // 2. Prepare Order Object
    const fullOrder = {
        id: orderId,
        order_number: orderNum,
        shift_id: activeShiftId,
        invoice_status: isUnpaid ? 'UNPAID' : 'PAID',
        ...createOrderObject(
            currentOrder.items,
            currentTotal,
            paymentData.paymentMethod,
            paymentData.paymentDetails,
            paymentData.amountTendered,
            paymentData.change,
            finalCustomer,
            user,
            discount,
            subtotal
        )
    };

    // 3. Add Order to DB
    const { error: orderErr } = await supabase.from('orders').insert([fullOrder]);
    if (orderErr) throw orderErr;

    // 4. Create AR Invoice if Charge
    if (paymentData.paymentMethod === 'Charge') {
        await createInvoice(
            { ...fullOrder, id: orderId },
            { staffEmail: user.email, shiftId: activeShiftId, dueDate: paymentData.dueDate || null }
        );
    }

    // 5. Process Line Items (Bulk Insert to order_items)
    const txIds = await generateBatchIds("transactions", "TX", currentOrder.items.length);
    const orderItemsPayload = currentOrder.items.map((item, index) => ({
        id: txIds[index] || `TX-${Date.now()}-${index}`,
        parent_order_number: orderNum,
        name: item.serviceName || item.name,
        product_id: item.serviceId || null,
        price: Number(item.price),
        cost_price: Number(item.costPrice || 0),
        quantity: Number(item.quantity),
        amount: Number(item.price) * Number(item.quantity),
        timestamp: new Date().toISOString(),
        staff_email: user.email,
        customer_name: finalCustomer?.fullName || 'Walk-in',
        customer_id: finalCustomer?.id || null,
        shift_id: activeShiftId,
        category: 'Revenue',
        payment_method: paymentData.paymentMethod,
        invoice_status: isUnpaid ? 'UNPAID' : 'PAID',
        financial_category: 'Revenue',
        is_deleted: false,
        metadata: {
            note: item.note || '',
            parentServiceId: item.parentServiceId || null,
            variantGroup: item.variantGroup || null,
            variantLabel: item.variantLabel || null,
            paymentDetails: paymentData.paymentDetails || {},
            consumables: item.consumables || []
        }
    }));

    if (orderItemsPayload.length > 0) {
        const { error: txErr } = await supabase.from('order_items').insert(orderItemsPayload);
        if (txErr) throw txErr;
    }

    // 6. Inventory Deduction (Sequential)
    const deductStock = async (svcId, q) => {
        if (!svcId) return;
        const { data } = await supabase.from('products').select('stockCount').eq('id', svcId).single();
        if (data && data.stockCount !== undefined) {
            await supabase.from('products').update({ stockCount: Number(data.stockCount) - q }).eq('id', svcId);
        }
    };

    for (const item of currentOrder.items) {
        if (item.trackStock && item.serviceId) {
            await deductStock(item.serviceId, Number(item.quantity));
        }
        if (item.consumables && item.consumables.length > 0) {
            for (const c of item.consumables) {
                await deductStock(c.itemId, Number(c.qty) * Number(item.quantity));
            }
        }
    }

    return { ...fullOrder, id: orderId };
};

/**
 * Updates an existing order (re-checkout/edit).
 */
export const updateCheckout = async ({ order, paymentData, user, activeShiftId, currentTotal }) => {
    // 1. Resolve customer
    const finalCustomer = await resolveCustomer(order.customer, user?.email);

    const finalItems = [];
    const newItemsToInsert = [];
    const itemsToUpdate = [];

    // 2. Pre-generate IDs for new items
    const newItemsCount = order.items.filter(i => !i.transactionId).length;
    let newIds = [];
    if (newItemsCount > 0) {
        newIds = await generateBatchIds("transactions", "TX", newItemsCount);
    }
    let newIdIndex = 0;

    // 3. Process Items
    for (const item of order.items) {
        const itemAmount = Number(item.price) * Number(item.quantity);

        if (item.transactionId) {
            itemsToUpdate.push({
                id: item.transactionId,
                payment_method: paymentData.paymentMethod,
                amount: itemAmount,
                quantity: Number(item.quantity),
                price: Number(item.price)
            });
        } else {
            const displayId = newIds[newIdIndex++] || `TX-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            newItemsToInsert.push({
                id: displayId,
                parent_order_number: order.orderNumber, // Assume it maps from original order
                name: item.name || item.serviceName,
                product_id: item.serviceId || null,
                price: Number(item.price),
                quantity: Number(item.quantity),
                amount: itemAmount,
                timestamp: new Date().toISOString(),
                staff_email: user.email,
                customer_name: finalCustomer?.fullName || 'Walk-in',
                customer_id: finalCustomer?.id || null,
                shift_id: activeShiftId,
                category: 'Revenue',
                payment_method: paymentData.paymentMethod,
                financial_category: 'Revenue',
                is_deleted: false,
                metadata: {
                    note: item.note || '',
                    paymentDetails: paymentData.paymentDetails || {}
                }
            });
        }
        finalItems.push({
            itemId: item.id || item.itemId,
            name: item.name || item.serviceName,
            price: Number(item.price),
            quantity: Number(item.quantity),
            subtotal: itemAmount
        });
    }

    // Insert new items
    if (newItemsToInsert.length > 0) {
        const { error: insErr } = await supabase.from('order_items').insert(newItemsToInsert);
        if (insErr) throw insErr;
    }

    // Update existing items sequentially in order_items
    for (const upItem of itemsToUpdate) {
        const payload = {
            payment_method: upItem.payment_method,
            amount: upItem.amount,
            quantity: upItem.quantity,
            price: upItem.price,
            updated_at: new Date().toISOString()
        };
        await supabase.from('order_items').update(payload).eq('id', upItem.id);
    }

    // 4. Process Deletions
    if (order.deletedItems && order.deletedItems.length > 0) {
        const delIds = order.deletedItems.map(d => d.transactionId);
        await supabase.from('order_items')
            .update({
                is_deleted: true,
                metadata: { deleted_by: user.email, deleted_at: new Date().toISOString() }
            })
            .in('id', delIds);
    }

    // 5. Update Order Doc
    const updateObj = {
        items: finalItems,
        subtotal: paymentData.subtotal || currentTotal,
        discount: paymentData.discount || { type: 'none', value: 0, amount: 0 },
        total: paymentData.total || currentTotal,
        payment_method: paymentData.paymentMethod,
        payment_details: paymentData.paymentDetails || {},
        amount_tendered: Number(paymentData.amountTendered),
        change: Number(paymentData.change),
        customer_id: finalCustomer?.id || 'walk-in',
        customer_name: finalCustomer?.fullName || 'Walk-in Customer',
        customer_phone: finalCustomer?.phone || '',
        customer_address: finalCustomer?.address || '',
        customer_tin: finalCustomer?.tin || '',
        updated_at: new Date().toISOString()
    };

    const { error: ordErr } = await supabase.from('orders').update(updateObj).eq('id', order.originalId);
    if (ordErr) throw ordErr;

    return { ...updateObj, id: order.originalId, order_number: order.orderNumber };
};
