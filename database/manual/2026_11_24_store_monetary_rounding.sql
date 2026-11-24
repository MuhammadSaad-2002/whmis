-- Additive only. Does not rewrite any posted invoices, payments or balances.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rounding_amount DECIMAL(5,2) NULL;
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS rounding_amount DECIMAL(5,2) NULL;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS rounding_amount DECIMAL(5,2) NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS tendered_paisa BIGINT UNSIGNED NULL,
                     ADD COLUMN IF NOT EXISTS received_paisa BIGINT UNSIGNED NULL;

INSERT INTO migrations (migration, batch)
SELECT '2026_11_24_001000_store_monetary_rounding', COALESCE(MAX(batch), 0) + 1
FROM migrations
HAVING NOT EXISTS (SELECT 1 FROM migrations WHERE migration = '2026_11_24_001000_store_monetary_rounding');
