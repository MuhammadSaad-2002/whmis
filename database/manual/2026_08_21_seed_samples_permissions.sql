-- Manual SEED data for the Samples module (RolePermissionSeeder additions).
--
-- Use this ONLY if you seed on live by importing SQL in phpMyAdmin instead of
-- running `php artisan db:seed --class=RolePermissionSeeder`. Safe to re-import
-- (idempotent: INSERT IGNORE). NOT a schema migration, so it is not recorded in
-- the `migrations` table. Run 2026_08_21_add_samples_module.sql (the schema)
-- first.
--
-- Adds the five samples permissions and grants them so the Samples menu and its
-- routes work:
--   * samples.view / receive / issue / post / cancel
--       -> Super Admin, Admin, and Warehouse Staff
-- (matches RolePermissionSeeder: Booker/Accountant get no samples access.)

-- 1) Create the permissions if they don't exist yet (unique on name+guard_name).
INSERT IGNORE INTO `permissions` (`name`, `guard_name`, `created_at`, `updated_at`)
VALUES
    ('samples.view',    'web', NOW(), NOW()),
    ('samples.receive', 'web', NOW(), NOW()),
    ('samples.issue',   'web', NOW(), NOW()),
    ('samples.post',    'web', NOW(), NOW()),
    ('samples.cancel',  'web', NOW(), NOW());

-- 2) Grant all five to Super Admin, Admin and Warehouse Staff (by role name).
INSERT IGNORE INTO `role_has_permissions` (`permission_id`, `role_id`)
SELECT p.`id`, r.`id`
FROM `permissions` p
JOIN `roles` r
    ON r.`guard_name` = 'web'
   AND r.`name` IN ('Super Admin', 'Admin', 'Warehouse Staff')
WHERE p.`guard_name` = 'web'
  AND p.`name` IN ('samples.view', 'samples.receive', 'samples.issue', 'samples.post', 'samples.cancel');

-- 3) IMPORTANT — reset spatie's permission cache so the new permissions take
--    effect immediately. Run the line below ONLY if your CACHE_STORE is the
--    database. If it errors with "table 'cache' doesn't exist", you're on file
--    cache — skip it and instead delete the files under
--    storage/framework/cache/data/ via cPanel File Manager. Steps 1–2 above have
--    already applied regardless. If you do neither, the cache self-expires within
--    24h and the Samples menu appears after that.
DELETE FROM `cache` WHERE `key` LIKE '%spatie.permission.cache%';
