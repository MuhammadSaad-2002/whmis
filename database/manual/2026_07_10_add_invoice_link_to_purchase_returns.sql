-- Manual SQL for the Laravel migration:
--   2026_07_10_000100_add_invoice_link_to_purchase_returns
--
-- Use this ONLY if you apply migrations by importing SQL in phpMyAdmin instead
-- of running `php artisan migrate`. Import this file ONCE into the app database.
--
-- It makes purchase returns invoice-based by linking them to the purchase
-- invoice / line they return against. Both columns are nullable, so existing
-- rows are unaffected. It also records the migration in the `migrations` table
-- so a later `php artisan migrate` will NOT try to run it again.

-- 1) Link a purchase return to the purchase invoice it is made against.
ALTER TABLE `purchase_returns`
    ADD COLUMN `purchase_invoice_id` BIGINT UNSIGNED NULL AFTER `company_id`,
    ADD CONSTRAINT `purchase_returns_purchase_invoice_id_foreign`
        FOREIGN KEY (`purchase_invoice_id`)
        REFERENCES `purchase_invoices` (`id`)
        ON DELETE RESTRICT;

-- 2) Link each return line to the purchase-invoice line it returns.
ALTER TABLE `purchase_return_items`
    ADD COLUMN `purchase_invoice_item_id` BIGINT UNSIGNED NULL AFTER `purchase_return_id`,
    ADD CONSTRAINT `purchase_return_items_purchase_invoice_item_id_foreign`
        FOREIGN KEY (`purchase_invoice_item_id`)
        REFERENCES `purchase_invoice_items` (`id`)
        ON DELETE RESTRICT;

-- 3) Mark the migration as applied (derived-table subquery avoids MariaDB's
--    "can't specify target table" restriction when reading MAX(batch)).
INSERT INTO `migrations` (`migration`, `batch`)
VALUES (
    '2026_07_10_000100_add_invoice_link_to_purchase_returns',
    (SELECT b FROM (SELECT COALESCE(MAX(`batch`), 0) + 1 AS b FROM `migrations`) AS t)
);
