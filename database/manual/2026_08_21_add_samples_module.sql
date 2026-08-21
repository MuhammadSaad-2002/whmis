-- =============================================================================
-- WHMIS — Samples module (free-of-cost receipts & issues, segregated stock)
-- Manual schema update for phpMyAdmin (mirrors migrations
-- 2026_08_21_000100_add_is_sample_to_batches.php and
-- 2026_08_21_000200_create_sample_tables.php).
--
-- HOW TO USE:
--   phpMyAdmin → select the `whmis` database → Import tab → choose this file → Go.
--   (Or run it in the SQL tab.) Safe to run once; re-running will error on the
--   duplicate column/table, which simply means it is already applied.
--
-- This is ADDITIVE ONLY (one new column on `batches` + four new tables); it does
-- not alter or delete any existing data. Adjust the collation below only if your
-- DB is not utf8mb4_unicode_ci.
--
-- After the schema, also apply the permissions:
--   2026_08_21_seed_samples_permissions.sql   (or run RolePermissionSeeder).
-- =============================================================================

-- 1) Segregate sample stock on the existing batches table. Normal sales never
--    touch is_sample=1 rows; sample stock leaves only via a Sample Issue.
ALTER TABLE `batches`
    ADD COLUMN `is_sample` TINYINT(1) NOT NULL DEFAULT 0 AFTER `warehouse_id`,
    ADD KEY `batches_product_id_warehouse_id_is_sample_index` (`product_id`, `warehouse_id`, `is_sample`);

