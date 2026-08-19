-- =============================================================================
-- WHMIS — Multiple incentive rules per booking line
-- Manual schema update for phpMyAdmin (mirrors migration
-- 2026_08_19_000100_add_incentives_to_booking_items.php).
--
-- HOW TO USE:
--   phpMyAdmin → select the `whmis` database → Import tab → choose this file → Go.
--   (Or run it in the SQL tab.) Safe to run once; re-running will error on the
--   duplicate table/column, which simply means it is already applied.
--
-- Adjust the collation below only if your DB is not utf8mb4_unicode_ci.
-- =============================================================================

-- 1) New column on booking_items: Rs discount contributed by stacked incentive
--    rules, folded into the line discount alongside the manual discount_percent.
ALTER TABLE `booking_items`
    ADD COLUMN `incentive_discount` DECIMAL(15,2) NOT NULL DEFAULT 0 AFTER `discount_amount`;

-- 2) Durable per-line record of every incentive rule applied to a booking
--    (a copy of sales_invoice_item_incentives) so the stacked rules survive
--    editing and conversion to a sale.
CREATE TABLE `booking_item_incentives` (
    `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `booking_item_id`   BIGINT UNSIGNED NOT NULL,
    `booking_id`        BIGINT UNSIGNED NOT NULL,
    `customer_id`       BIGINT UNSIGNED NULL,
    `product_id`        BIGINT UNSIGNED NOT NULL,
    `incentive_rule_id` BIGINT UNSIGNED NULL,
    `rule_type`         VARCHAR(255) NOT NULL,
    `rule_name`         VARCHAR(255) NOT NULL,
    `bonus_qty`         DECIMAL(12,2) NOT NULL DEFAULT 0,
    `discount_amount`   DECIMAL(15,2) NOT NULL DEFAULT 0,
    `trade_price`       DECIMAL(15,2) NULL,
    `value_given`       DECIMAL(15,2) NOT NULL DEFAULT 0,
    `sort_order`        INT UNSIGNED NOT NULL DEFAULT 0,
    `created_at`        TIMESTAMP NULL DEFAULT NULL,
    `updated_at`        TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `booking_item_incentives_booking_item_id_rule_type_unique` (`booking_item_id`, `rule_type`),
    KEY `booking_item_incentives_booking_id_index` (`booking_id`),
    KEY `booking_item_incentives_customer_id_incentive_rule_id_index` (`customer_id`, `incentive_rule_id`),
    KEY `booking_item_incentives_product_id_foreign` (`product_id`),
    KEY `booking_item_incentives_incentive_rule_id_foreign` (`incentive_rule_id`),
    CONSTRAINT `booking_item_incentives_booking_item_id_foreign`
        FOREIGN KEY (`booking_item_id`) REFERENCES `booking_items` (`id`) ON DELETE CASCADE,
    CONSTRAINT `booking_item_incentives_booking_id_foreign`
        FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE,
    CONSTRAINT `booking_item_incentives_customer_id_foreign`
        FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL,
    CONSTRAINT `booking_item_incentives_product_id_foreign`
        FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
    CONSTRAINT `booking_item_incentives_incentive_rule_id_foreign`
        FOREIGN KEY (`incentive_rule_id`) REFERENCES `incentive_rules` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Mark the Laravel migration as run so `php artisan migrate` will not try to
--    re-apply it later (keeps the migrations ledger in sync with the schema).
INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_08_19_000100_add_incentives_to_booking_items',
       (SELECT COALESCE(MAX(`batch`), 0) + 1 FROM (SELECT * FROM `migrations`) AS m)
WHERE NOT EXISTS (
    SELECT 1 FROM (SELECT * FROM `migrations`) AS x
    WHERE x.`migration` = '2026_08_19_000100_add_incentives_to_booking_items'
);
