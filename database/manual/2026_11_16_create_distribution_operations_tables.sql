-- Import ONCE before deploying the distribution operations release.
-- Alternative to migration 2026_11_16_000100_create_distribution_operations_tables.
-- Back up first; stop on error. Do not import if that migration already ran.
CREATE TABLE `booker_visits` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `booker_id` BIGINT UNSIGNED NOT NULL, `customer_id` BIGINT UNSIGNED NOT NULL,
  `visit_date` DATE NOT NULL, `outcome` VARCHAR(255) NOT NULL DEFAULT 'planned', `notes` TEXT NULL,
  `created_at` TIMESTAMP NULL, `updated_at` TIMESTAMP NULL,
  UNIQUE KEY `booker_visits_booker_id_customer_id_visit_date_unique` (`booker_id`,`customer_id`,`visit_date`),
  FOREIGN KEY (`booker_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dispatches` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `sales_invoice_id` BIGINT UNSIGNED NOT NULL UNIQUE, `assigned_to` BIGINT UNSIGNED NULL,
  `status` VARCHAR(255) NOT NULL DEFAULT 'pending', `created_at` TIMESTAMP NULL, `updated_at` TIMESTAMP NULL,
  FOREIGN KEY (`sales_invoice_id`) REFERENCES `sales_invoices` (`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dispatch_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, `dispatch_id` BIGINT UNSIGNED NOT NULL,
  `action` VARCHAR(255) NOT NULL, `request_key` CHAR(36) NOT NULL UNIQUE,
  `assigned_to` BIGINT UNSIGNED NULL,
  `receiver_name` VARCHAR(255) NULL, `notes` TEXT NULL, `created_by` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`dispatch_id`) REFERENCES `dispatches` (`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dispatch_event_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `dispatch_event_id` BIGINT UNSIGNED NOT NULL, `sales_invoice_item_id` BIGINT UNSIGNED NOT NULL,
  `quantity` DECIMAL(14,2) NOT NULL,
  UNIQUE KEY `dispatch_event_line_unique` (`dispatch_event_id`,`sales_invoice_item_id`),
  FOREIGN KEY (`dispatch_event_id`) REFERENCES `dispatch_events` (`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`sales_invoice_item_id`) REFERENCES `sales_invoice_items` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `collection_follow_ups` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, `sales_invoice_id` BIGINT UNSIGNED NOT NULL,
  `assigned_to` BIGINT UNSIGNED NULL, `outcome` VARCHAR(255) NOT NULL,
  `promised_date` DATE NULL, `promised_amount` DECIMAL(14,2) NULL, `next_follow_up` DATE NOT NULL,
  `notes` TEXT NOT NULL, `created_by` BIGINT UNSIGNED NOT NULL, `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `collection_follow_ups_sales_invoice_id_id_index` (`sales_invoice_id`,`id`),
  FOREIGN KEY (`sales_invoice_id`) REFERENCES `sales_invoices` (`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_11_16_000100_create_distribution_operations_tables', COALESCE(MAX(`batch`), 0) + 1 FROM `migrations`
HAVING NOT EXISTS (SELECT 1 FROM `migrations` WHERE `migration` = '2026_11_16_000100_create_distribution_operations_tables');
