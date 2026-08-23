-- Manual SEED data: grant the Admin role the `users.manage` permission.
--
-- Use this ONLY if you seed on live by importing SQL in phpMyAdmin instead of
-- running `php artisan db:seed --class=RolePermissionSeeder`. Safe to re-import
-- (idempotent: INSERT IGNORE). NOT a schema migration, so it is not recorded in
-- the `migrations` table.
--
-- Lets the Admin role open and use the Users screen (create/edit/reset/deactivate
-- users). The `users.manage` permission already exists (Super Admin holds every
-- permission); this only adds the Admin grant. Super Admin accounts and the
-- Super Admin role remain hidden from Admins in the application layer
-- (UserController), so no data change is needed for that part.
--
-- The Admin is deliberately NOT granted `roles.manage` — the Roles-definition
-- screen stays Super-Admin-only.

-- 1) Ensure the permission exists (no-op if already present).
INSERT IGNORE INTO `permissions` (`name`, `guard_name`, `created_at`, `updated_at`)
VALUES ('users.manage', 'web', NOW(), NOW());

-- 2) Grant users.manage to the Admin role.
INSERT IGNORE INTO `role_has_permissions` (`permission_id`, `role_id`)
SELECT p.`id`, r.`id`
FROM `permissions` p
JOIN `roles` r
    ON r.`guard_name` = 'web'
   AND r.`name` = 'Admin'
WHERE p.`guard_name` = 'web'
  AND p.`name` = 'users.manage';

-- 3) IMPORTANT — reset spatie's permission cache so the new grant takes effect
--    immediately. Run the line below ONLY if your CACHE_STORE is the database.
--    If it errors with "table 'cache' doesn't exist", you're on file cache — skip
--    it and instead delete the files under storage/framework/cache/data/ via
--    cPanel File Manager. Step 2 above has already applied regardless. If you do
--    neither, the cache self-expires within 24h and the grant takes effect then.
DELETE FROM `cache` WHERE `key` LIKE '%spatie.permission.cache%';
