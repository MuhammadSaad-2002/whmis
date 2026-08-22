-- Manual SEED data for Booker scoping (RolePermissionSeeder additions).
--
-- Use this ONLY if you seed on live by importing SQL in phpMyAdmin instead of
-- running `php artisan db:seed --class=RolePermissionSeeder`. Safe to re-import
-- (idempotent: INSERT IGNORE). NOT a schema migration, so it is not recorded in
-- the `migrations` table. Run 2026_08_21_add_booker_scoping.sql (the schema)
-- first.
--
-- Adds the three permissions that scope the Booker role down:
--   * products.view_cost  -> Super Admin, Admin, Accountant, Warehouse Staff
--       (purchase-price / cost visibility; Booker deliberately excluded)
--   * dashboard.view_all  -> Super Admin, Admin, Accountant, Warehouse Staff
--       (company-wide financial dashboard; Booker sees only the stripped view)
--   * bookers.assign      -> Super Admin, Admin
--       (assign customers to bookers)
-- The Booker role keeps only its existing permissions — no cost, no full
-- dashboard, no assign.

-- 1) Create the permissions if they don't exist yet (unique on name+guard_name).
INSERT IGNORE INTO `permissions` (`name`, `guard_name`, `created_at`, `updated_at`)
VALUES
    ('products.view_cost', 'web', NOW(), NOW()),
    ('dashboard.view_all', 'web', NOW(), NOW()),
    ('bookers.assign',     'web', NOW(), NOW());

-- 2a) Grant products.view_cost + dashboard.view_all to every dashboard role
--     except Booker.
INSERT IGNORE INTO `role_has_permissions` (`permission_id`, `role_id`)
SELECT p.`id`, r.`id`
FROM `permissions` p
JOIN `roles` r
    ON r.`guard_name` = 'web'
   AND r.`name` IN ('Super Admin', 'Admin', 'Accountant', 'Warehouse Staff')
WHERE p.`guard_name` = 'web'
  AND p.`name` IN ('products.view_cost', 'dashboard.view_all');

-- 2b) Grant bookers.assign to Super Admin and Admin only.
INSERT IGNORE INTO `role_has_permissions` (`permission_id`, `role_id`)
SELECT p.`id`, r.`id`
FROM `permissions` p
JOIN `roles` r
    ON r.`guard_name` = 'web'
   AND r.`name` IN ('Super Admin', 'Admin')
WHERE p.`guard_name` = 'web'
  AND p.`name` = 'bookers.assign';

-- 3) IMPORTANT — reset spatie's permission cache so the new permissions take
--    effect immediately. Run the line below ONLY if your CACHE_STORE is the
--    database. If it errors with "table 'cache' doesn't exist", you're on file
--    cache — skip it and instead delete the files under
--    storage/framework/cache/data/ via cPanel File Manager. Steps 1–2 above have
--    already applied regardless. If you do neither, the cache self-expires within
--    24h and the new gating takes effect after that.
DELETE FROM `cache` WHERE `key` LIKE '%spatie.permission.cache%';
