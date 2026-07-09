-- Manual SQL for the Laravel migration:
--   2026_07_12_000100_add_is_active_to_users
--
-- Use this ONLY if you apply schema changes by importing SQL in phpMyAdmin
-- instead of running `php artisan migrate`. Import this file ONCE.
--
-- Adds users.is_active — false disables the account (blocks login). Additive
-- and safe: existing users default to 1 (active).

ALTER TABLE `users`
    ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1 AFTER `email`;

-- Record the migration as applied so `php artisan migrate` won't re-run it.
INSERT INTO `migrations` (`migration`, `batch`)
VALUES (
    '2026_07_12_000100_add_is_active_to_users',
    (SELECT b FROM (SELECT COALESCE(MAX(`batch`), 0) + 1 AS b FROM `migrations`) AS t)
);
