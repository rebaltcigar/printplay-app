import { useState, useMemo } from 'react';

/**
 * Hook to manage POS cart with multi-tab support.
 * @returns {Object} Cart state and management functions
 */
export const usePOSCart = (initialOrders = [{ id: 1, items: [], customer: null }]) => {
    const [orders, setOrders] = useState(initialOrders);
    const [activeTab, setActiveTab] = useState(0);

    // Derived: Current Tab/Order
    const currentOrder = useMemo(() => orders[activeTab] || orders[0], [orders, activeTab]);

    // Derived: Current Total
    const currentTotal = useMemo(() => {
        return currentOrder.items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
    }, [currentOrder]);

    const updateCurrentOrder = (updates) => {
        setOrders(prev => {
            const next = [...prev];
            next[activeTab] = { ...next[activeTab], ...updates };
            return next;
        });
    };

    const addOrderTab = () => {
        const newOrderIds = orders
            .filter(o => !o.isExisting && typeof o.id === 'number')
            .map(o => o.id);
        const maxId = newOrderIds.length > 0 ? Math.max(...newOrderIds) : 0;
        const newId = maxId + 1;
        setOrders(prev => [...prev, { id: newId, items: [], customer: null }]);
        setActiveTab(orders.length);
    };

    const closeOrderTab = (index) => {
        if (orders.length <= 1) {
            setOrders([{ id: 1, items: [], customer: null }]);
            setActiveTab(0);
            return;
        }
        const nextOrders = orders.filter((_, i) => i !== index);
        setOrders(nextOrders);
        if (activeTab >= index && activeTab > 0) {
            setActiveTab(activeTab - 1);
        }
    };

    const addItemToCart = (itemData, qty = 1, overridePrice = null) => {
        const price = overridePrice !== null ? overridePrice : Number(itemData.price || 0);
        const newItem = {
            id: Date.now() + Math.random(),
            serviceId: itemData.id || null,
            parentServiceId: itemData.parentServiceId || null,
            variantGroup: itemData.variantGroup || null,
            variantLabel: itemData.posLabel || null,
            serviceName: itemData.serviceName || itemData.posLabel || itemData.name,
            price,
            costPrice: itemData.costPrice || 0,
            trackStock: itemData.trackStock || false,
            consumables: itemData.consumables || [],
            quantity: qty,
        };

        const nextItems = [...currentOrder.items];
        const existingIndex = nextItems.findIndex(i =>
            i.serviceName === newItem.serviceName &&
            i.price === newItem.price &&
            !i.transactionId // Only merge new local items
        );

        if (existingIndex >= 0) {
            nextItems[existingIndex].quantity += qty;
        } else {
            nextItems.push(newItem);
        }

        updateCurrentOrder({ items: nextItems });
    };

    const removeItemFromCart = (index) => {
        const nextItems = currentOrder.items.filter((_, i) => i !== index);
        updateCurrentOrder({ items: nextItems });
    };

    const updateItemInCart = (index, updates) => {
        const nextItems = [...currentOrder.items];
        nextItems[index] = { ...nextItems[index], ...updates };
        updateCurrentOrder({ items: nextItems });
    };

    const loadOrder = (order, transactions) => {
        const loadedItems = transactions
            .filter(d => d.isDeleted !== true)
            .map(data => ({
                id: Date.now() + Math.random(),
                transactionId: data.id,
                name: data.item,
                serviceName: data.item,
                price: Number(data.price),
                quantity: Number(data.quantity),
                subtotal: Number(data.total),
                total: Number(data.total),
                notes: data.notes || '',
            }));

        const newTab = {
            id: 'ord-' + order.orderNumber,
            isExisting: true,
            orderNumber: order.orderNumber,
            originalId: order.id,
            items: loadedItems,
            deletedItems: [],
            customer: {
                fullName: order.customerName,
                id: order.customerId,
                email: '',
                phone: order.customerPhone || '',
                address: order.customerAddress || '',
                tin: order.customerTin || '',
            },
            paymentMethod: order.paymentMethod,
            paymentDetails: order.paymentDetails,
            amountTendered: order.amountTendered,
            change: order.change,
            total: order.total
        };

        setOrders(prev => {
            const exists = prev.findIndex(o => o.orderNumber === order.orderNumber);
            if (exists >= 0) {
                const next = [...prev];
                next[exists] = newTab;
                setActiveTab(exists);
                return next;
            }
            const next = [...prev, newTab];
            setActiveTab(prev.length);
            return next;
        });
    };

    const clearCart = () => {
        updateCurrentOrder({ items: [], customer: null });
    };

    return {
        orders,
        setOrders,
        activeTab,
        setActiveTab,
        currentOrder,
        currentTotal,
        updateCurrentOrder,
        addOrderTab,
        closeOrderTab,
        addItemToCart,
        removeItemFromCart,
        updateItemInCart,
        clearCart,
        loadOrder
    };
};
