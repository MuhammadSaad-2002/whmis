-- Manual SQL for the Laravel migration:
--   2026_07_11_000100_add_stock_reserved_to_sales_invoices
--
-- Use this ONLY if you apply schema changes by importing SQL in phpMyAdmin
-- instead of running `php artisan migrate`. Import this file ONCE.
--
-- Adds sales_invoices.stock_reserved — true while a draft sale holds a batch
-- reservation (stock moved from qty_available to qty_reserved). Additive and
-- safe: existing rows default to 0 (not reserved).

ALTER TABLE `sales_invoices`
    ADD COLUMN `stock_reserved` TINYINT(1) NOT NULL DEFAULT 0 AFTER `status`;

-- Record the migration as applied so `php artisan migrate` won't re-run it.
INSERT INTO `migrations` (`migration`, `batch`)
VALUES (
    '2026_07_11_000100_add_stock_reserved_to_sales_invoices',
    (SELECT b FROM (SELECT COALESCE(MAX(`batch`), 0) + 1 AS b FROM `migrations`) AS t)
);
