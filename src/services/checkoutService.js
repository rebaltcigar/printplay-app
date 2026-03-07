import { db } from "../firebase";
import {
    collection, addDoc, serverTimestamp, writeBatch,
    doc, increment
} from "firebase/firestore";
import { generateOrderNumber, createOrderObject, generateBatchIds } from "./orderService";

/**
 * Handles the complete checkout process for a new order.
 * 
 * @param {Object} params
 * @param {Object} params.currentOrder The order object from POS state
 * @param {Object} params.paymentData Payment details (method, tendered, etc.)
 * @param {Object} params.user Current user object
 * @param {string} params.activeShiftId The ID of the current shift
 * @param {number} params.currentTotal Pre-calculated total
 * @returns {Promise<Object>} The completed order data
 */
export const saveCheckout = async ({ currentOrder, paymentData, user, activeShiftId, currentTotal }) => {
    let finalCustomer = currentOrder.customer;

    // 1. Create New Customer if needed
    if (finalCustomer && finalCustomer.isNew) {
        const custRef = await addDoc(collection(db, 'customers'), {
            fullName: finalCustomer.fullName,
            createdAt: serverTimestamp(),
            createdBy: user?.email || 'system_checkout',
            lifetimeValue: 0,
            outstandingBalance: 0,
            totalOrders: 0
        });
        finalCustomer = { id: custRef.id, fullName: finalCustomer.fullName };
    }

    const isUnpaid = paymentData.paymentMethod === 'Charge' || paymentData.paymentMethod === 'Pay Later';
    const orderNum = await generateOrderNumber();

    // 2. Prepare Order Object
    const fullOrder = {
        orderNumber: orderNum,
        shiftId: activeShiftId,
        invoiceStatus: isUnpaid ? 'UNPAID' : 'PAID',
        isDeleted: false,
        ...createOrderObject(
            currentOrder.items,
            currentTotal,
            paymentData.paymentMethod,
            paymentData.paymentDetails,
            paymentData.amountTendered,
            paymentData.change,
            finalCustomer,
            user
        )
    };

    // 3. Add Order to DB
    const orderRef = await addDoc(collection(db, 'orders'), fullOrder);
    const orderId = orderRef.id;

    // 4. Create AR Invoice if Charge
    if (paymentData.paymentMethod === 'Charge') {
        await createInvoice(
            { ...fullOrder, id: orderId },
            { staffEmail: user.email, shiftId: activeShiftId, dueDate: paymentData.dueDate || null }
        );
    }

    // 5. Process Line Items (Transactions)
    const txIds = await generateBatchIds("transactions", "TX", currentOrder.items.length);
    const batch = writeBatch(db);

    currentOrder.items.forEach((item, index) => {
        const txRef = doc(collection(db, 'transactions'));
        batch.set(txRef, {
            displayId: txIds[index],
            item: item.serviceName || item.name,
            serviceId: item.serviceId || null,
            parentServiceId: item.parentServiceId || null,
            variantGroup: item.variantGroup || null,
            variantLabel: item.variantLabel || null,
            price: Number(item.price),
            unitCost: Number(item.costPrice || 0),
            quantity: Number(item.quantity),
            total: Number(item.price) * Number(item.quantity),
            timestamp: serverTimestamp(),
            staffEmail: user.email,
            customerName: finalCustomer?.fullName || 'Walk-in',
            customerId: finalCustomer?.id || null,
            shiftId: activeShiftId,
            orderNumber: orderNum,
            category: 'Revenue',
            financialCategory: 'Revenue',
            paymentMethod: paymentData.paymentMethod,
            paymentDetails: paymentData.paymentDetails || {},
            invoiceStatus: isUnpaid ? 'UNPAID' : 'PAID',
            isDeleted: false
        });

        // 6. Inventory Deduction
        if (item.trackStock && item.serviceId) {
            const svcRef = doc(db, 'services', item.serviceId);
            batch.update(svcRef, {
                stockCount: increment(-Number(item.quantity))
            });
        }
    });

    await batch.commit();

    return { ...fullOrder, id: orderId };
};

