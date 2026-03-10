import { supabase } from "../supabase";

const generateId = () => crypto.randomUUID();

/**
 * Records a stock adjustment (Damage, Loss, Correction, etc.)
 * Updates the item's stock_count and creates an audit entry in inventory_logs.
 */
export const recordStockAdjustment = async ({ itemId, itemName, qtyChange, type, reason, staffEmail }) => {
    // 1. Fetch current item stock
    const { data: item, error: fetchErr } = await supabase
        .from('products')
        .select('*')
        .eq('id', itemId)
        .single();

    if (fetchErr) throw fetchErr;

    const currentQty = Number(item.stock_count || 0);
    const newQty = currentQty + Number(qtyChange);

    // 2. Update stock count
    const { error: updateErr } = await supabase
        .from('products')
        .update({ stock_count: newQty, updated_at: new Date().toISOString() })
        .eq('id', itemId);

    if (updateErr) throw updateErr;

    // 3. Create log entry
    await supabase.from('inventory_logs').insert([{
        id: generateId(),
        item_id: itemId,
        item_name: itemName,
        qty_change: qtyChange,
        type: type, // 'Adjustment', 'Damage', 'Loss', 'Correction', 'Sale'
        reason: reason,
        staff_email: staffEmail,
        timestamp: new Date().toISOString()
    }]);
};

/**
 * Handles restocking of an item.
 * Calculates Weighted Average Cost (WAC), updates item, and creates audit log.
 * Also creates an 'InventoryAsset' transaction for financial tracking.
 */
export const restockItem = async ({ item, qtyAdded, unitCost, totalCost, staffEmail }) => {
    // 1. Weighted Average Cost Calculation
    const oldQty = Number(item.stock_count || item.stockCount || 0);
    const oldCost = Number(item.cost_price || item.costPrice || 0);
    const oldTotalValue = oldQty * oldCost;

    const newTotalValue = oldTotalValue + totalCost;
    const newTotalQty = oldQty + qtyAdded;
    const newAverageCost = newTotalQty > 0 ? (newTotalValue / newTotalQty) : unitCost;

    // 2. Update Item
    const { error: updateErr } = await supabase
        .from('products')
        .update({
            stock_count: newTotalQty,
            cost_price: newAverageCost,
            updated_at: new Date().toISOString()
        })
        .eq('id', item.id);

    if (updateErr) throw updateErr;

    // 3. Create Audit Log
    await supabase.from('inventory_logs').insert([{
        id: generateId(),
        item_id: item.id,
        item_name: item.name || item.serviceName,
        qty_change: qtyAdded,
        type: 'Restock',
        reason: 'Manual Restock',
        cost: unitCost,
        total_cost: totalCost,
        staff_email: staffEmail,
        timestamp: new Date().toISOString()
    }]);

    // 4. Create Financial Transaction (Credit/Asset) -> 'expenses' table
    await supabase.from('expenses').insert([{
        id: `EXP-${Date.now()}-${generateId().slice(0, 4)}`,
        item: `Restock: ${item.name || item.serviceName}`,
        quantity: qtyAdded,
        amount: totalCost,
        financial_category: 'InventoryAsset',
        category: 'Credit',
        expense_type: 'Restock',
        staff_email: staffEmail,
        timestamp: new Date().toISOString()
    }]);

    return newAverageCost;
};

/**
 * Fetches inventory logs for a specific item or globally.
 */
export const getInventoryLogs = async (itemId = null, maxLogs = 50) => {
    let query = supabase
        .from('inventory_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(maxLogs);

    if (itemId) {
        query = query.eq('item_id', itemId);
    }

    const { data, error } = await query;
    if (error) {
        console.error("Error fetching inventory logs:", error);
        return [];
    }
    return data;
};
