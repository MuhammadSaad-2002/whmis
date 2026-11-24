-- Existing installs: revoke only commission grants on the Booker and Salesman web roles.
-- Safe to rerun. Admin grants and all commission, payroll, and accounting records are unchanged.
DELETE FROM `role_has_permissions`
WHERE `role_id` IN (
    SELECT `id` FROM `roles` WHERE `guard_name` = 'web' AND `name` IN ('Booker', 'Salesman')
)
AND `permission_id` IN (
    SELECT `id` FROM `permissions` WHERE `guard_name` = 'web' AND `name` IN ('commission.self', 'commission.manage', 'commission.waive')
);

-- After import: php artisan permission:cache-reset
-- Reload the workspace. No need to rerun the distribution finance seed SQL.
