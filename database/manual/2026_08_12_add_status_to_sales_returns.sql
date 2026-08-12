-- Manual SQL for the Laravel migration:
--   2026_08_12_000100_add_status_to_sales_returns
--
-- Use this ONLY if you apply schema changes by importing SQL in phpMyAdmin
-- instead of running `php artisan migrate`. Import this file ONCE.
--
-- Adds the return-status lifecycle to sales_returns:
--   status        'posted' (default) or 'cancelled'
--   cancelled_at  when the return was reversed
--   cancelled_by  the user who reversed it (FK users, null on delete)
-- Additive and safe: existing rows default to 'posted' (a valid, counted return).

ALTER TABLE `sales_returns`
    ADD COLUMN `status` VARCHAR(255) NOT NULL DEFAULT 'posted' AFTER `return_date`,
    ADD COLUMN `cancelled_at` TIMESTAMP NULL DEFAULT NULL AFTER `reason`,
    ADD COLUMN `cancelled_by` BIGINT UNSIGNED NULL DEFAULT NULL AFTER `cancelled_at`,
    ADD CONSTRAINT `sales_returns_cancelled_by_foreign`
        FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

-- Record the migration as applied so `php artisan migrate` won't re-run it.
INSERT INTO `migrations` (`migration`, `batch`)
VALUES (
    '2026_08_12_000100_add_status_to_sales_returns',
    (SELECT b FROM (SELECT COALESCE(MAX(`batch`), 0) + 1 AS b FROM `migrations`) AS t)
);
