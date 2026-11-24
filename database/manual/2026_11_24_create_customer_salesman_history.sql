-- Booking & Delivery Schedules: append-only history of default salesman changes.
-- Requires the existing customers and delivery schedules tables. Safe to re-import.
-- No existing schedules, dispatches, invoices, or commissions are modified.
CREATE TABLE IF NOT EXISTS `customer_salesman_history` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `customer_id` BIGINT UNSIGNED NOT NULL,
    `previous_salesman_id` BIGINT UNSIGNED NULL,
    `previous_salesman_name` VARCHAR(255) NULL,
    `salesman_id` BIGINT UNSIGNED NULL,
    `salesman_name` VARCHAR(255) NULL,
    `changed_by_id` BIGINT UNSIGNED NULL,
    `changed_by_name` VARCHAR(255) NULL,
    `changed_at` TIMESTAMP NOT NULL,
    KEY `customer_salesman_history_lookup` (`customer_id`, `id`),
    CONSTRAINT `customer_salesman_history_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_11_24_000700_create_customer_salesman_history', COALESCE(MAX(`batch`), 0) + 1
FROM `migrations`
HAVING NOT EXISTS (
    SELECT 1 FROM `migrations` WHERE `migration` = '2026_11_24_000700_create_customer_salesman_history'
);
