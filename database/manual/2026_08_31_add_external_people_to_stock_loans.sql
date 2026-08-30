-- =============================================================================
-- WHMIS - Stock Loaning: external partner people fields
-- Manual SCHEMA update for phpMyAdmin (mirrors migration
-- 2026_08_31_000100_add_external_people_to_stock_loans.php).
--
-- HOW TO USE:
--   phpMyAdmin -> select your database -> SQL tab -> paste -> Go. (Or Import.)
--   Run only after the stock loaning tables already exist.
--
-- ADDITIVE ONLY: adds two nullable text fields. Existing rows keep working.
-- Loan Stock Out uses these fields for the outside-party people who requested
-- and received stock. Internal WHMIS staff still use the user-linked
-- request_received_by_id and handed_over_by_id fields.
-- =============================================================================

ALTER TABLE `stock_loans`
    ADD COLUMN `external_requested_by` VARCHAR(255) NULL AFTER `received_by_id`,
    ADD COLUMN `external_received_by` VARCHAR(255) NULL AFTER `external_requested_by`;

INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_08_31_000100_add_external_people_to_stock_loans',
       (SELECT COALESCE(MAX(`batch`), 0) + 1 FROM (SELECT * FROM `migrations`) AS m)
WHERE NOT EXISTS (
    SELECT 1 FROM (SELECT * FROM `migrations`) AS x
    WHERE x.`migration` = '2026_08_31_000100_add_external_people_to_stock_loans'
);
