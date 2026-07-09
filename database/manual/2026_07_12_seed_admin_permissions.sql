-- Manual SEED data for the Admin module (RolePermissionSeeder additions).
--
-- Use this ONLY if you seed on live by importing SQL in phpMyAdmin instead of
-- running `php artisan db:seed --class=RolePermissionSeeder`. Safe to re-import
-- (idempotent: INSERT IGNORE). NOT a schema migration, so it is not recorded in
-- the `migrations` table.
--
-- Adds the two new permissions and grants them so the Administration menu and
-- its routes work:
--   * roles.manage  -> Super Admin            (Roles & Permissions page)
--   * audit.view    -> Super Admin + Admin     (Audit Log page)
-- (users.manage already existed and is already granted to Super Admin.)

-- 1) Create the permissions if they don't exist yet (unique on name+guard_name).
INSERT IGNORE INTO `permissions` (`name`, `guard_name`, `created_at`, `updated_at`)
VALUES
    ('roles.manage', 'web', NOW(), NOW()),
    ('audit.view',   'web', NOW(), NOW());

-- 2) Grant roles.manage + audit.view to the Super Admin role.
INSERT IGNORE INTO `role_has_permissions` (`permission_id`, `role_id`)
SELECT p.`id`, r.`id`
FROM `permissions` p
JOIN `roles` r ON r.`name` = 'Super Admin' AND r.`guard_name` = 'web'
WHERE p.`guard_name` = 'web' AND p.`name` IN ('roles.manage', 'audit.view');

-- 3) Grant audit.view to the Admin role.
INSERT IGNORE INTO `role_has_permissions` (`permission_id`, `role_id`)
SELECT p.`id`, r.`id`
FROM `permissions` p
JOIN `roles` r ON r.`name` = 'Admin' AND r.`guard_name` = 'web'
WHERE p.`guard_name` = 'web' AND p.`name` = 'audit.view';

-- 4) IMPORTANT — reset spatie's permission cache so the new permissions take
--    effect immediately. Run the line below ONLY if your CACHE_STORE is the
--    database. If it errors with "table 'cache' doesn't exist", you're on file
--    cache — skip it and instead delete the files under
--    storage/framework/cache/data/ via cPanel File Manager. Steps 1–3 above have
--    already applied regardless. If you do neither, the cache self-expires within
--    24h and the Administration menu appears after that.
DELETE FROM `cache` WHERE `key` LIKE '%spatie.permission.cache%';
