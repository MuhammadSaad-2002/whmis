-- =============================================================================
-- WHMIS — Stock Loaning module tables
-- Manual SCHEMA update for phpMyAdmin (mirrors migration
-- 2026_08_25_000200_create_stock_loan_tables.php).
--
-- HOW TO USE:
--   phpMyAdmin → select your database → SQL tab → paste → Go. (Or Import.)
--   Run the is_loan batches SQL first. Safe to run once; re-running errors on the
--   existing tables, which simply means it is already applied.
--
-- ADDITIVE ONLY: two new tables + two number-series rows. No money is involved —
-- there is no ledger, receivable, or revenue side. Only physical stock moves.
-- =============================================================================

CREATE TABLE `stock_loans` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `loan_number` VARCHAR(255) NOT NULL,
    `manual_number` TINYINT(1) NOT NULL DEFAULT 0,
    `direction` VARCHAR(255) NOT NULL,
    `company_id` BIGINT UNSIGNED NOT NULL,
    `warehouse_id` BIGINT UNSIGNED NOT NULL,
    `loan_date` DATE NOT NULL,
    `status` VARCHAR(255) NOT NULL DEFAULT 'pending',
    `requested_by_id` BIGINT UNSIGNED NULL,
    `received_by_id` BIGINT UNSIGNED NULL,
    `request_received_by_id` BIGINT UNSIGNED NULL,
    `handed_over_by_id` BIGINT UNSIGNED NULL,
    `total_quantity` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `returned_quantity` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `posted_at` TIMESTAMP NULL,
    `posted_by` BIGINT UNSIGNED NULL,
    `closed_at` TIMESTAMP NULL,
    `created_by` BIGINT UNSIGNED NULL,
    `created_at` TIMESTAMP NULL,
    `updated_at` TIMESTAMP NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `stock_loans_loan_number_unique` (`loan_number`),
    KEY `stock_loans_company_id_loan_date_index` (`company_id`, `loan_date`),
    KEY `stock_loans_direction_status_index` (`direction`, `status`),
    KEY `stock_loans_warehouse_id_foreign` (`warehouse_id`),
    KEY `stock_loans_requested_by_id_foreign` (`requested_by_id`),
    KEY `stock_loans_received_by_id_foreign` (`received_by_id`),
    KEY `stock_loans_request_received_by_id_foreign` (`request_received_by_id`),
    KEY `stock_loans_handed_over_by_id_foreign` (`handed_over_by_id`),
    KEY `stock_loans_posted_by_foreign` (`posted_by`),
    KEY `stock_loans_created_by_foreign` (`created_by`),
    CONSTRAINT `stock_loans_company_id_foreign` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
    CONSTRAINT `stock_loans_warehouse_id_foreign` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`),
    CONSTRAINT `stock_loans_requested_by_id_foreign` FOREIGN KEY (`requested_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
    CONSTRAINT `stock_loans_received_by_id_foreign` FOREIGN KEY (`received_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
    CONSTRAINT `stock_loans_request_received_by_id_foreign` FOREIGN KEY (`request_received_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
    CONSTRAINT `stock_loans_handed_over_by_id_foreign` FOREIGN KEY (`handed_over_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
    CONSTRAINT `stock_loans_posted_by_foreign` FOREIGN KEY (`posted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
    CONSTRAINT `stock_loans_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `stock_loan_items` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `stock_loan_id` BIGINT UNSIGNED NOT NULL,
    `product_id` BIGINT UNSIGNED NOT NULL,
    `batch_id` BIGINT UNSIGNED NULL,
    `batch_number` VARCHAR(255) NULL,
    `expiry_date` DATE NULL,
    `quantity` DECIMAL(12, 2) NOT NULL,
    `returned_quantity` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `remarks` VARCHAR(255) NULL,
    `sort_order` INT UNSIGNED NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP NULL,
    `updated_at` TIMESTAMP NULL,
    PRIMARY KEY (`id`),
    KEY `stock_loan_items_stock_loan_id_foreign` (`stock_loan_id`),
    KEY `stock_loan_items_product_id_foreign` (`product_id`),
    KEY `stock_loan_items_batch_id_foreign` (`batch_id`),
    CONSTRAINT `stock_loan_items_stock_loan_id_foreign` FOREIGN KEY (`stock_loan_id`) REFERENCES `stock_loans` (`id`) ON DELETE CASCADE,
    CONSTRAINT `stock_loan_items_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
    CONSTRAINT `stock_loan_items_batch_id_foreign` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Document number series for the two loan directions (LI-YYYY-0001, LO-YYYY-0001).
INSERT INTO `number_series` (`doc_type`, `prefix`, `next_number`, `padding`, `yearly`, `created_at`, `updated_at`)
SELECT 'loan_in', 'LI', 1, 4, 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM (SELECT * FROM `number_series`) AS n WHERE n.`doc_type` = 'loan_in');

INSERT INTO `number_series` (`doc_type`, `prefix`, `next_number`, `padding`, `yearly`, `created_at`, `updated_at`)
SELECT 'loan_out', 'LO', 1, 4, 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM (SELECT * FROM `number_series`) AS n WHERE n.`doc_type` = 'loan_out');

-- Mark the Laravel migration as run so `php artisan migrate` won't re-apply it.
INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_08_25_000200_create_stock_loan_tables',
       (SELECT COALESCE(MAX(`batch`), 0) + 1 FROM (SELECT * FROM `migrations`) AS m)
WHERE NOT EXISTS (
    SELECT 1 FROM (SELECT * FROM `migrations`) AS x
    WHERE x.`migration` = '2026_08_25_000200_create_stock_loan_tables'
);
