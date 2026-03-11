-- Performance indexes for PrintPlay App
-- Run once in Supabase SQL Editor

CREATE INDEX IF NOT EXISTS idx_order_items_shift_id ON order_items(shift_id);
CREATE INDEX IF NOT EXISTS idx_order_items_timestamp ON order_items(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_pc_transactions_shift_id ON pc_transactions(shift_id);
CREATE INDEX IF NOT EXISTS idx_pc_transactions_timestamp ON pc_transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_shift_id ON expenses(shift_id);
CREATE INDEX IF NOT EXISTS idx_expenses_timestamp ON expenses(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_shifts_start_time ON shifts(start_time DESC);
