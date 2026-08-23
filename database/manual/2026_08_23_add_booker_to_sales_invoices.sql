-- =============================================================================
-- WHMIS — Sales invoices: optional booker link
-- Manual SCHEMA update for phpMyAdmin (mirrors migration
-- 2026_08_23_000200_add_booker_to_sales_invoices.php).
--
-- HOW TO USE:
--   phpMyAdmin → select your database → SQL tab → paste → Go. (Or Import.)
--   Safe to run once; re-running errors on the duplicate column, which simply
--   means it is already applied.
--
-- This is ADDITIVE ONLY (one nullable column + FK); it alters/deletes no existing
-- data. The new `booker_id` is an optional reference to the user (a Booker) whom
-- an admin/manager credited with the sale; it never enters money/stock math.
-- Adjust nothing else. Leave the column NULL to keep pre-existing behaviour.
-- =============================================================================

ALTER TABLE `sales_invoices`
    ADD COLUMN `booker_id` BIGINT UNSIGNED NULL AFTER `customer_id`,
    ADD KEY `sales_invoices_booker_id_foreign` (`booker_id`),
    ADD CONSTRAINT `sales_invoices_booker_id_foreign`
        FOREIGN KEY (`booker_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

-- Mark the Laravel migration as run so `php artisan migrate` will not try to
-- re-apply it later (keeps the migrations ledger in sync with the schema).
INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_08_23_000200_add_booker_to_sales_invoices',
       (SELECT COALESCE(MAX(`batch`), 0) + 1 FROM (SELECT * FROM `migrations`) AS m)
WHERE NOT EXISTS (
    SELECT 1 FROM (SELECT * FROM `migrations`) AS x
    WHERE x.`migration` = '2026_08_23_000200_add_booker_to_sales_invoices'
);
