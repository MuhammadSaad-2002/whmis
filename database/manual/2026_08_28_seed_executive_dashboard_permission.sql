-- Manual SEED data for the Executive Dashboard (RolePermissionSeeder addition).
--
-- Use this ONLY if you seed on live by importing SQL in phpMyAdmin instead of
-- running `php artisan db:seed --class=RolePermissionSeeder`. Safe to re-import
-- (idempotent: INSERT IGNORE). NOT a schema migration, so it is not recorded in
-- the `migrations` table.
--
-- Adds the single `dashboard.executive` permission and grants it so the richer
-- Executive Dashboard (period KPIs, charts, PDF export) is shown to:
--   * dashboard.executive -> Super Admin and Admin ONLY
-- (matches RolePermissionSeeder: Accountant, Warehouse Staff and Booker keep the
-- existing dashboards and do NOT get this permission.)

-- 1) Create the permission if it doesn't exist yet (unique on name+guard_name).
INSERT IGNORE INTO `permissions` (`name`, `guard_name`, `created_at`, `updated_at`)
VALUES
    ('dashboard.executive', 'web', NOW(), NOW());

-- 2) Grant it to Super Admin and Admin (by role name).
INSERT IGNORE INTO `role_has_permissions` (`permission_id`, `role_id`)
SELECT p.`id`, r.`id`
FROM `permissions` p
JOIN `roles` r
    ON r.`guard_name` = 'web'
   AND r.`name` IN ('Super Admin', 'Admin')
WHERE p.`guard_name` = 'web'
  AND p.`name` = 'dashboard.executive';

-- 3) IMPORTANT — reset spatie's permission cache so the new permission takes
--    effect immediately. Run the line below ONLY if your CACHE_STORE is the
--    database. If it errors with "table 'cache' doesn't exist", you're on file
--    cache — skip it and instead delete the files under
--    storage/framework/cache/data/ via cPanel File Manager. Steps 1–2 above have
--    already applied regardless. If you do neither, the cache self-expires within
--    24h and the Executive Dashboard appears after that.
DELETE FROM `cache` WHERE `key` LIKE '%spatie.permission.cache%';
