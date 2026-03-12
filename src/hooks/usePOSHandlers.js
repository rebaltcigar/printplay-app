import { useState, useRef, useEffect } from 'react';
import { deleteTransactions, recordExpense, updateTransaction } from '../services/transactionService';
import { deleteOrder } from '../services/orderService';
import { saveCheckout, updateCheckout } from '../services/checkoutService';
import { openDrawer } from '../services/drawerService';
import { getFriendlyErrorMessage } from '../services/errorService';
import { fmtCurrency } from '../utils/formatters';

export function usePOSHandlers({
    user, activeShiftId, currentOrder, currentTotal,
    orders, setOrders, activeTab, setActiveTab,
    updateCurrentOrder, addItemToCart, removeItemFromCart, updateItemInCart, closeTabHook,
    showSnackbar, setChangeDialogOpen, setLastChange, setOpenCheckout,
    shiftOrders, staffDisplayName, sessionStaffEmail,
    setPrintOrder, loadOrder,
    services, canViewFin
}) {
    const [isLoading, setIsLoading] = useState(false);

    // --- LEGACY INPUT STATE (Left Panel) ---
    const [item, setItem] = useState('');
    const [expenseType, setExpenseType] = useState('');
    const [expenseStaffId, setExpenseStaffId] = useState('');
    const [expenseStaffName, setExpenseStaffName] = useState('');
    const [expenseStaffEmail, setExpenseStaffEmail] = useState('');
    const [quantity, setQuantity] = useState('');
    const [price, setPrice] = useState('');
    const [notes, setNotes] = useState('');
    const quantityInputRef = useRef(null);
    const priceInputRef = useRef(null);

    // --- NEW POS GRID DIALOGS ---
    const [variablePriceItem, setVariablePriceItem] = useState(null);

    // --- CUSTOMERS ---
    const [selectedCustomer, setSelectedCustomer] = useState(null);

    // --- DELETION STATE ---
    const [selectedTransactions, setSelectedTransactions] = useState([]);
    const [deleteTxDialog, setDeleteTxDialog] = useState(false);
    const [selectedOrders, setSelectedOrders] = useState([]);
    const [deleteOrderDialog, setDeleteOrderDialog] = useState(false);
    const [deleteCartItemState, setDeleteCartItemState] = useState(null); // { tabIndex, itemIndex }

    // --- ITEM EDITING ---
    const [editItemDialog, setEditItemDialog] = useState(false);
    const [editingLineItem, setEditingLineItem] = useState(null);
    const [editItemError, setEditItemError] = useState('');

    // --- TX EDITING ---
    const [editTxDialog, setEditTxDialog] = useState(false);
    const [editingTx, setEditingTx] = useState(null);

    // =========================================================================
    // 1. LEFT PANEL HANDLERS (LEGACY INPUT)
    // =========================================================================

    const handleItemChange = (e) => {
        const val = e.target.value;
        setItem(val);

        const svc = services.find(s => s.serviceName === val);
        if (svc && svc.price) setPrice(svc.price);
        else setPrice('');

        if (val !== 'Expenses') {
            setExpenseType('');
            setExpenseStaffId('');
        }

        // UX: Auto-focus Quantity after selecting item
        if (val) {
            setTimeout(() => {
                quantityInputRef.current?.focus();
                quantityInputRef.current?.select();
            }, 100);
        }
    };

    const handleGridItemClick = (gridItem, qty = 1) => {
        if (gridItem.priceType === 'variable') {
            setVariablePriceItem(gridItem);
        } else {
            addItemToCart(gridItem, qty);
        }
    };

    const handlePCSession = ({ pcName, customer, amount }) => {
        addItemToCart({
            id: null,
            serviceName: `PC Rental — ${pcName}`,
            price: amount,
            priceType: 'fixed',
            costPrice: 0,
            trackStock: false,
        }, 1, amount);
        showSnackbar(`${pcName} billed — ${fmtCurrency(amount)}`);
    };

    const handleAddEntry = async () => {
        if (!item) return showSnackbar("Please select an item.", "error");
        if (!quantity || !price) return showSnackbar("Quantity and Price are required.", "error");

        const qtyNum = Number(quantity);
        const priceNum = Number(price);
        if (isNaN(qtyNum) || qtyNum <= 0) return showSnackbar("Invalid quantity.", "error");
        if (isNaN(priceNum) || priceNum < 0) return showSnackbar("Invalid price.", "error");

        // A. DIRECT DATABASE WRITES (Expenses)
        if (item === 'Expenses') {

            // Expense Validation
            if (!expenseType) return showSnackbar("Select Expense Type.", "error");

            // Validation with Admin Override
            if (expenseType !== 'Salary Advance' && !canViewFin && !notes) {
                return showSnackbar("Notes required for expenses.", "error");
            }

            if ((expenseType === 'Salary' || expenseType === 'Salary Advance') && !expenseStaffId) return showSnackbar("Select Staff.", "error");

            setIsLoading(true); // START LOADING
            try {
                await recordExpense({
                    item,
                    expenseType,
                    expenseStaffId,
                    expenseStaffName,
                    expenseStaffEmail,
                    quantity: qtyNum,
                    price: priceNum,
                    notes,
                    userEmail: user.email,
                    user: user,
                    activeShiftId
                });
                setItem(''); setQuantity(''); setPrice(''); setNotes('');
                setExpenseType('');
                showSnackbar(`${item} recorded successfully.`);
            } catch (e) {
                console.error(e);
                showSnackbar(getFriendlyErrorMessage(e), "error");
            } finally {
                setIsLoading(false); // STOP LOADING
            }
            return;
        }

        // B. ADD TO CART (Standard Services)
        const svc = services.find(s => s.serviceName === item);
        const cartItem = {
            id: Date.now(),
            serviceId: svc?.id || null, // CAPTURE ID
            serviceName: item,
            price: priceNum,
            costPrice: svc?.costPrice || 0, // CAPTURE COST
            trackStock: svc?.trackStock || false, // CAPTURE FLAG
            quantity: qtyNum,
        };

        const newItems = [...currentOrder.items];
        const existing = newItems.find(i => i.serviceName === item && i.price === priceNum);
        if (existing) {
            existing.quantity += qtyNum;
        } else {
            newItems.push(cartItem);
        }
        updateCurrentOrder({ items: newItems });
        showSnackbar(`Added ${qtyNum}x ${item} to cart`);
        setItem(''); setQuantity(''); setPrice(''); setNotes('');
    };


    // =========================================================================
    // 2. POS / MIDDLE PANEL LOGIC
    // =========================================================================

    const closeOrderTab = (e, index) => {
        if (e?.stopPropagation) e.stopPropagation();
        closeTabHook(index);
    };

    const removeFromCart = (index) => {
        const itemToRemove = currentOrder.items[index];
        if (currentOrder.isExisting && itemToRemove.transactionId) {
            setDeleteCartItemState({ tabIndex: activeTab, itemIndex: index });
        } else {
            removeItemFromCart(index);
        }
    };

    const handleConfirmDeleteCartItem = (reason) => {
        const { tabIndex, itemIndex } = deleteCartItemState;
        setOrders(prev => {
            const copy = [...prev];
            const ord = { ...copy[tabIndex], items: [...copy[tabIndex].items] };
            const itemObj = ord.items[itemIndex];
            ord.deletedItems = [...(ord.deletedItems || []), { ...itemObj, deleteReason: reason }];
            ord.items = ord.items.filter((_, i) => i !== itemIndex);
            copy[tabIndex] = ord;
            return copy;
        });
        setDeleteCartItemState(null);
    };

    const openLineItemEdit = (lineItem, index) => {
        setEditingLineItem({ ...lineItem, index });
        setEditItemError('');
        setEditItemDialog(true);
    };

    const saveLineItemEdit = () => {
        const idx = editingLineItem.index;
        if (idx >= 0) {
            updateItemInCart(idx, {
                price: Number(editingLineItem.price),
                quantity: Number(editingLineItem.quantity),
                serviceName: editingLineItem.serviceName,
                note: editingLineItem.note,
                editReason: editingLineItem.editReason
            });
        }
        setEditItemDialog(false);
    };

    const handleCheckout = async (paymentData, shouldPrint = false, normalizeReceiptData) => {
        setIsLoading(true);
        try {
            const fullOrder = await saveCheckout({
                currentOrder,
                paymentData,
                user: { ...user, email: sessionStaffEmail, displayName: staffDisplayName },
                activeShiftId,
                currentTotal
            });

            if (paymentData.paymentMethod === 'Cash' || paymentData.change > 0) {
                setLastChange(paymentData.change);
                setChangeDialogOpen(true);
            }
            showSnackbar("Transaction completed!", "success");

            openDrawer(user, 'transaction').then(success => {
                if (!success) {
                    showSnackbar("Drawer connection check failed. Click 'Drawer' manually if needed.", "warning");
                }
            }).catch(console.warn);

            setOpenCheckout(false);

            if (shouldPrint && normalizeReceiptData) {
                setPrintOrder(normalizeReceiptData(fullOrder, {
                    staffName: staffDisplayName,
                    isReprint: false
                }));
            }

            if (orders.length > 1) {
                closeOrderTab({ stopPropagation: () => { } }, activeTab);
            } else {
                updateCurrentOrder({ items: [], customer: null });
            }

        } catch (err) {
            console.error(err);
            showSnackbar(getFriendlyErrorMessage(err), 'error');
        } finally {
            setIsLoading(false);
        }
    };


    const handleUpdateOrder = async () => {
        const order = currentOrder;
        if (!order.isExisting) return;
        setOpenCheckout(true);
    };

    const actuallyUpdateOrder = async (paymentData, shouldPrint = false, normalizeReceiptData) => {
        const order = currentOrder;
        if (!order.isExisting) return;
        setIsLoading(true);
        try {
            const updatedOrder = await updateCheckout({
                order,
                paymentData,
                user: { ...user, email: sessionStaffEmail, displayName: staffDisplayName },
                activeShiftId,
                currentTotal
            });

            openDrawer(user, 'transaction').then(success => {
                if (!success) {
                    showSnackbar("Drawer not connected. Click 'Drawer' to connect.", "warning");
                }
            }).catch(console.warn);

            if (paymentData.paymentMethod === 'Cash' || paymentData.change > 0) {
                setLastChange(paymentData.change);
                setChangeDialogOpen(true);
            }
            setOpenCheckout(false);

            if (shouldPrint && normalizeReceiptData) {
                setPrintOrder(normalizeReceiptData({
                    ...order,
                    ...updatedOrder,
                    timestamp: new Date()
                }, {
                    staffName: staffDisplayName,
                    isReprint: true
                }));
            }

            // Close Tab Logic
            if (orders.length === 1) {
                setOrders([{ id: 1, items: [], customer: null }]);
                setActiveTab(0);
            } else {
                const newOrders = orders.filter((_, i) => i !== activeTab);
                setOrders(newOrders);
                setActiveTab(Math.max(0, activeTab - 1));
            }
            showSnackbar("Order has been updated successfully.", "success");

        } catch (e) {
            console.error("Update failed:", e);
            showSnackbar(getFriendlyErrorMessage(e), 'error');
        } finally {
            setIsLoading(false);
        }
    };


    // =========================================================================
    // 3. LOGS & ACTIONS
    // =========================================================================

    const handleDeleteLogs = () => {
        if (selectedTransactions.length === 0) return;
        setDeleteTxDialog(true);
    };

    const handleConfirmDelete = async (reason) => {
        try {
            await deleteTransactions(selectedTransactions, user.email, reason);
            setSelectedTransactions([]);
            showSnackbar("Transaction(s) successfully deleted.");
        } catch (e) {
            console.error("Error deleting transactions:", e);
            showSnackbar(getFriendlyErrorMessage(e), 'error');
        }
    };

    // --- ORDER DELETION HANDLERS ---
    const handleDeleteOrders = () => {
        if (selectedOrders.length === 0) return;
        setDeleteOrderDialog(true);
    };

    const handleConfirmDeleteOrders = async (reason) => {
        try {
            await Promise.all(selectedOrders.map(async (id) => {
                const orderNum = shiftOrders.find(o => o.id === id)?.orderNumber;
                if (orderNum) {
                    await deleteOrder(id, orderNum, activeShiftId, user.email, reason);
                }
            }));
            setSelectedOrders([]);
            showSnackbar("Order(s) and linked transactions successfully deleted.");
        } catch (e) {
            console.error("Error deleting orders:", e);
            showSnackbar(getFriendlyErrorMessage(e), 'error');
        }
    };


    const handleOpenEditTx = (tx) => {
        setEditingTx(tx);
        setEditTxDialog(true);
    };

    const handleEditTx = async (id, updates) => {
        try {
            await updateTransaction(id, updates);
            setEditTxDialog(false);
            setEditingTx(null);
            showSnackbar("Transaction successfully updated.");
        } catch (e) {
            console.error("Error editing transaction:", e);
            showSnackbar(getFriendlyErrorMessage(e), 'error');
        }
    };

    return {
        isLoading,
        item, setItem,
        expenseType, setExpenseType,
        expenseStaffId, setExpenseStaffId,
        expenseStaffName, setExpenseStaffName,
        expenseStaffEmail, setExpenseStaffEmail,
        quantity, setQuantity,
        price, setPrice,
        notes, setNotes,
        quantityInputRef, priceInputRef,
        variablePriceItem, setVariablePriceItem,
        selectedCustomer, setSelectedCustomer,
        selectedTransactions, setSelectedTransactions,
        deleteTxDialog, setDeleteTxDialog,
        selectedOrders, setSelectedOrders,
        deleteOrderDialog, setDeleteOrderDialog,
        deleteCartItemState, setDeleteCartItemState,
        editItemDialog, setEditItemDialog,
        editingLineItem, setEditingLineItem,
        editItemError, setEditItemError,
        editTxDialog, setEditTxDialog,
        editingTx, setEditingTx,
        handleItemChange, handleGridItemClick, handlePCSession, handleAddEntry,
        closeOrderTab, removeFromCart, handleConfirmDeleteCartItem,
        openLineItemEdit, saveLineItemEdit,
        handleCheckout, handleUpdateOrder, actuallyUpdateOrder,
        handleDeleteLogs, handleConfirmDelete, handleDeleteOrders, handleConfirmDeleteOrders,
        handleOpenEditTx, handleEditTx
    };
}
