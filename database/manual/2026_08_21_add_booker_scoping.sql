-- =============================================================================
-- WHMIS — Booker scoping (multi-booker customers + assignment audit log)
-- Manual schema update for phpMyAdmin (mirrors migrations
-- 2026_08_21_000300_create_booker_customer_table.php and
-- 2026_08_21_000400_create_booker_assignment_logs_table.php).
--
-- HOW TO USE:
--   phpMyAdmin → select the `whmis` database → Import tab → choose this file → Go.
--   (Or run it in the SQL tab.) Safe to run once; re-running will error on the
--   duplicate table, which simply means it is already applied.
--
-- This is ADDITIVE ONLY (two new tables); it does not alter or delete any
-- existing data. The existing `customers.booker_id` stays as the PRIMARY booker;
-- the new `booker_customer` pivot holds the full set of bookers who may see/book
-- a customer. Adjust the collation below only if your DB is not
-- utf8mb4_unicode_ci.
--
-- After the schema, also apply the permissions:
--   2026_08_21_seed_booker_scoping_permissions.sql  (or run RolePermissionSeeder).
-- =============================================================================

-- 1) Pivot: which bookers are assigned to a customer (a customer may have many).
CREATE TABLE `booker_customer` (
    `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `customer_id` BIGINT UNSIGNED NOT NULL,
    `booker_id`   BIGINT UNSIGNED NOT NULL,
    `assigned_by` BIGINT UNSIGNED NULL,
    `created_at`  TIMESTAMP NULL DEFAULT NULL,
    `updated_at`  TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `booker_customer_customer_id_booker_id_unique` (`customer_id`, `booker_id`),
    KEY `booker_customer_booker_id_foreign` (`booker_id`),
    KEY `booker_customer_assigned_by_foreign` (`assigned_by`),
    CONSTRAINT `booker_customer_customer_id_foreign`
        FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
    CONSTRAINT `booker_customer_booker_id_foreign`
        FOREIGN KEY (`booker_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `booker_customer_assigned_by_foreign`
        FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Append-only audit of every assignment change (assigned / unassigned).
--    Written explicitly by the app because pivot sync() fires no model events.
CREATE TABLE `booker_assignment_logs` (
    `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `customer_id` BIGINT UNSIGNED NOT NULL,
    `booker_id`   BIGINT UNSIGNED NOT NULL,
    `action`      VARCHAR(255) NOT NULL,
    `changed_by`  BIGINT UNSIGNED NULL,
    `note`        VARCHAR(255) NULL,
    `created_at`  TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `booker_assignment_logs_customer_id_created_at_index` (`customer_id`, `created_at`),
    KEY `booker_assignment_logs_booker_id_foreign` (`booker_id`),
    KEY `booker_assignment_logs_changed_by_foreign` (`changed_by`),
    CONSTRAINT `booker_assignment_logs_customer_id_foreign`
        FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
    CONSTRAINT `booker_assignment_logs_booker_id_foreign`
        FOREIGN KEY (`booker_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `booker_assignment_logs_changed_by_foreign`
        FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Mark both Laravel migrations as run so `php artisan migrate` will not try to
--    re-apply them later (keeps the migrations ledger in sync with the schema).
INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_08_21_000300_create_booker_customer_table',
       (SELECT COALESCE(MAX(`batch`), 0) + 1 FROM (SELECT * FROM `migrations`) AS m)
WHERE NOT EXISTS (
    SELECT 1 FROM (SELECT * FROM `migrations`) AS x
    WHERE x.`migration` = '2026_08_21_000300_create_booker_customer_table'
);

INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_08_21_000400_create_booker_assignment_logs_table',
       (SELECT COALESCE(MAX(`batch`), 0) + 1 FROM (SELECT * FROM `migrations`) AS m)
WHERE NOT EXISTS (
    SELECT 1 FROM (SELECT * FROM `migrations`) AS x
    WHERE x.`migration` = '2026_08_21_000400_create_booker_assignment_logs_table'
);
