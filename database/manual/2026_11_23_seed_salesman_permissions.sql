-- Additive and rerunnable; no existing users are automatically assigned the Salesman role.
INSERT IGNORE INTO `roles` (`name`, `guard_name`, `created_at`, `updated_at`)
VALUES ('Salesman', 'web', NOW(), NOW());

INSERT IGNORE INTO `permissions` (`name`, `guard_name`, `created_at`, `updated_at`)
VALUES ('dispatch.assigned', 'web', NOW(), NOW()), ('dispatch.plan', 'web', NOW(), NOW());

INSERT IGNORE INTO `role_has_permissions` (`permission_id`, `role_id`)
SELECT p.id, r.id FROM permissions p JOIN roles r ON r.guard_name = p.guard_name
WHERE p.guard_name = 'web' AND (
    (r.name = 'Salesman' AND p.name = 'dispatch.assigned')
    OR (r.name IN ('Super Admin', 'Admin') AND p.name = 'dispatch.plan')
);
-- After import: php artisan permission:cache-reset
