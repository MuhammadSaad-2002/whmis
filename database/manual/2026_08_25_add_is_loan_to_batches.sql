-- =============================================================================
-- WHMIS — Batches: is_loan flag (Stock Loaning module)
-- Manual SCHEMA update for phpMyAdmin (mirrors migration
-- 2026_08_25_000100_add_is_loan_to_batches.php).
--
-- HOW TO USE:
--   phpMyAdmin → select your database → SQL tab → paste → Go. (Or Import.)
--   Safe to run once; re-running errors on the duplicate column, which simply
--   means it is already applied.
--
-- ADDITIVE ONLY (one boolean column + index); alters/deletes no existing data.
-- Loaned-in stock is segregated: batches with is_loan = 1 belong to a lender and
-- are never sold or issued. Existing rows default to 0 (unchanged behaviour).
-- =============================================================================

ALTER TABLE `batches`
    ADD COLUMN `is_loan` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_sample`,
    ADD KEY `batches_product_id_warehouse_id_is_loan_index` (`product_id`, `warehouse_id`, `is_loan`);

INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_08_25_000100_add_is_loan_to_batches',
       (SELECT COALESCE(MAX(`batch`), 0) + 1 FROM (SELECT * FROM `migrations`) AS m)
WHERE NOT EXISTS (
    SELECT 1 FROM (SELECT * FROM `migrations`) AS x
    WHERE x.`migration` = '2026_08_25_000100_add_is_loan_to_batches'
);
