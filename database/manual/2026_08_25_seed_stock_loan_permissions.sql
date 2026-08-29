-- Manual SEED data for the Stock Loaning module (RolePermissionSeeder additions).
--
-- Use this ONLY if you seed on live by importing SQL in phpMyAdmin instead of
-- running `php artisan db:seed --class=RolePermissionSeeder`. Safe to re-import
-- (idempotent: INSERT IGNORE). NOT a schema migration, so it is not recorded in
-- the `migrations` table.
--
-- Production install/import order for the full loaning module:
--   1) database/manual/2026_08_25_add_is_loan_to_batches.sql
--   2) database/manual/2026_08_25_create_stock_loan_tables.sql
--   3) this file
--
-- Adds the five loan permissions and grants them so the Stock Loans menu and
-- routes work:
--   * loans.view / create / post / return / cancel -> Super Admin, Admin
--   * loans.view -> Accountant
--   * loans.view / create / post / return -> Warehouse Staff
--   * Booker gets no stock-loan permissions

-- 1) Create the permissions if they do not exist yet (unique on name+guard_name).
INSERT IGNORE INTO `permissions` (`name`, `guard_name`, `created_at`, `updated_at`)
VALUES
    ('loans.view',   'web', NOW(), NOW()),
    ('loans.create', 'web', NOW(), NOW()),
    ('loans.post',   'web', NOW(), NOW()),
    ('loans.return', 'web', NOW(), NOW()),
    ('loans.cancel', 'web', NOW(), NOW());

-- 2) Grant all loan permissions to Super Admin and Admin.
INSERT IGNORE INTO `role_has_permissions` (`permission_id`, `role_id`)
SELECT p.`id`, r.`id`
FROM `permissions` p
JOIN `roles` r
    ON r.`guard_name` = 'web'
   AND r.`name` IN ('Super Admin', 'Admin')
WHERE p.`guard_name` = 'web'
  AND p.`name` IN ('loans.view', 'loans.create', 'loans.post', 'loans.return', 'loans.cancel');

-- 3) Grant view-only access to Accountant.
INSERT IGNORE INTO `role_has_permissions` (`permission_id`, `role_id`)
SELECT p.`id`, r.`id`
FROM `permissions` p
JOIN `roles` r
    ON r.`guard_name` = 'web'
   AND r.`name` = 'Accountant'
WHERE p.`guard_name` = 'web'
  AND p.`name` = 'loans.view';

-- 4) Grant operational loan access to Warehouse Staff, but not cancellation.
INSERT IGNORE INTO `role_has_permissions` (`permission_id`, `role_id`)
SELECT p.`id`, r.`id`
FROM `permissions` p
JOIN `roles` r
    ON r.`guard_name` = 'web'
   AND r.`name` = 'Warehouse Staff'
WHERE p.`guard_name` = 'web'
  AND p.`name` IN ('loans.view', 'loans.create', 'loans.post', 'loans.return');

-- 5) IMPORTANT - reset Spatie's permission cache so the new permissions take
--    effect immediately. Run the line below ONLY if your CACHE_STORE is the
--    database. If it errors with "table 'cache' doesn't exist", you are on file
--    cache - skip it and instead delete files under storage/framework/cache/data/
--    via cPanel File Manager. Steps 1-4 above have already applied regardless.
--    If you do neither, the cache self-expires within 24h.
DELETE FROM `cache` WHERE `key` LIKE '%spatie.permission.cache%';
