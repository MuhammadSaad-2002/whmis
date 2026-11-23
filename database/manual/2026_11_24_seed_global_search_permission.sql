-- Global Search (Ctrl+K / Cmd+K). Additive and safe to import again.
-- Grants page search to Super Admin and Admin; it does not grant access to any page.
INSERT IGNORE INTO `permissions` (`name`, `guard_name`, `created_at`, `updated_at`)
VALUES ('global-search.use', 'web', NOW(), NOW());

INSERT IGNORE INTO `role_has_permissions` (`permission_id`, `role_id`)
SELECT p.id, r.id
FROM `permissions` p JOIN `roles` r ON r.guard_name = p.guard_name
WHERE p.name = 'global-search.use' AND p.guard_name = 'web'
  AND r.name IN ('Super Admin', 'Admin');

-- After import: php artisan permission:cache-reset
-- Reload the workspace to pick up the updated permissions.
