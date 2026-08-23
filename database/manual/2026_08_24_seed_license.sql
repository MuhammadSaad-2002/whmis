-- Manual SEED data for the Licensing feature.
--
-- Use this ONLY if you seed on live by importing SQL in phpMyAdmin instead of
-- running `php artisan db:seed`. Safe to re-import (idempotent). NOT a schema
-- migration — run `php artisan migrate` first so the `licenses` table exists.
--
-- Grants the two license permissions to the Super Admin role ONLY (Admins must
-- never see or manage licensing), and seeds an initial one-month license so the
-- install is not instantly locked out. Renew from the License screen thereafter.

-- 1) Create the permissions if they don't exist yet (unique on name+guard_name).
INSERT IGNORE INTO `permissions` (`name`, `guard_name`, `created_at`, `updated_at`)
VALUES
    ('license.view',   'web', NOW(), NOW()),
    ('license.manage', 'web', NOW(), NOW());

-- 2) Grant both to Super Admin ONLY.
INSERT IGNORE INTO `role_has_permissions` (`permission_id`, `role_id`)
SELECT p.`id`, r.`id`
FROM `permissions` p
JOIN `roles` r
    ON r.`guard_name` = 'web'
   AND r.`name` = 'Super Admin'
WHERE p.`guard_name` = 'web'
  AND p.`name` IN ('license.view', 'license.manage');

-- 3) Seed an initial one-month license ONLY if the table is currently empty.
INSERT INTO `licenses` (`key`, `expires_at`, `activated_at`, `activated_by`, `notes`, `created_at`, `updated_at`)
SELECT CONCAT('WHMIS-', UPPER(SUBSTRING(MD5(RAND()), 1, 4)), '-', UPPER(SUBSTRING(MD5(RAND()), 1, 4)), '-', UPPER(SUBSTRING(MD5(RAND()), 1, 4))),
       DATE_ADD(NOW(), INTERVAL 1 MONTH), NOW(), NULL, 'Initial license (seeded).', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `licenses`);

-- 4) IMPORTANT — reset spatie's permission cache so the new permissions take
--    effect immediately. Run the line below ONLY if your CACHE_STORE is the
--    database. If it errors with "table 'cache' doesn't exist", you're on file
--    cache — skip it and instead delete the files under
--    storage/framework/cache/data/ via cPanel File Manager. Steps 1–3 above have
--    already applied regardless. If you do neither, the cache self-expires within
--    24h and the new gating takes effect after that.
DELETE FROM `cache` WHERE `key` LIKE '%spatie.permission.cache%';
