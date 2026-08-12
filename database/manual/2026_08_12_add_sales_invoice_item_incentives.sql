-- Manual SQL for the Laravel migrations:
--   2026_08_12_000100_create_sales_invoice_item_incentives_table
--   2026_08_12_000200_add_incentive_discount_to_sales_invoice_items
--
-- Use this ONLY if you apply schema changes by importing SQL in phpMyAdmin
-- instead of running `php artisan migrate`. Import this file ONCE.
--
-- Adds the incentive stacking + issuance record:
--   * sales_invoice_item_incentives — one row per incentive rule applied to a
--     sales line (the durable "what was given to which customer" ledger).
--     rule_type/rule_name/value_given are snapshotted so the row survives later
--     edits or deletion of the underlying rule. A line may stack at most one
--     incentive per rule_type (enforced by the unique index).
--   * sales_invoice_items.incentive_discount — the aggregated Rs discount from
--     all stacked discount rules, folded into the line math. Additive & safe:
--     existing rows default to 0.

-- 1. New child table --------------------------------------------------------
CREATE TABLE `sales_invoice_item_incentives` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `sales_invoice_item_id` BIGINT UNSIGNED NOT NULL,
    `sales_invoice_id` BIGINT UNSIGNED NOT NULL,
    `customer_id` BIGINT UNSIGNED NULL,
    `product_id` BIGINT UNSIGNED NOT NULL,
    `incentive_rule_id` BIGINT UNSIGNED NULL,
    `rule_type` VARCHAR(255) NOT NULL,
    `rule_name` VARCHAR(255) NOT NULL,
    `bonus_qty` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discount_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `trade_price` DECIMAL(15, 2) NULL,
    `value_given` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `sort_order` INT UNSIGNED NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP NULL,
    `updated_at` TIMESTAMP NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `sii_item_type_unique` (`sales_invoice_item_id`, `rule_type`),
    KEY `sii_invoice_index` (`sales_invoice_id`),
    KEY `sii_customer_rule_index` (`customer_id`, `incentive_rule_id`),
    KEY `sii_product_index` (`product_id`),
    CONSTRAINT `sii_item_fk` FOREIGN KEY (`sales_invoice_item_id`)
        REFERENCES `sales_invoice_items` (`id`) ON DELETE CASCADE,
    CONSTRAINT `sii_invoice_fk` FOREIGN KEY (`sales_invoice_id`)
        REFERENCES `sales_invoices` (`id`) ON DELETE CASCADE,
    CONSTRAINT `sii_customer_fk` FOREIGN KEY (`customer_id`)
        REFERENCES `customers` (`id`) ON DELETE SET NULL,
    CONSTRAINT `sii_product_fk` FOREIGN KEY (`product_id`)
        REFERENCES `products` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `sii_rule_fk` FOREIGN KEY (`incentive_rule_id`)
        REFERENCES `incentive_rules` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. New line column --------------------------------------------------------
ALTER TABLE `sales_invoice_items`
    ADD COLUMN `incentive_discount` DECIMAL(15, 2) NOT NULL DEFAULT 0 AFTER `discount_amount`;

-- 3. Record both migrations as applied so `php artisan migrate` won't re-run them.
INSERT INTO `migrations` (`migration`, `batch`)
VALUES
    ('2026_08_12_000100_create_sales_invoice_item_incentives_table',
        (SELECT b FROM (SELECT COALESCE(MAX(`batch`), 0) + 1 AS b FROM `migrations`) AS t)),
    ('2026_08_12_000200_add_incentive_discount_to_sales_invoice_items',
        (SELECT b FROM (SELECT COALESCE(MAX(`batch`), 0) AS b FROM `migrations`) AS t));
