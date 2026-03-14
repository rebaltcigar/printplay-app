-- scripts/backfill-customer-stats.sql
-- Phase 6a: Compute lifetime_value, outstanding_balance, total_orders for each customer.
-- Run AFTER resolve-staff-ids.sql (needs resequenced IDs on orders and invoices).

UPDATE customers c
SET
    total_orders        = (
        SELECT COUNT(*)
        FROM   orders
        WHERE  customer_id = c.id
        AND    is_deleted  = FALSE
    ),
    lifetime_value      = (
        SELECT COALESCE(SUM(total), 0)
        FROM   orders
        WHERE  customer_id = c.id
        AND    is_deleted  = FALSE
    ),
    outstanding_balance = (
        SELECT COALESCE(SUM(balance), 0)
        FROM   invoices
        WHERE  customer_id = c.id
        AND    UPPER(status) != 'PAID'
    );

-- VERIFY
SELECT
    COUNT(*)                                              AS total_customers,
    COUNT(*) FILTER (WHERE total_orders > 0)              AS with_orders,
    COUNT(*) FILTER (WHERE outstanding_balance > 0)       AS with_balance,
    ROUND(AVG(lifetime_value)::NUMERIC, 2)                AS avg_lifetime_value,
    SUM(lifetime_value)                                   AS total_revenue
FROM customers;
