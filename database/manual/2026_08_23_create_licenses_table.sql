-- =============================================================================
-- WHMIS — Licensing: create the `licenses` table
-- Manual SCHEMA update for phpMyAdmin (mirrors migration
-- 2026_08_23_000100_create_licenses_table.php).
--
-- HOW TO USE:
--   phpMyAdmin → select your database (e.g. vwisdomo_whms) → SQL tab → paste →
--   Go. (Or Import this file.) Safe to run once; re-running is a no-op because of
--   CREATE TABLE IF NOT EXISTS.
--
-- RUN THIS FIRST, then run the seed file:
--   2026_08_24_seed_license.sql  (permissions + initial one-month license).
--
-- This is ADDITIVE ONLY (one new table); it alters/deletes no existing data.
-- Each row is one activation key; the effective expiry is MAX(expires_at) across
-- all rows. Adjust the collation below only if your DB is not utf8mb4_unicode_ci.
-- =============================================================================

CREATE TABLE IF NOT EXISTS `licenses` (
    `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `key`          VARCHAR(255) NOT NULL,
    `expires_at`   TIMESTAMP NOT NULL,
    `activated_at` TIMESTAMP NOT NULL,
    `activated_by` BIGINT UNSIGNED NULL,
    `notes`        VARCHAR(255) NULL,
    `created_at`   TIMESTAMP NULL DEFAULT NULL,
    `updated_at`   TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `licenses_key_unique` (`key`),
    KEY `licenses_expires_at_index` (`expires_at`),
    KEY `licenses_activated_by_foreign` (`activated_by`),
    CONSTRAINT `licenses_activated_by_foreign`
        FOREIGN KEY (`activated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mark the Laravel migration as run so `php artisan migrate` will not try to
-- re-apply it later (keeps the migrations ledger in sync with the schema).
INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_08_23_000100_create_licenses_table',
       (SELECT COALESCE(MAX(`batch`), 0) + 1 FROM (SELECT * FROM `migrations`) AS m)
WHERE NOT EXISTS (
    SELECT 1 FROM (SELECT * FROM `migrations`) AS x
    WHERE x.`migration` = '2026_08_23_000100_create_licenses_table'
);
