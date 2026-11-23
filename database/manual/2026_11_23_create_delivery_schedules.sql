-- Back up the database first. Requires the existing distribution operations tables.
-- Safe to rerun; does not schedule any historical invoices.
CREATE TABLE IF NOT EXISTS `customer_delivery_schedules` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `customer_id` BIGINT UNSIGNED NOT NULL,
    `salesman_id` BIGINT UNSIGNED NULL,
    `booking_days` JSON NOT NULL,
    `delivery_days` JSON NOT NULL,
    `delivery_enabled_at` TIMESTAMP NULL,
    `created_at` TIMESTAMP NULL, `updated_at` TIMESTAMP NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `customer_delivery_schedules_customer_id_unique` (`customer_id`),
    CONSTRAINT `customer_delivery_schedules_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `customer_delivery_schedules_salesman_id_foreign` FOREIGN KEY (`salesman_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @tradentra_delivery_date_ddl = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dispatches' AND COLUMN_NAME = 'planned_date'),
    'SELECT 1',
    'ALTER TABLE `dispatches` ADD COLUMN `planned_date` DATE NULL'
);
PREPARE tradentra_delivery_date FROM @tradentra_delivery_date_ddl;
EXECUTE tradentra_delivery_date;
DEALLOCATE PREPARE tradentra_delivery_date;

SET @tradentra_delivery_index_ddl = IF(
    EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dispatches' AND INDEX_NAME = 'dispatches_planned_date_index'),
    'SELECT 1',
    'ALTER TABLE `dispatches` ADD INDEX `dispatches_planned_date_index` (`planned_date`)'
);
PREPARE tradentra_delivery_index FROM @tradentra_delivery_index_ddl;
EXECUTE tradentra_delivery_index;
DEALLOCATE PREPARE tradentra_delivery_index;

INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_11_23_000200_create_delivery_schedules', COALESCE(MAX(`batch`), 0) + 1
FROM `migrations`
HAVING EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dispatches' AND INDEX_NAME = 'dispatches_planned_date_index'
) AND NOT EXISTS (
    SELECT 1 FROM `migrations` WHERE `migration` = '2026_11_23_000200_create_delivery_schedules'
);