-- 2) Sample receipts — free samples received (FOC) from a supplier. They stock
--    in like a purchase but at zero cost, so they never inflate COGS.
CREATE TABLE `sample_receipts` (
    `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `receipt_number` VARCHAR(255) NOT NULL,
    `manual_number`  TINYINT(1) NOT NULL DEFAULT 0,
    `company_id`     BIGINT UNSIGNED NOT NULL,
    `warehouse_id`   BIGINT UNSIGNED NOT NULL,
    `receipt_date`   DATE NOT NULL,
    `status`         VARCHAR(255) NOT NULL DEFAULT 'draft',
    `total_quantity` DECIMAL(12,2) NOT NULL DEFAULT 0,
    `notes`          TEXT NULL,
    `posted_at`      TIMESTAMP NULL DEFAULT NULL,
    `posted_by`      BIGINT UNSIGNED NULL,
    `created_by`     BIGINT UNSIGNED NULL,
    `created_at`     TIMESTAMP NULL DEFAULT NULL,
    `updated_at`     TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `sample_receipts_receipt_number_unique` (`receipt_number`),
    KEY `sample_receipts_company_id_receipt_date_index` (`company_id`, `receipt_date`),
    KEY `sample_receipts_status_index` (`status`),
    KEY `sample_receipts_warehouse_id_foreign` (`warehouse_id`),
    KEY `sample_receipts_posted_by_foreign` (`posted_by`),
    KEY `sample_receipts_created_by_foreign` (`created_by`),
    CONSTRAINT `sample_receipts_company_id_foreign`
        FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `sample_receipts_warehouse_id_foreign`
        FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `sample_receipts_posted_by_foreign`
        FOREIGN KEY (`posted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
    CONSTRAINT `sample_receipts_created_by_foreign`
        FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `sample_receipt_items` (
    `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `sample_receipt_id` BIGINT UNSIGNED NOT NULL,
    `product_id`        BIGINT UNSIGNED NOT NULL,
    `batch_number`      VARCHAR(255) NULL,
    `expiry_date`       DATE NULL,
    `quantity`          DECIMAL(12,2) NOT NULL,
    `batch_id`          BIGINT UNSIGNED NULL,
    `remarks`           VARCHAR(255) NULL,
    `sort_order`        INT UNSIGNED NOT NULL DEFAULT 0,
    `created_at`        TIMESTAMP NULL DEFAULT NULL,
    `updated_at`        TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `sample_receipt_items_sample_receipt_id_foreign` (`sample_receipt_id`),
    KEY `sample_receipt_items_product_id_foreign` (`product_id`),
    KEY `sample_receipt_items_batch_id_foreign` (`batch_id`),
    CONSTRAINT `sample_receipt_items_sample_receipt_id_foreign`
        FOREIGN KEY (`sample_receipt_id`) REFERENCES `sample_receipts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `sample_receipt_items_product_id_foreign`
        FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `sample_receipt_items_batch_id_foreign`
        FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Sample issues — products given free to a customer / doctor. No charge, no
--    receivable: revenue is always zero. Sample-origin stock is consumed first,
--    then normal stock (cost_amount holds the COGS of whatever was consumed).
CREATE TABLE `sample_issues` (
    `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `issue_number`        VARCHAR(255) NOT NULL,
    `manual_number`       TINYINT(1) NOT NULL DEFAULT 0,
    `customer_id`         BIGINT UNSIGNED NOT NULL,
    `warehouse_id`        BIGINT UNSIGNED NOT NULL,
    `issue_date`          DATE NOT NULL,
    `recipient_name`      VARCHAR(255) NULL,
    `representative_name` VARCHAR(255) NULL,
    `status`              VARCHAR(255) NOT NULL DEFAULT 'draft',
    `total_quantity`      DECIMAL(12,2) NOT NULL DEFAULT 0,
    `total_cost`          DECIMAL(15,2) NOT NULL DEFAULT 0,
    `notes`               TEXT NULL,
    `posted_at`           TIMESTAMP NULL DEFAULT NULL,
    `posted_by`           BIGINT UNSIGNED NULL,
    `created_by`          BIGINT UNSIGNED NULL,
    `created_at`          TIMESTAMP NULL DEFAULT NULL,
    `updated_at`          TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `sample_issues_issue_number_unique` (`issue_number`),
    KEY `sample_issues_customer_id_issue_date_index` (`customer_id`, `issue_date`),
    KEY `sample_issues_status_index` (`status`),
    KEY `sample_issues_warehouse_id_foreign` (`warehouse_id`),
    KEY `sample_issues_posted_by_foreign` (`posted_by`),
    KEY `sample_issues_created_by_foreign` (`created_by`),
    CONSTRAINT `sample_issues_customer_id_foreign`
        FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `sample_issues_warehouse_id_foreign`
        FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `sample_issues_posted_by_foreign`
        FOREIGN KEY (`posted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
    CONSTRAINT `sample_issues_created_by_foreign`
        FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `sample_issue_items` (
    `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `sample_issue_id` BIGINT UNSIGNED NOT NULL,
    `product_id`      BIGINT UNSIGNED NOT NULL,
    `batch_id`        BIGINT UNSIGNED NULL,
    `quantity`        DECIMAL(12,2) NOT NULL,
    `cost_amount`     DECIMAL(15,4) NOT NULL DEFAULT 0,
    `remarks`         VARCHAR(255) NULL,
    `sort_order`      INT UNSIGNED NOT NULL DEFAULT 0,
    `created_at`      TIMESTAMP NULL DEFAULT NULL,
    `updated_at`      TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `sample_issue_items_sample_issue_id_foreign` (`sample_issue_id`),
    KEY `sample_issue_items_product_id_foreign` (`product_id`),
    KEY `sample_issue_items_batch_id_foreign` (`batch_id`),
    CONSTRAINT `sample_issue_items_sample_issue_id_foreign`
        FOREIGN KEY (`sample_issue_id`) REFERENCES `sample_issues` (`id`) ON DELETE CASCADE,
    CONSTRAINT `sample_issue_items_product_id_foreign`
        FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `sample_issue_items_batch_id_foreign`
        FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Mark both Laravel migrations as run so `php artisan migrate` will not try to
--    re-apply them later (keeps the migrations ledger in sync with the schema).
INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_08_21_000100_add_is_sample_to_batches',
       (SELECT COALESCE(MAX(`batch`), 0) + 1 FROM (SELECT * FROM `migrations`) AS m)
WHERE NOT EXISTS (
    SELECT 1 FROM (SELECT * FROM `migrations`) AS x
    WHERE x.`migration` = '2026_08_21_000100_add_is_sample_to_batches'
);

INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_08_21_000200_create_sample_tables',
       (SELECT COALESCE(MAX(`batch`), 0) + 1 FROM (SELECT * FROM `migrations`) AS m)
WHERE NOT EXISTS (
    SELECT 1 FROM (SELECT * FROM `migrations`) AS x
    WHERE x.`migration` = '2026_08_21_000200_create_sample_tables'
);