/**
 * Updates an existing order (re-checkout/edit).
 * 
 * @param {Object} params
 * @param {Object} params.order The current tab/order object being edited
 * @param {Object} params.paymentData New payment details
 * @param {Object} params.user Current user
 * @param {string} params.activeShiftId
 * @param {number} params.currentTotal
 * @returns {Promise<void>}
 */
export const updateCheckout = async ({ order, paymentData, user, activeShiftId, currentTotal }) => {
    let finalCustomer = order.customer;

    // 1. Create New Customer if needed (same as saveCheckout)
    if (finalCustomer && finalCustomer.isNew) {
        const custRef = await addDoc(collection(db, 'customers'), {
            fullName: finalCustomer.fullName,
            createdAt: serverTimestamp(),
            createdBy: user?.email || 'system_checkout',
            lifetimeValue: 0,
            outstandingBalance: 0,
            totalOrders: 0
        });
        finalCustomer = { id: custRef.id, fullName: finalCustomer.fullName };
    }

    const batch = writeBatch(db);
    const finalItems = [];

    // 2. Pre-generate IDs for new items
    const newItemsCount = order.items.filter(i => !i.transactionId).length;
    let newIds = [];
    if (newItemsCount > 0) {
        newIds = await generateBatchIds("transactions", "TX", newItemsCount);
    }
    let newIdIndex = 0;

    // 3. Process Items (Add & Update)
    for (const item of order.items) {
        const itemData = {
            item: item.name || item.serviceName,
            price: Number(item.price),
            quantity: Number(item.quantity),
            total: Number(item.price) * Number(item.quantity),
            notes: item.notes || '',
        };
        if (item.editReason) itemData.editReason = item.editReason;

        if (item.transactionId) {
            const ref = doc(db, 'transactions', item.transactionId);
            batch.update(ref, {
                ...itemData,
                paymentMethod: paymentData.paymentMethod,
                paymentDetails: paymentData.paymentDetails || {}
            });
        } else {
            const ref = doc(collection(db, 'transactions'));
            const displayId = newIds[newIdIndex++] || `TEMP-${Date.now()}`;

            batch.set(ref, {
                ...itemData,
                displayId,
                timestamp: serverTimestamp(),
                staffEmail: user.email,
                customerName: finalCustomer?.fullName || 'Walk-in',
                customerId: finalCustomer?.id || null,
                shiftId: activeShiftId,
                orderNumber: order.orderNumber,
                category: 'Revenue',
                financialCategory: 'Revenue',
                paymentMethod: paymentData.paymentMethod,
                paymentDetails: paymentData.paymentDetails || {},
                isDeleted: false
            });
        }
        finalItems.push({
            ...itemData,
            name: itemData.item
        });
    }

    // 4. Process Deletions
    if (order.deletedItems) {
        order.deletedItems.forEach(delItem => {
            const ref = doc(db, 'transactions', delItem.transactionId);
            batch.update(ref, {
                isDeleted: true,
                deletedBy: user.email,
                deleteReason: delItem.deleteReason,
                deletedAt: serverTimestamp()
            });
        });
    }

    // 5. Update Order Doc
    const orderRef = doc(db, 'orders', order.originalId);
    const updateObj = {
        items: finalItems,
        total: currentTotal,
        subtotal: currentTotal,
        paymentMethod: paymentData.paymentMethod,
        paymentDetails: paymentData.paymentDetails || {},
        amountTendered: Number(paymentData.amountTendered),
        change: Number(paymentData.change),
        customerId: finalCustomer?.id || 'walk-in',
        customerName: finalCustomer?.fullName || 'Walk-in Customer',
        customerPhone: finalCustomer?.phone || '',
        customerAddress: finalCustomer?.address || '',
        customerTin: finalCustomer?.tin || '',
        updatedAt: serverTimestamp()
    };

    batch.update(orderRef, updateObj);
    await batch.commit();

    return { ...updateObj, id: order.originalId, orderNumber: order.orderNumber };
};
