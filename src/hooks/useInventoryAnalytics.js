import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { getRange } from '../services/analyticsService';

/**
 * Hook to calculate sales velocity and estimated stock exhaustion.
 * @param {Array} items List of current inventory items (to get current stock)
 * @returns {Object} { velocityData, loading }
 */
export function useInventoryAnalytics(items) {
    const [velocityData, setVelocityData] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAnalytics = async () => {
            if (!items || items.length === 0) {
                setLoading(false);
                return;
            }

            try {
                // 1. Get 30-day range
                const { startUtc, endUtc } = getRange('past30');

                // 2. Fetch all transactions in that range
                const { data, error } = await supabase
                    .from('order_items')
                    .select('*')
                    .gte('timestamp', startUtc.toISOString())
                    .lte('timestamp', endUtc.toISOString())
                    .eq('is_deleted', false);

                if (error) throw error;

                const usageMap = {}; // itemId -> totalUsedIn30Days

                if (data) {
                    data.forEach(tx => {
                        const qty = Number(tx.quantity || 0);

                        // Track Primary Item
                        if (tx.product_id) {
                            usageMap[tx.product_id] = (usageMap[tx.product_id] || 0) + qty;
                        }

                        // Track Consumables (from metadata snapshot)
                        if (tx.metadata && tx.metadata.consumables && Array.isArray(tx.metadata.consumables)) {
                            tx.metadata.consumables.forEach(c => {
                                const cQty = Number(c.qty || 0) * qty;
                                usageMap[c.itemId] = (usageMap[c.itemId] || 0) + cQty;
                            });
                        }
                    });
                }

                // 3. Compute Velocity and Days Remaining
                const results = {};
                items.forEach(item => {
                    const totalUsed = usageMap[item.id] || 0;
                    const velocity = totalUsed / 30; // avg units per day
                    const currentStock = Number(item.stockCount || 0);

                    let daysRemaining = null;
                    if (velocity > 0) {
                        daysRemaining = Math.floor(currentStock / velocity);
                    }

                    results[item.id] = {
                        velocity,
                        totalUsed,
                        daysRemaining
                    };
                });

                setVelocityData(results);
            } catch (error) {
                console.error("Error calculating inventory analytics:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchAnalytics();
    }, [items]);

    return { velocityData, loading };
}
